package ai.offgridmobile.data.repository

import ai.offgridmobile.data.local.dao.ConversationDao
import ai.offgridmobile.data.local.dao.MessageDao
import ai.offgridmobile.data.local.entities.Conversation
import ai.offgridmobile.data.local.entities.Message
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ConversationRepository @Inject constructor(
    private val conversationDao: ConversationDao,
    private val messageDao: MessageDao,
) {

    fun getConversations(): Flow<Result<List<Conversation>>> =
        conversationDao.getAll()
            .map { Result.success(it) }
            .catch { emit(Result.failure(it)) }

    fun getMessages(conversationId: Long): Flow<Result<List<Message>>> =
        messageDao.getByConversation(conversationId)
            .map { Result.success(it) }
            .catch { emit(Result.failure(it)) }

    suspend fun createConversation(title: String, modelId: String?): Result<Long> =
        runCatching {
            val now = System.currentTimeMillis()
            conversationDao.insert(
                Conversation(
                    title = title,
                    createdAt = now,
                    updatedAt = now,
                    modelId = modelId,
                )
            )
        }

    suspend fun updateConversationTitle(id: Long, title: String): Result<Unit> =
        runCatching {
            val existing = conversationDao.getById(id) ?: return@runCatching
            conversationDao.update(existing.copy(title = title, updatedAt = System.currentTimeMillis()))
        }

    suspend fun deleteConversation(conversation: Conversation): Result<Unit> =
        runCatching { conversationDao.delete(conversation) }

    suspend fun deleteAllConversations(): Result<Unit> =
        runCatching { conversationDao.deleteAll() }

    suspend fun addMessage(
        conversationId: Long,
        role: String,
        content: String,
        tokensUsed: Int = 0,
    ): Result<Long> = runCatching {
        val now = System.currentTimeMillis()
        val msgId = messageDao.insert(
            Message(
                conversationId = conversationId,
                role = role,
                content = content,
                createdAt = now,
                tokensUsed = tokensUsed,
            )
        )
        conversationDao.getById(conversationId)?.let { conv ->
            conversationDao.update(conv.copy(updatedAt = now))
        }
        msgId
    }
}
