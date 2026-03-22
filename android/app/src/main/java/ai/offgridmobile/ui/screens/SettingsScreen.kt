package ai.offgridmobile.ui.screens

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
                    onThreadCountChange = viewModel::updateThreadCount,
                    onContextLengthChange = viewModel::updateContextLength,
                    onTemperatureChange = viewModel::updateTemperature,
                    onTopPChange = viewModel::updateTopP,
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
    onThreadCountChange: (Int) -> Unit,
    onContextLengthChange: (Int) -> Unit,
    onTemperatureChange: (Float) -> Unit,
    onTopPChange: (Float) -> Unit,
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

        IntSliderSetting(
            label = stringResource(R.string.settings_thread_count),
            value = settings.threadCount,
            valueLabel = stringResource(R.string.settings_thread_count_value, settings.threadCount),
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
            valueLabel = stringResource(R.string.settings_temperature_value, settings.temperature),
            range = 0f..2f,
            steps = 19,
            onValueChange = onTemperatureChange,
        )

        FloatSliderSetting(
            label = stringResource(R.string.settings_top_p),
            value = settings.topP,
            valueLabel = stringResource(R.string.settings_top_p_value, settings.topP),
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
            border = androidx.compose.foundation.BorderStroke(
                1.dp,
                MaterialTheme.colorScheme.error.copy(alpha = 0.5f),
            ),
        ) {
            Text(stringResource(R.string.settings_clear_history))
        }

        Spacer(Modifier.height(88.dp))
    }
}

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
    valueLabel: String,
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
            Text(valueLabel, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
    valueLabel: String,
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
            Text(valueLabel, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
    val index = contextLengthOptions.indexOfFirst { it >= currentValue }
        .coerceAtLeast(0)
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
