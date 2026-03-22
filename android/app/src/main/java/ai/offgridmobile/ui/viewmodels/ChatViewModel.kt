package ai.offgridmobile.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ai.offgridmobile.data.local.entities.Message
import ai.offgridmobile.data.repository.ConversationRepository
import ai.offgridmobile.data.repository.LlamaModelParams
import ai.offgridmobile.data.repository.LlamaRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val conversationRepository: ConversationRepository,
    private val llamaRepository: LlamaRepository,
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
            // Persist the user turn
            conversationRepository.addMessage(conversationId, "user", content)

            val current = _uiState.value
            if (current is ChatUiState.Success) {
                _uiState.value = current.copy(isGenerating = true, streamingText = "")
            }

            // Stream the assistant response
            generationJob = launch {
                var accumulated = ""
                llamaRepository.tokenStream(content).collect { result ->
                    result.fold(
                        onSuccess = { token ->
                            accumulated += token
                            val s = _uiState.value
                            if (s is ChatUiState.Success) {
                                _uiState.value = s.copy(streamingText = accumulated)
                            }
                        },
                        onFailure = { err ->
                            _uiState.value = ChatUiState.Error(
                                err.message ?: "Generation failed"
                            )
                            return@collect
                        },
                    )
                }

                // Persist the assistant turn (only if not cancelled mid-stream)
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
