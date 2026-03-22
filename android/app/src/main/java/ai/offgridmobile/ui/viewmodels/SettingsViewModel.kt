package ai.offgridmobile.ui.viewmodels

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ai.offgridmobile.data.repository.ConversationRepository
import ai.offgridmobile.inference.InferenceBackend
import ai.offgridmobile.inference.VulkanConfig
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val dataStore: DataStore<Preferences>,
    private val conversationRepository: ConversationRepository,
    val vulkanConfig: VulkanConfig,
) : ViewModel() {

    data class AppSettings(
        val threadCount: Int = 4,
        val contextLength: Int = 2048,
        val temperature: Float = 0.7f,
        val topP: Float = 0.9f,
        val inferenceBackend: InferenceBackend = InferenceBackend.Auto,
    )

    sealed class SettingsUiState {
        data object Loading : SettingsUiState()
        data class Success(val settings: AppSettings) : SettingsUiState()
        data class Error(val message: String) : SettingsUiState()
    }

    private object Keys {
        val THREAD_COUNT = intPreferencesKey("thread_count")
        val CONTEXT_LENGTH = intPreferencesKey("context_length")
        val TEMPERATURE = floatPreferencesKey("temperature")
        val TOP_P = floatPreferencesKey("top_p")
        val INFERENCE_BACKEND = stringPreferencesKey("inference_backend")
    }

    private val _uiState = MutableStateFlow<SettingsUiState>(SettingsUiState.Loading)
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    private val _clearHistoryConfirmVisible = MutableStateFlow(false)
    val clearHistoryConfirmVisible: StateFlow<Boolean> = _clearHistoryConfirmVisible.asStateFlow()

    init {
        loadSettings()
    }

    private fun loadSettings() {
        viewModelScope.launch {
            dataStore.data
                .map { prefs ->
                    AppSettings(
                        threadCount = prefs[Keys.THREAD_COUNT] ?: 4,
                        contextLength = prefs[Keys.CONTEXT_LENGTH] ?: 2048,
                        temperature = prefs[Keys.TEMPERATURE] ?: 0.7f,
                        topP = prefs[Keys.TOP_P] ?: 0.9f,
                        inferenceBackend = InferenceBackend.fromKey(
                            prefs[Keys.INFERENCE_BACKEND] ?: "auto"
                        ),
                    )
                }
                .catch { emit(AppSettings()) }
                .collect { _uiState.value = SettingsUiState.Success(it) }
        }
    }

    fun updateThreadCount(value: Int) {
        viewModelScope.launch {
            dataStore.edit { it[Keys.THREAD_COUNT] = value.coerceIn(1, 8) }
        }
    }

    fun updateContextLength(value: Int) {
        viewModelScope.launch {
            dataStore.edit { it[Keys.CONTEXT_LENGTH] = value }
        }
    }

    fun updateTemperature(value: Float) {
        viewModelScope.launch {
            dataStore.edit { it[Keys.TEMPERATURE] = value.coerceIn(0f, 2f) }
        }
    }

    fun updateTopP(value: Float) {
        viewModelScope.launch {
            dataStore.edit { it[Keys.TOP_P] = value.coerceIn(0f, 1f) }
        }
    }

    fun updateInferenceBackend(backend: InferenceBackend) {
        viewModelScope.launch {
            dataStore.edit { it[Keys.INFERENCE_BACKEND] = backend.key }
        }
    }

    fun requestClearHistory() {
        _clearHistoryConfirmVisible.value = true
    }

    fun dismissClearHistory() {
        _clearHistoryConfirmVisible.value = false
    }

    fun confirmClearHistory() {
        viewModelScope.launch {
            conversationRepository.deleteAllConversations()
            _clearHistoryConfirmVisible.value = false
        }
    }
}
