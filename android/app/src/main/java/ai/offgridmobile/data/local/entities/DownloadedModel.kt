package ai.offgridmobile.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "downloaded_models")
data class DownloadedModel(
    @PrimaryKey
    val id: String,
    val name: String,
    val path: String,
    val sizeBytes: Long,
    /** e.g. "Q4_K_M", "Q5_K_M", "Q8_0" */
    val quantization: String,
    /** e.g. "huggingface", "local" */
    val source: String,
    val downloadedAt: Long,
    val isActive: Boolean = false,
)
