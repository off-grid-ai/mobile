package ai.offgridmobile.ui.screens

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DismissDirection
import androidx.compose.material3.DismissValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SwipeToDismiss
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDismissState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ai.offgridmobile.R
import ai.offgridmobile.data.local.entities.Conversation
import ai.offgridmobile.ui.theme.OledBlack
import ai.offgridmobile.ui.theme.OledSurface
import ai.offgridmobile.ui.theme.OledSurfaceVariant
import ai.offgridmobile.ui.theme.TealPrimary
import ai.offgridmobile.ui.viewmodels.HomeViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun HomeScreen(
    onConversationClick: (Long) -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        containerColor = OledBlack,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.home_title)) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = OledBlack,
                    titleContentColor = MaterialTheme.colorScheme.onBackground,
                ),
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { viewModel.createConversation { id -> onConversationClick(id) } },
                containerColor = TealPrimary,
                contentColor = OledBlack,
            ) {
                Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.home_new_chat))
            }
        },
    ) { innerPadding ->
        when (val state = uiState) {
            is HomeViewModel.HomeUiState.Loading -> {
                Box(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = TealPrimary)
                }
            }

            is HomeViewModel.HomeUiState.Error -> {
                Box(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(state.message, color = MaterialTheme.colorScheme.error)
                }
            }

            is HomeViewModel.HomeUiState.Success -> {
                if (state.conversations.isEmpty()) {
                    HomeEmptyState(modifier = Modifier.fillMaxSize().padding(innerPadding))
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize().padding(innerPadding),
                        contentPadding = PaddingValues(bottom = 88.dp),
                    ) {
                        items(
                            items = state.conversations,
                            key = { it.id },
                        ) { conversation ->
                            SwipeToDeleteConversation(
                                conversation = conversation,
                                onClick = { onConversationClick(conversation.id) },
                                onDelete = { viewModel.deleteConversation(conversation) },
                                modifier = Modifier.animateItemPlacement(),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeEmptyState(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            imageVector = Icons.Filled.Chat,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.outline,
            modifier = Modifier.height(64.dp),
        )
        Spacer(Modifier.height(24.dp))
        Text(
            text = stringResource(R.string.home_empty_title),
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.home_empty_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SwipeToDeleteConversation(
    conversation: Conversation,
    onClick: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val dismissState = rememberDismissState(
        confirmValueChange = { value ->
            if (value == DismissValue.DismissedToStart) {
                onDelete()
                true
            } else false
        }
    )

    SwipeToDismiss(
        state = dismissState,
        modifier = modifier,
        directions = setOf(DismissDirection.EndToStart),
        background = {
            val color by animateColorAsState(
                targetValue = if (dismissState.dismissDirection == DismissDirection.EndToStart) {
                    MaterialTheme.colorScheme.errorContainer
                } else Color.Transparent,
                label = "swipe_bg",
            )
            Box(
                modifier = Modifier.fillMaxSize().background(color).padding(end = 16.dp),
                contentAlignment = Alignment.CenterEnd,
            ) {
                Icon(
                    Icons.Filled.Delete,
                    contentDescription = stringResource(R.string.home_delete_conversation),
                    tint = MaterialTheme.colorScheme.onErrorContainer,
                )
            }
        },
        dismissContent = {
            ConversationListItem(conversation = conversation, onClick = onClick)
        },
    )
}

@Composable
private fun ConversationListItem(
    conversation: Conversation,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val dateStr = SimpleDateFormat("MMM d", Locale.getDefault())
        .format(Date(conversation.updatedAt))

    ListItem(
        modifier = modifier.clickable(onClick = onClick),
        headlineContent = {
            Text(
                text = conversation.title,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        },
        supportingContent = {
            Text(
                text = stringResource(R.string.home_updated, dateStr),
                style = MaterialTheme.typography.bodySmall,
            )
        },
        colors = ListItemDefaults.colors(
            containerColor = OledSurface,
            headlineColor = MaterialTheme.colorScheme.onBackground,
            supportingColor = MaterialTheme.colorScheme.onSurfaceVariant,
        ),
    )
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(OledSurfaceVariant),
    )
}
