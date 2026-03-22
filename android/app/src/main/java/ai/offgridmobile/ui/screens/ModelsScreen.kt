package ai.offgridmobile.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ai.offgridmobile.R
import ai.offgridmobile.data.local.entities.DownloadedModel
import ai.offgridmobile.ui.theme.OledBlack
import ai.offgridmobile.ui.theme.OledSurface
import ai.offgridmobile.ui.theme.OledSurfaceVariant
import ai.offgridmobile.ui.theme.TealPrimary
import ai.offgridmobile.ui.viewmodels.DownloadEntry
import ai.offgridmobile.ui.viewmodels.ModelsViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModelsScreen(
    viewModel: ModelsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    var urlInput by rememberSaveable { mutableStateOf("") }
    var fileNameInput by rememberSaveable { mutableStateOf("") }
    var modelIdInput by rememberSaveable { mutableStateOf("") }

    Scaffold(
        containerColor = OledBlack,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.models_title)) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = OledBlack,
                    titleContentColor = MaterialTheme.colorScheme.onBackground,
                ),
            )
        },
    ) { innerPadding ->
        when (val state = uiState) {
            is ModelsViewModel.ModelsUiState.Loading -> {
                Box(
                    Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = TealPrimary)
                }
            }

            is ModelsViewModel.ModelsUiState.Error -> {
                Box(
                    Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(state.message, color = MaterialTheme.colorScheme.error)
                }
            }

            is ModelsViewModel.ModelsUiState.Success -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    // Active downloads
                    if (state.activeDownloads.isNotEmpty()) {
                        items(state.activeDownloads, key = { "dl_${it.downloadId}" }) { entry ->
                            DownloadProgressCard(
                                entry = entry,
                                onCancel = { viewModel.cancelDownload(entry.downloadId) },
                                onDismissError = { viewModel.dismissDownloadError(entry.downloadId) },
                            )
                        }
                    }

                    // Downloaded model list
                    if (state.models.isEmpty() && state.activeDownloads.isEmpty()) {
                        item {
                            ModelsEmptyState()
                        }
                    } else {
                        items(state.models, key = { "model_${it.id}" }) { model ->
                            ModelCard(
                                model = model,
                                onSetActive = { viewModel.setActiveModel(model) },
                                onDelete = { viewModel.deleteModel(model) },
                            )
                        }
                    }

                    // Download form
                    item {
                        DownloadForm(
                            url = urlInput,
                            fileName = fileNameInput,
                            modelId = modelIdInput,
                            onUrlChange = { urlInput = it },
                            onFileNameChange = { fileNameInput = it },
                            onModelIdChange = { modelIdInput = it },
                            onDownload = {
                                if (urlInput.isNotBlank() && fileNameInput.isNotBlank() && modelIdInput.isNotBlank()) {
                                    viewModel.startDownload(urlInput.trim(), fileNameInput.trim(), modelIdInput.trim())
                                    urlInput = ""
                                    fileNameInput = ""
                                    modelIdInput = ""
                                }
                            },
                        )
                    }

                    item { Spacer(Modifier.height(88.dp)) }
                }
            }
        }
    }
}

