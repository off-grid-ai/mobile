package ai.offgridmobile.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ai.offgridmobile.data.local.entities.Conversation
import ai.offgridmobile.data.repository.ConversationRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val conversationRepository: ConversationRepository,
) : ViewModel() {

    sealed class HomeUiState {
        data object Loading : HomeUiState()
        data class Success(val conversations: List<Conversation>) : HomeUiState()
        data class Error(val message: String) : HomeUiState()
    }

    private val _uiState = MutableStateFlow<HomeUiState>(HomeUiState.Loading)
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        observeConversations()
    }

    private fun observeConversations() {
        viewModelScope.launch {
            conversationRepository.getConversations().collect { result ->
                _uiState.value = result.fold(
                    onSuccess = { HomeUiState.Success(it) },
                    onFailure = { HomeUiState.Error(it.message ?: "Unknown error") },
                )
            }
        }
    }

    fun createConversation(modelId: String? = null, onCreated: (Long) -> Unit) {
        viewModelScope.launch {
            conversationRepository.createConversation("New conversation", modelId)
                .onSuccess { id -> onCreated(id) }
        }
    }

    fun deleteConversation(conversation: Conversation) {
        viewModelScope.launch {
            conversationRepository.deleteConversation(conversation)
        }
    }
}
