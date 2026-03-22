package ai.offgridmobile.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ai.offgridmobile.R
import ai.offgridmobile.inference.InferenceBackend
import ai.offgridmobile.ui.theme.OledBlack
import ai.offgridmobile.ui.theme.OledSurface
import ai.offgridmobile.ui.theme.TealPrimary
import ai.offgridmobile.ui.viewmodels.SettingsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val confirmVisible by viewModel.clearHistoryConfirmVisible.collectAsStateWithLifecycle()

    Scaffold(
        containerColor = OledBlack,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_title)) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = OledBlack,
                    titleContentColor = MaterialTheme.colorScheme.onBackground,
                ),
            )
        },
    ) { innerPadding ->
        when (val state = uiState) {
            is SettingsViewModel.SettingsUiState.Loading -> {
                Box(
                    Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = TealPrimary)
                }
            }

            is SettingsViewModel.SettingsUiState.Error -> {
                Box(
                    Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(state.message, color = MaterialTheme.colorScheme.error)
                }
            }

            is SettingsViewModel.SettingsUiState.Success -> {
                SettingsContent(
                    settings = state.settings,
                    isVulkanSupported = viewModel.vulkanConfig.isVulkanSupported,
                    isAdreno740 = viewModel.vulkanConfig.isAdreno740,
                    devicePreferredBackend = viewModel.vulkanConfig.preferredBackend,
                    onThreadCountChange = viewModel::updateThreadCount,
                    onContextLengthChange = viewModel::updateContextLength,
                    onTemperatureChange = viewModel::updateTemperature,
                    onTopPChange = viewModel::updateTopP,
                    onInferenceBackendChange = viewModel::updateInferenceBackend,
                    onClearHistory = viewModel::requestClearHistory,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                )
            }
        }
    }

    if (confirmVisible) {
        ClearHistoryDialog(
            onConfirm = viewModel::confirmClearHistory,
            onDismiss = viewModel::dismissClearHistory,
        )
    }
}

@Composable
private fun SettingsContent(
    settings: SettingsViewModel.AppSettings,
    isVulkanSupported: Boolean,
    isAdreno740: Boolean,
    devicePreferredBackend: InferenceBackend,
    onThreadCountChange: (Int) -> Unit,
    onContextLengthChange: (Int) -> Unit,
    onTemperatureChange: (Float) -> Unit,
    onTopPChange: (Float) -> Unit,
    onInferenceBackendChange: (InferenceBackend) -> Unit,
    onClearHistory: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        SectionHeader(stringResource(R.string.settings_inference_section))

        // Inference backend selector
        InferenceBackendSetting(
            currentBackend = settings.inferenceBackend,
            isVulkanSupported = isVulkanSupported,
            isAdreno740 = isAdreno740,
            devicePreferred = devicePreferredBackend,
            onBackendChange = onInferenceBackendChange,
        )

        Spacer(Modifier.height(4.dp))

        IntSliderSetting(
            label = stringResource(R.string.settings_thread_count),
            value = settings.threadCount,
            formatValue = { stringResource(R.string.settings_thread_count_value, it) },
            range = 1..8,
            onValueChange = onThreadCountChange,
        )

        ContextLengthSetting(
            currentValue = settings.contextLength,
            onValueChange = onContextLengthChange,
        )

        FloatSliderSetting(
            label = stringResource(R.string.settings_temperature),
            value = settings.temperature,
            formatValue = { stringResource(R.string.settings_temperature_value, it) },
            range = 0f..2f,
            steps = 19,
            onValueChange = onTemperatureChange,
        )

        FloatSliderSetting(
            label = stringResource(R.string.settings_top_p),
            value = settings.topP,
            formatValue = { stringResource(R.string.settings_top_p_value, it) },
            range = 0f..1f,
            steps = 9,
            onValueChange = onTopPChange,
        )

        Spacer(Modifier.height(8.dp))
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Spacer(Modifier.height(8.dp))

        SectionHeader(stringResource(R.string.settings_data_section))

        OutlinedButton(
            onClick = onClearHistory,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.outlinedButtonColors(
                contentColor = MaterialTheme.colorScheme.error,
            ),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.5f)),
        ) {
            Text(stringResource(R.string.settings_clear_history))
        }

        Spacer(Modifier.height(88.dp))
    }
}

// ── Inference backend selector ────────────────────────────────────────────────

