package ai.offgridmobile.spen

import android.content.Context
import android.hardware.input.InputManager
import android.os.Build
import android.view.InputDevice
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

sealed class SpenInputState {
    data object Idle : SpenInputState()
    data class Writing(val partialText: String) : SpenInputState()
    data class Committed(val text: String) : SpenInputState()
    data class Error(val message: String) : SpenInputState()
}

/** Events from Samsung S Pen Air Action remote button. */
sealed class AirActionEvent {
    data object Click : AirActionEvent()
    data object DoubleClick : AirActionEvent()
    data object SwipeUp : AirActionEvent()
    data object SwipeDown : AirActionEvent()
    data object SwipeLeft : AirActionEvent()
    data object SwipeRight : AirActionEvent()
}

/**
 * Service-layer singleton for Samsung S Pen input.
 *
 * Recognition path (in priority order):
 *  1. Android 13+ stylus handwriting — the UI layer calls
 *     [InputMethodManager.startStylusHandwriting(view)] when a stylus hover is detected.
 *     The active IME (Samsung Keyboard or AOSP keyboard) handles recognition and injects
 *     text into the focused TextField through the normal InputConnection. The UI then calls
 *     [onHandwritingCommitted] to update our state so the rest of the app knows a commit
 *     happened via S Pen rather than keyboard.
 *  2. Samsung SpenRemote SDK for Air Action button events (BLE remote). Integrated via
 *     reflection so the app does not crash on non-Samsung devices or when the SDK is absent.
 *
 * Samsung SpenRemote SDK dependency (add to build.gradle once coordinates verified):
 *   implementation("com.samsung.android.sdk:samsung-android-sdk-spen-remote:1.0.0")
 *   maven { url "https://developer.samsung.com/sdkDownload/sapen" }
 */
