package ai.offgridmobile.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ai.offgridmobile.aether.AetherContextBridge
import ai.offgridmobile.aether.AetherSnapshot
import ai.offgridmobile.data.local.entities.Message
import ai.offgridmobile.data.repository.ConversationRepository
import ai.offgridmobile.data.repository.LlamaRepository
import ai.offgridmobile.spen.SpenInputModule
import ai.offgridmobile.spen.SpenInputState
import ai.offgridmobile.tools.ToolDispatcher
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val conversationRepository: ConversationRepository,
    private val llamaRepository: LlamaRepository,
    val spenInputModule: SpenInputModule,
    private val aetherContextBridge: AetherContextBridge,
    private val toolDispatcher: ToolDispatcher,
) : ViewModel() {

    sealed class ChatUiState {
        data object Loading : ChatUiState()
        data class Success(
            val messages: List<Message>,
            val isGenerating: Boolean,
            val streamingText: String,
            val modelName: String?,
        ) : ChatUiState()
        data class Error(val message: String) : ChatUiState()
    }

    private val _uiState = MutableStateFlow<ChatUiState>(ChatUiState.Loading)
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    /** Live RF environment snapshot from AETHER (null when AETHER not installed). */
    val aetherSnapshot: StateFlow<AetherSnapshot?> = aetherContextBridge.snapshotFlow
        .catch { emit(AetherSnapshot(emptyList(), emptyList(), null, emptyList(), java.time.Instant.now())) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** Whether AETHER has data for the context sources indicator. */
    val isAetherActive: StateFlow<Boolean> = MutableStateFlow(false).also { flow ->
        viewModelScope.launch {
            aetherSnapshot.collect { snapshot ->
                flow.value = snapshot != null &&
                    (snapshot.wifiNetworks.isNotEmpty() ||
                        snapshot.bluetoothDevices.isNotEmpty() ||
                        snapshot.cellularInfo != null)
            }
        }
    }.asStateFlow()

    /** S Pen connection state forwarded from [SpenInputModule]. */
    val isStylusConnected: StateFlow<Boolean> = spenInputModule.isStylusConnected

    /** Current S Pen input state — UI observes this to populate the TextField. */
    val spenInputState: StateFlow<SpenInputState> = spenInputModule.state

    private var conversationId: Long = -1L
    private var generationJob: Job? = null

    fun initialize(id: Long) {
        conversationId = id
        observeMessages()
    }

    private fun observeMessages() {
        viewModelScope.launch {
            conversationRepository.getMessages(conversationId).collect { result ->
                result.fold(
                    onSuccess = { messages ->
                        val current = _uiState.value
                        val isGenerating = (current as? ChatUiState.Success)?.isGenerating ?: false
                        val streaming = (current as? ChatUiState.Success)?.streamingText ?: ""
                        val modelName = (current as? ChatUiState.Success)?.modelName
                        _uiState.value = ChatUiState.Success(
                            messages = messages,
                            isGenerating = isGenerating,
                            streamingText = streaming,
                            modelName = modelName,
                        )
                    },
                    onFailure = {
                        _uiState.value = ChatUiState.Error(it.message ?: "Failed to load messages")
                    },
                )
            }
        }
    }

    fun sendMessage(content: String) {
        if (content.isBlank()) return
        viewModelScope.launch {
            conversationRepository.addMessage(conversationId, "user", content)

            val current = _uiState.value
            if (current is ChatUiState.Success) {
                _uiState.value = current.copy(isGenerating = true, streamingText = "")
            }

            generationJob = launch {
                var accumulated = ""
                llamaRepository.tokenStream(content).collect { result ->
                    result.fold(
                        onSuccess = { token ->
                            accumulated += token

                            // Check for tool_use block in accumulated response
                            val toolResult = toolDispatcher.maybeDispatch(accumulated)
                            if (toolResult != null) {
                                // Persist the model's tool call turn
                                conversationRepository.addMessage(
                                    conversationId,
                                    "assistant",
                                    accumulated,
                                )
                                // Inject tool result and continue generation
                                val toolContent = "[tool_result: ${toolResult.toolName}]\n${toolResult.result}"
                                conversationRepository.addMessage(conversationId, "tool", toolContent)
                                accumulated = ""
                                val s = _uiState.value
                                if (s is ChatUiState.Success) {
                                    _uiState.value = s.copy(streamingText = "")
                                }
                                return@collect
                            }

                            val s = _uiState.value
                            if (s is ChatUiState.Success) {
                                _uiState.value = s.copy(streamingText = accumulated)
                            }
                        },
                        onFailure = { err ->
                            _uiState.value = ChatUiState.Error(err.message ?: "Generation failed")
                            return@collect
                        },
                    )
                }

                if (accumulated.isNotEmpty()) {
                    conversationRepository.addMessage(conversationId, "assistant", accumulated)
                }

                val s = _uiState.value
                if (s is ChatUiState.Success) {
                    _uiState.value = s.copy(isGenerating = false, streamingText = "")
                }
            }
        }
    }

    fun stopGeneration() {
        llamaRepository.stopCompletion()
        generationJob?.cancel()
        generationJob = null
        val s = _uiState.value
        if (s is ChatUiState.Success) {
            _uiState.value = s.copy(isGenerating = false, streamingText = "")
        }
    }

    /** Called by ChatScreen when S Pen handwriting commits text into the input field. */
    fun onSpenHandwritingCommitted(text: String) {
        spenInputModule.onHandwritingCommitted(text)
    }

    /** Called by ChatScreen after consuming the Committed state from [spenInputState]. */
    fun resetSpenState() {
        spenInputModule.reset()
    }

    fun dismissError() {
        val current = _uiState.value
        if (current is ChatUiState.Error) {
            _uiState.value = ChatUiState.Success(
                messages = emptyList(),
                isGenerating = false,
                streamingText = "",
                modelName = null,
            )
            observeMessages()
        }
    }
}
