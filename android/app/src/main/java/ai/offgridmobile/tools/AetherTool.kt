package ai.offgridmobile.tools

import ai.offgridmobile.aether.AetherContextBridge
import ai.offgridmobile.aether.AetherSnapshot
import ai.offgridmobile.aether.BluetoothDevice
import ai.offgridmobile.aether.CellularInfo
import ai.offgridmobile.aether.WifiNetwork
import org.json.JSONArray
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * LLM tool that provides the current RF and wireless environment snapshot
 * collected by the AETHER app running on the same device.
 *
 * Tool description (injected into system prompt):
 *   "Returns the current RF and wireless environment snapshot from the device's
 *    sensors including nearby WiFi networks, Bluetooth devices, and cellular signal.
 *    Use this when the user asks about their current location context, network
 *    environment, or physical surroundings."
 *
 * Model invokes this tool by emitting:
 *   {"tool_use": {"name": "aether_rf_snapshot", "input": ""}}
 *
 * This tool returns a JSON string with the full snapshot which is injected back
 * into the conversation as a tool_result block.
 */
@Singleton
class AetherTool @Inject constructor(
    private val aetherContextBridge: AetherContextBridge,
) : Tool {

    override val name: String = "aether_rf_snapshot"

    override val description: String =
        "Returns the current RF and wireless environment snapshot from the device's sensors " +
            "including nearby WiFi networks, Bluetooth devices, and cellular signal. " +
            "Use this when the user asks about their current location context, network " +
            "environment, or physical surroundings."

    override suspend fun execute(input: String): String {
        if (!aetherContextBridge.isAetherAvailable) {
            return JSONObject().apply {
                put("error", "AETHER context app is not installed on this device")
                put("available", false)
            }.toString()
        }

        val snapshot = aetherContextBridge.getSnapshot()
        return snapshotToJson(snapshot)
    }

    private fun snapshotToJson(snapshot: AetherSnapshot): String {
        return JSONObject().apply {
            put("capturedAt", snapshot.capturedAt.toString())
            put("wifi", snapshot.wifiNetworks.toJson())
            put("bluetooth", snapshot.bluetoothDevices.toJson())
            snapshot.cellularInfo?.let { put("cellular", it.toJson()) }
            put("anomalies", JSONArray(snapshot.anomalies))
        }.toString(2)
    }

    private fun List<WifiNetwork>.toJson(): JSONArray = JSONArray().also { arr ->
        forEach { net ->
            arr.put(JSONObject().apply {
                put("ssid", net.ssid)
                put("bssid", net.bssid)
                put("level_dbm", net.level)
                put("frequency_mhz", net.frequency)
                put("band", if (net.frequency >= 5000) "5GHz" else "2.4GHz")
                put("timestamp", net.timestamp)
            })
        }
    }

    private fun List<BluetoothDevice>.toJson(): JSONArray = JSONArray().also { arr ->
        forEach { dev ->
            arr.put(JSONObject().apply {
                put("name", dev.deviceName)
                put("address", dev.address)
                put("rssi_dbm", dev.rssi)
            })
        }
    }

    private fun CellularInfo.toJson(): JSONObject = JSONObject().apply {
        put("mcc", mcc)
        put("mnc", mnc)
        put("signal_dbm", signalDbm)
    }
}