@Singleton
class SpenInputModule @Inject constructor(
    @ApplicationContext private val context: Context,
) : InputManager.InputDeviceListener {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val inputManager: InputManager =
        context.getSystemService(Context.INPUT_SERVICE) as InputManager

    private val _state = MutableStateFlow<SpenInputState>(SpenInputState.Idle)
    val state: StateFlow<SpenInputState> = _state.asStateFlow()

    private val _isStylusConnected = MutableStateFlow(false)
    val isStylusConnected: StateFlow<Boolean> = _isStylusConnected.asStateFlow()

    private val _airActionEvents = MutableSharedFlow<AirActionEvent>(extraBufferCapacity = 8)
    val airActionEvents: SharedFlow<AirActionEvent> = _airActionEvents.asSharedFlow()

    init {
        inputManager.registerInputDeviceListener(this, null)
        _isStylusConnected.value = detectStylusDevice()
        if (isSamsungDevice()) {
            scope.launch(Dispatchers.Main) { initSamsungSpenRemoteReflective() }
        }
    }

    /** Returns true when at least one SOURCE_STYLUS device is registered with the OS. */
    private fun detectStylusDevice(): Boolean =
        InputDevice.getDeviceIds().any { id ->
            InputDevice.getDevice(id)?.supportsSource(InputDevice.SOURCE_STYLUS) == true
        }

    private fun isSamsungDevice(): Boolean =
        Build.MANUFACTURER.equals("samsung", ignoreCase = true)

    /**
     * Attempt to connect Samsung SpenRemote for Air Action button events.
     *
     * The SDK ships as an optional Samsung device feature. We use reflection so the
     * app still runs on AOSP devices. If the SDK is on the classpath (after adding
     * the dependency above), full typed calls replace this once the coordinates are
     * confirmed from the Galaxy SDK portal.
     *
     * Air Action mappings:
     *  Single click  → [AirActionEvent.Click]   — used by ChatScreen to send message
     *  Double click  → [AirActionEvent.DoubleClick]
     *  Swipe up/down → [AirActionEvent.SwipeUp] / [AirActionEvent.SwipeDown]
     */
    private fun initSamsungSpenRemoteReflective() {
        try {
            // Step 1: get SpenRemote singleton
            val spenRemoteClass = Class.forName("com.samsung.android.sdk.pen.SpenRemote")
            val getInstance = spenRemoteClass.getMethod("getInstance")
            val spenRemote = getInstance.invoke(null) ?: return

            // Step 2: check button feature is enabled on this device
            val featureTypeButton = 1 // SpenRemote.FEATURE_TYPE_BUTTON
            val isFeatureEnabled = spenRemoteClass
                .getMethod("isFeatureEnabled", Int::class.javaPrimitiveType)
            val enabled = isFeatureEnabled.invoke(spenRemote, featureTypeButton) as? Boolean ?: false
            if (!enabled) return

            // Step 3: subscribe to button events via event listener
            // SpenRemote.SpenEventListener interface { onEvent(SpenEvent) }
            // We use a dynamic proxy via reflection.
            val eventListenerClass =
                Class.forName("com.samsung.android.sdk.pen.SpenRemote\$SpenEventListener")
            val proxy = java.lang.reflect.Proxy.newProxyInstance(
                eventListenerClass.classLoader,
                arrayOf(eventListenerClass),
            ) { _, method, args ->
                if (method.name == "onEvent") {
                    val event = args?.getOrNull(0) ?: return@newProxyInstance null
                    handleSpenEvent(event)
                }
                null
            }

            val registerMethod = spenRemoteClass.getMethod(
                "registerSpenEventListener",
                eventListenerClass,
                Int::class.javaPrimitiveType,
            )
            registerMethod.invoke(spenRemote, proxy, featureTypeButton)
        } catch (_: ClassNotFoundException) {
            // Samsung SpenRemote SDK not on classpath — Air Actions unavailable
        } catch (_: Exception) {
            // SDK present but this device/firmware version behaves unexpectedly
        }
    }

    private fun handleSpenEvent(event: Any) {
        try {
            val getAction = event.javaClass.getMethod("getAction")
            val action = getAction.invoke(event) as? Int ?: return
            // Action constants from SpenEvent: 0=CLICK, 1=DOUBLE_CLICK, 2=SWIPE_UP,
            // 3=SWIPE_DOWN, 4=SWIPE_LEFT, 5=SWIPE_RIGHT
            val airAction = when (action) {
                0 -> AirActionEvent.Click
                1 -> AirActionEvent.DoubleClick
                2 -> AirActionEvent.SwipeUp
                3 -> AirActionEvent.SwipeDown
                4 -> AirActionEvent.SwipeLeft
                5 -> AirActionEvent.SwipeRight
                else -> return
            }
            scope.launch { _airActionEvents.emit(airAction) }
        } catch (_: Exception) {
            // Ignore malformed events
        }
    }

    // ── Public API called by the UI layer ─────────────────────────────────────

    /**
     * Called by ChatScreen's TextInputService callback (or an InputConnection wrapper)
     * once the IME commits recognized handwriting text into the focused field.
     * Updates our state so other observers (e.g. teal pen icon) know input mode.
     */
    fun onHandwritingCommitted(text: String) {
        _state.value = SpenInputState.Committed(text)
    }

    /**
     * Called when the IME reports a partial recognition candidate while the user
     * is still writing — useful for showing partial text in a floating preview.
     */
    fun onHandwritingPartial(partialText: String) {
        _state.value = SpenInputState.Writing(partialText)
    }

    /** Reset to Idle after the UI has consumed a [SpenInputState.Committed] event. */
    fun reset() {
        _state.value = SpenInputState.Idle
    }

    fun reportError(message: String) {
        _state.value = SpenInputState.Error(message)
    }

    // ── InputManager.InputDeviceListener ─────────────────────────────────────

    override fun onInputDeviceAdded(deviceId: Int) {
        _isStylusConnected.value = detectStylusDevice()
    }

    override fun onInputDeviceRemoved(deviceId: Int) {
        _isStylusConnected.value = detectStylusDevice()
    }

    override fun onInputDeviceChanged(deviceId: Int) {
        _isStylusConnected.value = detectStylusDevice()
    }
}
