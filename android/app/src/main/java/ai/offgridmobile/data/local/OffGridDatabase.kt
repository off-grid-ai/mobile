package ai.offgridmobile.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import ai.offgridmobile.data.local.dao.ConversationDao
import ai.offgridmobile.data.local.dao.MessageDao
import ai.offgridmobile.data.local.dao.ModelDao
import ai.offgridmobile.data.local.entities.Conversation
import ai.offgridmobile.data.local.entities.DownloadedModel
import ai.offgridmobile.data.local.entities.Message

@Database(
    entities = [
        Conversation::class,
        Message::class,
        DownloadedModel::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class OffGridDatabase : RoomDatabase() {
    abstract fun conversationDao(): ConversationDao
    abstract fun messageDao(): MessageDao
    abstract fun modelDao(): ModelDao
}
