package ai.offgridmobile.data.local.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import ai.offgridmobile.data.local.entities.Conversation
import kotlinx.coroutines.flow.Flow

@Dao
interface ConversationDao {

    @Query("SELECT * FROM conversations ORDER BY updatedAt DESC")
    fun getAll(): Flow<List<Conversation>>

    @Query("SELECT * FROM conversations WHERE id = :id")
    suspend fun getById(id: Long): Conversation?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(conversation: Conversation): Long

    @Update
    suspend fun update(conversation: Conversation)

    @Delete
    suspend fun delete(conversation: Conversation)

    @Query("DELETE FROM conversations")
    suspend fun deleteAll()
}
