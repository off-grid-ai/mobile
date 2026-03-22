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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ai.offgridmobile.R
import ai.offgridmobile.data.local.entities.Message
import ai.offgridmobile.ui.theme.OledBlack
import ai.offgridmobile.ui.theme.OledSurface
import ai.offgridmobile.ui.theme.OledSurfaceVariant
import ai.offgridmobile.ui.theme.TealPrimary
import ai.offgridmobile.ui.theme.TealDark
import ai.offgridmobile.ui.viewmodels.ChatViewModel
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    conversationId: Long,
    onNavigateBack: () -> Unit,
    viewModel: ChatViewModel = hiltViewModel(),
) {
    LaunchedEffect(conversationId) {
        viewModel.initialize(conversationId)
    }

    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()

    // Scroll to bottom whenever messages change or streaming text updates
    LaunchedEffect(uiState) {
        val state = uiState
        if (state is ChatViewModel.ChatUiState.Success) {
            val itemCount = state.messages.size + if (state.streamingText.isNotEmpty()) 1 else 0
            if (itemCount > 0) {
                scope.launch { listState.animateScrollToItem(itemCount - 1) }
            }
        }
    }

    // Show errors in snackbar
    LaunchedEffect(uiState) {
        if (uiState is ChatViewModel.ChatUiState.Error) {
            val msg = (uiState as ChatViewModel.ChatUiState.Error).message
            snackbarHostState.showSnackbar(msg)
            viewModel.dismissError()
        }
    }

    Scaffold(
        containerColor = OledBlack,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    val modelName = (uiState as? ChatViewModel.ChatUiState.Success)?.modelName
                    Text(
                        text = modelName ?: stringResource(R.string.chat_no_model),
                        style = MaterialTheme.typography.titleMedium,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.chat_navigate_back),
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = OledBlack,
                    titleContentColor = MaterialTheme.colorScheme.onBackground,
                    navigationIconContentColor = MaterialTheme.colorScheme.onBackground,
                ),
            )
        },
    ) { innerPadding ->
        when (val state = uiState) {
            is ChatViewModel.ChatUiState.Loading -> {
                Box(
                    Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = TealPrimary)
                }
            }

            is ChatViewModel.ChatUiState.Error -> {
                Box(
                    Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(state.message, color = MaterialTheme.colorScheme.error)
                }
            }

            is ChatViewModel.ChatUiState.Success -> {
                ChatContent(
                    state = state,
                    listState = listState,
                    onSend = { viewModel.sendMessage(it) },
                    onStop = { viewModel.stopGeneration() },
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                        .imePadding()
                        .navigationBarsPadding(),
                )
            }
        }
    }
}

@Composable
private fun ChatContent(
    state: ChatViewModel.ChatUiState.Success,
    listState: androidx.compose.foundation.lazy.LazyListState,
    onSend: (String) -> Unit,
    onStop: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var inputText by rememberSaveable { mutableStateOf("") }

    Column(modifier = modifier) {
        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            state = listState,
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(state.messages, key = { it.id }) { message ->
                MessageBubble(message = message)
            }
            // Streaming assistant token display
            if (state.streamingText.isNotEmpty()) {
                item(key = "streaming") {
                    StreamingBubble(text = state.streamingText)
                }
            }
            // Thinking indicator when generating but no tokens yet
            if (state.isGenerating && state.streamingText.isEmpty()) {
                item(key = "thinking") {
                    ThinkingBubble()
                }
            }
        }

        ChatInputBar(
            text = inputText,
            onTextChange = { inputText = it },
            isGenerating = state.isGenerating,
            onSend = {
                if (inputText.isNotBlank()) {
                    onSend(inputText.trim())
                    inputText = ""
                }
            },
            onStop = onStop,
        )
    }
}

@Composable
private fun MessageBubble(message: Message, modifier: Modifier = Modifier) {
    val isUser = message.role == "user"
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 300.dp)
                .clip(
                    RoundedCornerShape(
                        topStart = 16.dp,
                        topEnd = 16.dp,
                        bottomStart = if (isUser) 16.dp else 4.dp,
                        bottomEnd = if (isUser) 4.dp else 16.dp,
                    )
                )
                .background(if (isUser) TealDark else OledSurfaceVariant)
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            Text(
                text = message.content,
                style = MaterialTheme.typography.bodyMedium,
                color = if (isUser) OledBlack else MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

@Composable
private fun StreamingBubble(text: String, modifier: Modifier = Modifier) {
    Row(modifier = modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Start) {
        Box(
            modifier = Modifier
                .widthIn(max = 300.dp)
                .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomEnd = 16.dp, bottomStart = 4.dp))
                .background(OledSurfaceVariant)
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            Text(
                text = text,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

@Composable
private fun ThinkingBubble(modifier: Modifier = Modifier) {
    Row(modifier = modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Start) {
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomEnd = 16.dp, bottomStart = 4.dp))
                .background(OledSurfaceVariant)
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(12.dp),
                    color = TealPrimary,
                    strokeWidth = 2.dp,
                )
                Text(
                    text = stringResource(R.string.chat_thinking),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun ChatInputBar(
    text: String,
    onTextChange: (String) -> Unit,
    isGenerating: Boolean,
    onSend: () -> Unit,
    onStop: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = OledSurface,
        tonalElevation = 2.dp,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = text,
                onValueChange = onTextChange,
                modifier = Modifier.weight(1f),
                placeholder = { Text(stringResource(R.string.chat_input_hint)) },
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Sentences,
                    imeAction = ImeAction.Send,
                ),
                keyboardActions = KeyboardActions(onSend = { onSend() }),
                maxLines = 6,
                enabled = !isGenerating,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = TealPrimary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outline,
                    cursorColor = TealPrimary,
                    focusedTextColor = MaterialTheme.colorScheme.onSurface,
                    unfocusedTextColor = MaterialTheme.colorScheme.onSurface,
                ),
            )
            Spacer(Modifier.size(8.dp))
            if (isGenerating) {
                IconButton(onClick = onStop) {
                    Icon(
                        Icons.Filled.Stop,
                        contentDescription = stringResource(R.string.chat_stop),
                        tint = MaterialTheme.colorScheme.error,
                    )
                }
            } else {
                IconButton(
                    onClick = onSend,
                    enabled = text.isNotBlank(),
                ) {
                    Icon(
                        Icons.AutoMirrored.Filled.Send,
                        contentDescription = stringResource(R.string.chat_send),
                        tint = if (text.isNotBlank()) TealPrimary else MaterialTheme.colorScheme.outline,
                    )
                }
            }
        }
    }
}
