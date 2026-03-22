package ai.offgridmobile.data.local.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import ai.offgridmobile.data.local.entities.DownloadedModel
import kotlinx.coroutines.flow.Flow

@Dao
interface ModelDao {

    @Query("SELECT * FROM downloaded_models ORDER BY downloadedAt DESC")
    fun getAll(): Flow<List<DownloadedModel>>

    @Query("SELECT * FROM downloaded_models WHERE isActive = 1 LIMIT 1")
    suspend fun getActive(): DownloadedModel?

    @Query("SELECT * FROM downloaded_models WHERE id = :id")
    suspend fun getById(id: String): DownloadedModel?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(model: DownloadedModel)

    @Update
    suspend fun update(model: DownloadedModel)

    @Delete
    suspend fun delete(model: DownloadedModel)

    @Query("UPDATE downloaded_models SET isActive = 0")
    suspend fun clearActive()
}
