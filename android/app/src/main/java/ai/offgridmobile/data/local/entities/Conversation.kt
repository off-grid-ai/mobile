package ai.offgridmobile.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "conversations")
data class Conversation(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val title: String,
    val createdAt: Long,
    val updatedAt: Long,
    val modelId: String?,
)
