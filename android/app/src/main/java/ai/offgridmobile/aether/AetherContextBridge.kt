package ai.offgridmobile.aether

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

// ── Data classes ─────────────────────────────────────────────────────────────

data class WifiNetwork(
    val ssid: String,
    val bssid: String,
    val level: Int,         // dBm
    val frequency: Int,     // MHz
    val timestamp: Long,
)

data class BluetoothDevice(
    val deviceName: String,
    val address: String,
    val rssi: Int,          // dBm
)

data class CellularInfo(
    val mcc: String,
    val mnc: String,
    val signalDbm: Int,
)

data class AetherSnapshot(
    val wifiNetworks: List<WifiNetwork>,
    val bluetoothDevices: List<BluetoothDevice>,
    val cellularInfo: CellularInfo?,
    val anomalies: List<String>,
    val capturedAt: Instant,
)

// ── Bridge ───────────────────────────────────────────────────────────────────

/**
 * IPC client for the AETHER RF-environment app (package: com.necessitylabs.aether).
 *
 * AETHER exposes RF data through a ContentProvider at authority
 * "com.necessitylabs.aether.provider". Expected tables / URIs:
 *
 *   content://com.necessitylabs.aether.provider/wifi
 *     columns: ssid, bssid, level, frequency, timestamp
 *
 *   content://com.necessitylabs.aether.provider/bluetooth
 *     columns: deviceName, address, rssi
 *
 *   content://com.necessitylabs.aether.provider/cellular
 *     columns: mcc, mnc, signalDbm
 *
 *   content://com.necessitylabs.aether.provider/anomalies
 *     columns: description
 *
 * If AETHER is not installed or the provider is unavailable, [getSnapshot]
 * returns an empty snapshot and [snapshotFlow] emits empty snapshots on
 * each poll. The app never crashes due to a missing AETHER install.
 */
@Singleton
class AetherContextBridge @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    companion object {
        private const val AUTHORITY = "com.necessitylabs.aether.provider"
        private const val POLL_INTERVAL_MS = 30_000L

        private val WIFI_URI = Uri.parse("content://$AUTHORITY/wifi")
        private val BLUETOOTH_URI = Uri.parse("content://$AUTHORITY/bluetooth")
        private val CELLULAR_URI = Uri.parse("content://$AUTHORITY/cellular")
        private val ANOMALIES_URI = Uri.parse("content://$AUTHORITY/anomalies")
    }

    /** Single on-demand snapshot from AETHER. Empty if AETHER is not installed. */
    suspend fun getSnapshot(): AetherSnapshot = withContext(Dispatchers.IO) {
        val resolver = context.contentResolver
        AetherSnapshot(
            wifiNetworks = queryWifi(resolver),
            bluetoothDevices = queryBluetooth(resolver),
            cellularInfo = queryCellular(resolver),
            anomalies = queryAnomalies(resolver),
            capturedAt = Instant.now(),
        )
    }

    /**
     * Emits an [AetherSnapshot] immediately, then every [POLL_INTERVAL_MS] milliseconds
     * while the Flow is collected. Collecting on a background dispatcher is handled
     * internally via [flowOn].
     */
    val snapshotFlow: Flow<AetherSnapshot> = flow {
        while (true) {
            emit(getSnapshot())
            delay(POLL_INTERVAL_MS)
        }
    }.flowOn(Dispatchers.IO)

    // ── Private query helpers ─────────────────────────────────────────────────

    private fun queryWifi(resolver: ContentResolver): List<WifiNetwork> {
        return try {
            val cursor = resolver.query(WIFI_URI, null, null, null, null) ?: return emptyList()
            cursor.use { c ->
                val networks = mutableListOf<WifiNetwork>()
                val ssidIdx = c.getColumnIndex("ssid")
                val bssidIdx = c.getColumnIndex("bssid")
                val levelIdx = c.getColumnIndex("level")
                val freqIdx = c.getColumnIndex("frequency")
                val tsIdx = c.getColumnIndex("timestamp")
                while (c.moveToNext()) {
                    networks += WifiNetwork(
                        ssid = if (ssidIdx >= 0) c.getString(ssidIdx).orEmpty() else "",
                        bssid = if (bssidIdx >= 0) c.getString(bssidIdx).orEmpty() else "",
                        level = if (levelIdx >= 0) c.getInt(levelIdx) else 0,
                        frequency = if (freqIdx >= 0) c.getInt(freqIdx) else 0,
                        timestamp = if (tsIdx >= 0) c.getLong(tsIdx) else 0L,
                    )
                }
                networks
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun queryBluetooth(resolver: ContentResolver): List<BluetoothDevice> {
        return try {
            val cursor = resolver.query(BLUETOOTH_URI, null, null, null, null) ?: return emptyList()
            cursor.use { c ->
                val devices = mutableListOf<BluetoothDevice>()
                val nameIdx = c.getColumnIndex("deviceName")
                val addrIdx = c.getColumnIndex("address")
                val rssiIdx = c.getColumnIndex("rssi")
                while (c.moveToNext()) {
                    devices += BluetoothDevice(
                        deviceName = if (nameIdx >= 0) c.getString(nameIdx).orEmpty() else "",
                        address = if (addrIdx >= 0) c.getString(addrIdx).orEmpty() else "",
                        rssi = if (rssiIdx >= 0) c.getInt(rssiIdx) else 0,
                    )
                }
                devices
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun queryCellular(resolver: ContentResolver): CellularInfo? {
        return try {
            val cursor = resolver.query(CELLULAR_URI, null, null, null, null) ?: return null
            cursor.use { c ->
                if (!c.moveToFirst()) return null
                val mccIdx = c.getColumnIndex("mcc")
                val mncIdx = c.getColumnIndex("mnc")
                val dbmIdx = c.getColumnIndex("signalDbm")
                CellularInfo(
                    mcc = if (mccIdx >= 0) c.getString(mccIdx).orEmpty() else "",
                    mnc = if (mncIdx >= 0) c.getString(mncIdx).orEmpty() else "",
                    signalDbm = if (dbmIdx >= 0) c.getInt(dbmIdx) else 0,
                )
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun queryAnomalies(resolver: ContentResolver): List<String> {
        return try {
            val cursor = resolver.query(ANOMALIES_URI, null, null, null, null) ?: return emptyList()
            cursor.use { c ->
                val descriptions = mutableListOf<String>()
                val descIdx = c.getColumnIndex("description")
                while (c.moveToNext()) {
                    if (descIdx >= 0) descriptions += c.getString(descIdx).orEmpty()
                }
                descriptions
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    /** True when AETHER is installed and its ContentProvider responds. */
    val isAetherAvailable: Boolean
        get() = try {
            val cursor = context.contentResolver.query(WIFI_URI, null, null, null, null)
            cursor?.close()
            cursor != null
        } catch (_: Exception) {
            false
        }
}
