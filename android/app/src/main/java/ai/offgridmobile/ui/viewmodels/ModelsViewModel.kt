package ai.offgridmobile.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ai.offgridmobile.data.local.entities.DownloadedModel
import ai.offgridmobile.data.repository.DownloadUiEvent
import ai.offgridmobile.data.repository.ModelRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DownloadEntry(
    val downloadId: Long,
    val modelId: String,
    val fileName: String,
    val percent: Int,
    val bytesDownloaded: Long,
    val totalBytes: Long,
    val isError: Boolean,
    val errorMessage: String?,
)

@HiltViewModel
class ModelsViewModel @Inject constructor(
    private val modelRepository: ModelRepository,
) : ViewModel() {

    sealed class ModelsUiState {
        data object Loading : ModelsUiState()
        data class Success(
            val models: List<DownloadedModel>,
            val activeDownloads: List<DownloadEntry>,
        ) : ModelsUiState()
        data class Error(val message: String) : ModelsUiState()
    }

    private val _uiState = MutableStateFlow<ModelsUiState>(ModelsUiState.Loading)
    val uiState: StateFlow<ModelsUiState> = _uiState.asStateFlow()

    private val _activeDownloads = MutableStateFlow<List<DownloadEntry>>(emptyList())

    init {
        observeModels()
        observeDownloadEvents()
    }

    private fun observeModels() {
        viewModelScope.launch {
            modelRepository.getModels().collect { result ->
                result.fold(
                    onSuccess = { models ->
                        val downloads = _activeDownloads.value
                        _uiState.value = ModelsUiState.Success(models, downloads)
                    },
                    onFailure = {
                        _uiState.value = ModelsUiState.Error(it.message ?: "Failed to load models")
                    },
                )
            }
        }
    }

    private fun observeDownloadEvents() {
        viewModelScope.launch {
            modelRepository.downloadEvents.collect { event ->
                when (event) {
                    is DownloadUiEvent.Progress -> {
                        val entries = _activeDownloads.value.toMutableList()
                        val idx = entries.indexOfFirst { it.downloadId == event.downloadId }
                        val existing = entries.getOrNull(idx)
                        // Preserve the fileName that was recorded at startDownload time.
                        // Constructing from event fields alone would show modelId in the card.
                        val updated = if (existing != null) {
                            existing.copy(
                                percent = event.percent,
                                bytesDownloaded = event.bytesDownloaded,
                                totalBytes = event.totalBytes,
                                isError = false,
                                errorMessage = null,
                            )
                        } else {
                            DownloadEntry(
                                downloadId = event.downloadId,
                                modelId = event.modelId,
                                fileName = event.modelId,
                                percent = event.percent,
                                bytesDownloaded = event.bytesDownloaded,
                                totalBytes = event.totalBytes,
                                isError = false,
                                errorMessage = null,
                            )
                        }
                        if (idx >= 0) entries[idx] = updated else entries.add(updated)
                        updateDownloads(entries)
                    }

                    is DownloadUiEvent.Complete -> {
                        val entries = _activeDownloads.value.filter {
                            it.downloadId != event.downloadId
                        }
                        updateDownloads(entries)
                    }

                    is DownloadUiEvent.Error -> {
                        val entries = _activeDownloads.value.map {
                            if (it.downloadId == event.downloadId) {
                                it.copy(isError = true, errorMessage = event.reason)
                            } else it
                        }
                        updateDownloads(entries)
                    }
                }
            }
        }
    }

    private fun updateDownloads(entries: List<DownloadEntry>) {
        _activeDownloads.value = entries
        val current = _uiState.value
        if (current is ModelsUiState.Success) {
            _uiState.value = current.copy(activeDownloads = entries)
        }
    }

    fun startDownload(url: String, fileName: String, modelId: String) {
        viewModelScope.launch {
            modelRepository.startDownload(url, fileName, modelId)
                .onSuccess { downloadId ->
                    // Register the entry immediately so the fileName is available when
                    // the first Progress event arrives. Without this, the Progress handler
                    // would have no existing entry to copy from and would fall back to
                    // showing modelId in the card's title.
                    val pending = DownloadEntry(
                        downloadId = downloadId,
                        modelId = modelId,
                        fileName = fileName,
                        percent = 0,
                        bytesDownloaded = 0,
                        totalBytes = 0,
                        isError = false,
                        errorMessage = null,
                    )
                    updateDownloads(_activeDownloads.value + pending)
                }
                .onFailure { err ->
                    val current = _uiState.value
                    if (current is ModelsUiState.Success) {
                        _uiState.value = current.copy(
                            activeDownloads = current.activeDownloads + DownloadEntry(
                                downloadId = -1L,
                                modelId = modelId,
                                fileName = fileName,
                                percent = 0,
                                bytesDownloaded = 0,
                                totalBytes = 0,
                                isError = true,
                                errorMessage = err.message,
                            )
                        )
                    }
                }
        }
    }

    fun cancelDownload(downloadId: Long) {
        viewModelScope.launch {
            modelRepository.cancelDownload(downloadId)
            updateDownloads(_activeDownloads.value.filter { it.downloadId != downloadId })
        }
    }

    fun setActiveModel(model: DownloadedModel) {
        viewModelScope.launch { modelRepository.setActiveModel(model) }
    }

    fun deleteModel(model: DownloadedModel) {
        viewModelScope.launch { modelRepository.deleteModel(model) }
    }

    fun dismissDownloadError(downloadId: Long) {
        updateDownloads(_activeDownloads.value.filter { it.downloadId != downloadId })
    }
}
