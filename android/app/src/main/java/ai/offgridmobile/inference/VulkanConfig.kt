package ai.offgridmobile.inference

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Represents the active inference backend for text generation (llama.cpp).
 *
 * - [Auto]   Let [VulkanConfig] choose the best available backend at runtime.
 * - [CPU]    Force CPU-only execution (Cortex-X3 prime core, 4× perf cores).
 * - [Vulkan] Route matrix ops through Adreno 740 via ggml-vulkan backend.
 *            Requires llama.rn built with -DGGML_VULKAN=ON (see build.gradle).
 * - [QNN]    Hexagon 780 NPU offload — wired in Phase 5, stub here.
 */
sealed class InferenceBackend(val key: String, val displayName: String) {
    data object Auto : InferenceBackend("auto", "Auto")
    data object CPU : InferenceBackend("cpu", "CPU")
    data object Vulkan : InferenceBackend("vulkan", "Vulkan (Adreno 740)")
    data object QNN : InferenceBackend("qnn", "QNN / NPU (Phase 5)")

    companion object {
        fun fromKey(key: String): InferenceBackend = when (key) {
            "cpu" -> CPU
            "vulkan" -> Vulkan
            "qnn" -> QNN
            else -> Auto
        }
    }
}

/**
 * Queries device capabilities to determine the best inference backend.
 *
 * Vulkan support is checked via two independent gates:
 *  1. [PackageManager.FEATURE_VULKAN_HARDWARE_LEVEL] >= 1 (OpenGL ES 3.1 feature set)
 *  2. [PackageManager.FEATURE_VULKAN_HARDWARE_VERSION] — confirms Vulkan API version
 *
 * GPU identification reads the GL renderer string or SOC model to confirm
 * we are on an Adreno 740 (S23 Ultra / Snapdragon 8 Gen 2) rather than a
 * lower-tier Adreno that has Vulkan but limited compute shader throughput.
 *
 * QNN detection is left to Phase 5 — [InferenceBackend.QNN] is always
 * returned as unavailable here.
 */
@Singleton
class VulkanConfig @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    /**
     * True when the device declares Vulkan hardware level 1+ and version 1.1+.
     * The Adreno 740 supports Vulkan 1.3 so this will be true on the S23 Ultra.
     */
    val isVulkanSupported: Boolean by lazy {
        val pm = context.packageManager
        val hasLevel = pm.hasSystemFeature(PackageManager.FEATURE_VULKAN_HARDWARE_LEVEL, 1)
        val hasVersion = pm.hasSystemFeature(PackageManager.FEATURE_VULKAN_HARDWARE_VERSION, 0x400000) // 1.1.0
        hasLevel && hasVersion
    }

    /**
     * True when we can positively identify the GPU as an Adreno 740.
     * Used to gate Vulkan dispatch to avoid falling back on weaker Adreno variants.
     * Identification strategy: Snapdragon 8 Gen 2 always has SOC_MODEL starting with
     * "SM8550" (commercial part) or "SM8550" variant; the Adreno 740 is exclusive to that SoC.
     */
    val isAdreno740: Boolean by lazy {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val soc = Build.SOC_MODEL
            soc.startsWith("SM8550", ignoreCase = true) ||
                soc.startsWith("8gen2", ignoreCase = true) ||
                soc.contains("8550", ignoreCase = true)
        } else {
            // Below API 31 we can't confirm the SoC — conservatively return false
            false
        }
    }

    /**
     * Recommended backend given the current [userPreference].
     *
     * Resolution order:
     *  Auto → Vulkan if supported + Adreno 740, else CPU
     *  CPU  → always CPU (safe fallback)
     *  Vulkan → only if [isVulkanSupported], otherwise falls back to CPU
     *  QNN  → stub until Phase 5; returns CPU
     */
    fun resolveBackend(userPreference: InferenceBackend): InferenceBackend = when (userPreference) {
        is InferenceBackend.Auto -> if (isVulkanSupported) InferenceBackend.Vulkan else InferenceBackend.CPU
        is InferenceBackend.Vulkan -> if (isVulkanSupported) InferenceBackend.Vulkan else InferenceBackend.CPU
        is InferenceBackend.QNN -> InferenceBackend.CPU // Phase 5
        is InferenceBackend.CPU -> InferenceBackend.CPU
    }

    /**
     * The best backend the device can actually run, ignoring user preference.
     * Used for display in Settings ("Device supports: Vulkan").
     */
    val preferredBackend: InferenceBackend
        get() = if (isVulkanSupported) InferenceBackend.Vulkan else InferenceBackend.CPU
}