@Composable
private fun InferenceBackendSetting(
    currentBackend: InferenceBackend,
    isVulkanSupported: Boolean,
    isAdreno740: Boolean,
    devicePreferred: InferenceBackend,
    onBackendChange: (InferenceBackend) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                stringResource(R.string.settings_inference_backend),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onBackground,
            )
            if (isVulkanSupported) {
                Text(
                    text = stringResource(
                        R.string.settings_inference_backend_device_supports,
                        if (isAdreno740) "Adreno 740 · Vulkan 1.3" else "Vulkan"
                    ),
                    style = MaterialTheme.typography.labelSmall,
                    color = TealPrimary,
                )
            }
        }

        Spacer(Modifier.height(6.dp))

        val options: List<Pair<InferenceBackend, Boolean>> = listOf(
            InferenceBackend.Auto to true,
            InferenceBackend.CPU to true,
            InferenceBackend.Vulkan to isVulkanSupported,
            InferenceBackend.QNN to false, // Phase 5
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            options.forEach { (backend, enabled) ->
                FilterChip(
                    selected = currentBackend == backend,
                    onClick = { if (enabled) onBackendChange(backend) },
                    enabled = enabled,
                    label = {
                        Text(
                            text = when (backend) {
                                is InferenceBackend.Auto -> stringResource(R.string.settings_backend_auto)
                                is InferenceBackend.CPU -> stringResource(R.string.settings_backend_cpu)
                                is InferenceBackend.Vulkan -> stringResource(R.string.settings_backend_vulkan)
                                is InferenceBackend.QNN -> stringResource(R.string.settings_backend_qnn)
                            },
                            style = MaterialTheme.typography.labelSmall,
                        )
                    },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = TealPrimary.copy(alpha = 0.2f),
                        selectedLabelColor = TealPrimary,
                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                        labelColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                        disabledLabelColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                    ),
                    border = FilterChipDefaults.filterChipBorder(
                        enabled = enabled,
                        selected = currentBackend == backend,
                        borderColor = MaterialTheme.colorScheme.outline,
                        selectedBorderColor = TealPrimary,
                    ),
                )
            }
        }

        if (currentBackend is InferenceBackend.QNN) {
            Text(
                text = stringResource(R.string.settings_backend_qnn_phase5_note),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

// ── Reusable setting composables ──────────────────────────────────────────────

@Composable
private fun SectionHeader(title: String, modifier: Modifier = Modifier) {
    Text(
        text = title,
        style = MaterialTheme.typography.labelMedium,
        color = TealPrimary,
        modifier = modifier.padding(top = 16.dp, bottom = 4.dp),
    )
}

@Composable
private fun IntSliderSetting(
    label: String,
    value: Int,
    formatValue: @Composable (Int) -> String,
    range: IntRange,
    onValueChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    var sliderValue by rememberSaveable(value) { mutableIntStateOf(value) }

    Column(modifier = modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onBackground)
            Text(formatValue(sliderValue), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Slider(
            value = sliderValue.toFloat(),
            onValueChange = { sliderValue = it.toInt() },
            onValueChangeFinished = { onValueChange(sliderValue) },
            valueRange = range.first.toFloat()..range.last.toFloat(),
            steps = range.last - range.first - 1,
            colors = SliderDefaults.colors(
                thumbColor = TealPrimary,
                activeTrackColor = TealPrimary,
                inactiveTrackColor = MaterialTheme.colorScheme.outlineVariant,
            ),
        )
    }
}

@Composable
private fun FloatSliderSetting(
    label: String,
    value: Float,
    formatValue: @Composable (Float) -> String,
    range: ClosedFloatingPointRange<Float>,
    steps: Int,
    onValueChange: (Float) -> Unit,
    modifier: Modifier = Modifier,
) {
    var sliderValue by rememberSaveable(value) { mutableFloatStateOf(value) }

    Column(modifier = modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onBackground)
            Text(formatValue(sliderValue), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Slider(
            value = sliderValue,
            onValueChange = { sliderValue = it },
            onValueChangeFinished = { onValueChange(sliderValue) },
            valueRange = range,
            steps = steps,
            colors = SliderDefaults.colors(
                thumbColor = TealPrimary,
                activeTrackColor = TealPrimary,
                inactiveTrackColor = MaterialTheme.colorScheme.outlineVariant,
            ),
        )
    }
}

private val contextLengthOptions = listOf(512, 1024, 2048, 4096, 8192, 16384, 32768)

@Composable
private fun ContextLengthSetting(
    currentValue: Int,
    onValueChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val index = contextLengthOptions.indexOfFirst { it >= currentValue }.coerceAtLeast(0)
    var sliderIndex by rememberSaveable(currentValue) { mutableIntStateOf(index) }

    Column(modifier = modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                stringResource(R.string.settings_context_length),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Text(
                stringResource(R.string.settings_context_length_value, contextLengthOptions[sliderIndex]),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Slider(
            value = sliderIndex.toFloat(),
            onValueChange = { sliderIndex = it.toInt() },
            onValueChangeFinished = { onValueChange(contextLengthOptions[sliderIndex]) },
            valueRange = 0f..(contextLengthOptions.size - 1).toFloat(),
            steps = contextLengthOptions.size - 2,
            colors = SliderDefaults.colors(
                thumbColor = TealPrimary,
                activeTrackColor = TealPrimary,
                inactiveTrackColor = MaterialTheme.colorScheme.outlineVariant,
            ),
        )
    }
}

@Composable
private fun ClearHistoryDialog(
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.settings_clear_history_confirm_title)) },
        text = { Text(stringResource(R.string.settings_clear_history_confirm_body)) },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error,
                    contentColor = MaterialTheme.colorScheme.onError,
                ),
            ) {
                Text(stringResource(R.string.settings_clear_confirm))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.settings_cancel))
            }
        },
        containerColor = OledSurface,
        titleContentColor = MaterialTheme.colorScheme.onBackground,
        textContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}