@Composable
private fun ModelsEmptyState(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().padding(vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            Icons.Filled.Storage,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.outline,
            modifier = Modifier.size(48.dp),
        )
        Text(
            text = stringResource(R.string.models_empty_title),
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Text(
            text = stringResource(R.string.models_empty_subtitle),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ModelCard(
    model: DownloadedModel,
    onSetActive: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var menuExpanded by rememberSaveable { mutableStateOf(false) }
    val dateStr = SimpleDateFormat("MMM d, yyyy", Locale.getDefault()).format(Date(model.downloadedAt))
    val sizeStr = if (model.sizeBytes > 1_000_000_000) {
        stringResource(R.string.models_size_format, model.sizeBytes / 1_000_000_000.0)
    } else {
        stringResource(R.string.models_size_mb_format, model.sizeBytes / 1_000_000.0)
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = OledSurface),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = model.name,
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.onBackground,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        if (model.isActive) {
                            Spacer(Modifier.size(8.dp))
                            Badge(containerColor = TealPrimary, contentColor = OledBlack) {
                                Text(stringResource(R.string.models_active_badge))
                            }
                        }
                    }
                    Text(
                        text = "${model.quantization} · $sizeStr",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = stringResource(R.string.models_downloaded_at, dateStr),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Box {
                    IconButton(onClick = { menuExpanded = true }) {
                        Icon(
                            Icons.Filled.Storage,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    DropdownMenu(
                        expanded = menuExpanded,
                        onDismissRequest = { menuExpanded = false },
                    ) {
                        if (!model.isActive) {
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.models_set_active)) },
                                leadingIcon = {
                                    Icon(Icons.Filled.CheckCircle, contentDescription = null)
                                },
                                onClick = { onSetActive(); menuExpanded = false },
                            )
                        }
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.models_delete)) },
                            leadingIcon = {
                                Icon(Icons.Filled.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                            },
                            onClick = { onDelete(); menuExpanded = false },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DownloadProgressCard(
    entry: DownloadEntry,
    onCancel: () -> Unit,
    onDismissError: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (entry.isError) MaterialTheme.colorScheme.errorContainer else OledSurface,
        ),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = entry.fileName,
                    style = MaterialTheme.typography.titleSmall,
                    color = if (entry.isError) MaterialTheme.colorScheme.onErrorContainer
                    else MaterialTheme.colorScheme.onBackground,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (entry.isError) {
                    TextButton(onClick = onDismissError) {
                        Text(stringResource(R.string.models_dismiss_error))
                    }
                } else {
                    IconButton(onClick = onCancel) {
                        Icon(
                            Icons.Filled.Close,
                            contentDescription = stringResource(R.string.models_cancel_download),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            if (entry.isError) {
                Text(
                    text = stringResource(R.string.models_download_error, entry.errorMessage ?: ""),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                )
            } else {
                LinearProgressIndicator(
                    progress = { entry.percent / 100f },
                    modifier = Modifier.fillMaxWidth(),
                    color = TealPrimary,
                    trackColor = OledSurfaceVariant,
                )
                Text(
                    text = stringResource(R.string.models_download_progress, entry.percent),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun DownloadForm(
    url: String,
    fileName: String,
    modelId: String,
    onUrlChange: (String) -> Unit,
    onFileNameChange: (String) -> Unit,
    onModelIdChange: (String) -> Unit,
    onDownload: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val textFieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = TealPrimary,
        unfocusedBorderColor = MaterialTheme.colorScheme.outline,
        cursorColor = TealPrimary,
        focusedTextColor = MaterialTheme.colorScheme.onSurface,
        unfocusedTextColor = MaterialTheme.colorScheme.onSurface,
    )

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = OledSurface),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Download, contentDescription = null, tint = TealPrimary)
                Spacer(Modifier.size(8.dp))
                Text(
                    text = stringResource(R.string.models_add_model_title),
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onBackground,
                )
            }
            OutlinedTextField(
                value = url,
                onValueChange = onUrlChange,
                label = { Text(stringResource(R.string.models_download_url_hint)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                colors = textFieldColors,
            )
            OutlinedTextField(
                value = fileName,
                onValueChange = onFileNameChange,
                label = { Text(stringResource(R.string.models_filename_hint)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                colors = textFieldColors,
            )
            OutlinedTextField(
                value = modelId,
                onValueChange = onModelIdChange,
                label = { Text(stringResource(R.string.models_model_id_hint)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                colors = textFieldColors,
            )
            Button(
                onClick = onDownload,
                modifier = Modifier.fillMaxWidth(),
                enabled = url.isNotBlank() && fileName.isNotBlank() && modelId.isNotBlank(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = TealPrimary,
                    contentColor = OledBlack,
                    disabledContainerColor = OledSurfaceVariant,
                    disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                ),
            ) {
                Text(stringResource(R.string.models_download_button))
            }
        }
    }
}
