package com.lookon.wireguard

import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.util.Log
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Tunnel
import com.wireguard.android.backend.WgQuickBackend
import com.wireguard.config.Config
import com.wireguard.config.InetEndpoint
import com.wireguard.config.InetNetwork
import com.wireguard.config.Interface
import com.wireguard.config.Peer
import com.wireguard.crypto.Key
import com.wireguard.crypto.KeyPair
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Look On WireGuard Android plugin.
 *
 * Bridges Rust ↔ Kotlin via JNI. The Rust side calls:
 *   - [startVpn]  with a wg-quick config string,
 *   - [stopVpn],
 *   - [getStatus].
 *
 * The actual tunnel is established using Android's [VpnService] API together
 * with the `wireguard-android` userspace library (`GoBackend`/`WgQuickBackend`).
 *
 * IMPORTANT: This file is a scaffold. To run a real WireGuard tunnel you must:
 *  1. Implement [WireGuardVpnService] (separate file in this package) that
 *     extends [VpnService], calls `Builder.establish()` to create the TUN
 *     interface, and hands the FD to the WireGuard backend.
 *  2. Call `VpnService.prepare(context)` from your Activity before starting
 *     the service (this triggers the system "Allow VPN connection?" dialog).
 *  3. Supply real server credentials (peer public key + endpoint + client
 *     private key) — the `config` parameter is parsed by [parseConfig].
 *
 * Permission flow: the user must grant `BIND_VPN_SERVICE` via the system
 * dialog. This cannot be granted silently. If `VpnService.prepare()` returns
 * a non-null Intent, you must launch it via the Activity result API and only
 * start the service after the user accepts.
 */
object WireGuardPlugin {
    private const val TAG = "LookOnWG"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _status = MutableStateFlow(WgStatus())
    val status: StateFlow<WgStatus> = _status

    /**
     * Start the WireGuard tunnel.
     *
     * @param config wg-quick config string (see Rust `vpn::wireguard::build_wg_config`).
     * @return updated [WgStatus].
     */
    @JvmStatic
    fun startVpn(context: Context, config: String): WgStatus {
        Log.i(TAG, "startVpn: parsing config (${config.length} bytes)")

        // 1. Make sure the user has granted VPN permission.
        val prepareIntent = VpnService.prepare(context)
        if (prepareIntent != null) {
            // The Activity must launch `prepareIntent` and call back here after
            // `onActivityResult` returns OK. For this scaffold, we surface an
            // error so the Rust side falls back to simulated mode.
            _status.value = WgStatus(
                connected = false,
                exitIp = "",
                error = "VpnService.prepare() returned an intent — user must grant VPN permission from an Activity"
            )
            return _status.value
        }

        // 2. Parse the wg-quick config string into a wireguard-android `Config`.
        val parsed = try {
            parseConfig(config)
        } catch (t: Throwable) {
            _status.value = WgStatus(connected = false, error = "config parse: ${t.message}")
            return _status.value
        }

        // 3. Start the foreground service which owns the TUN interface.
        val intent = Intent(context, WireGuardVpnService::class.java).apply {
            action = WireGuardVpnService.ACTION_START
            putExtra(WireGuardVpnService.EXTRA_CONFIG, config)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }

        // 4. Bring the tunnel up. GoBackend requires the VpnService to be
        //    attached; the service sets `GoBackend.setVpnService(this)` in
        //    `onCreate()` so this call works from any thread.
        scope.launch {
            try {
                val backend = GoBackend(context)
                val state = backend.setState(
                    /* tunnel = */ LookOnTunnel,
                    /* state = */ Tunnel.State.UP,
                    /* config = */ parsed,
                )
                Log.i(TAG, "tunnel state: $state")
                _status.value = WgStatus(
                    connected = state == Tunnel.State.UP,
                    exitIp = extractExitIp(parsed),
                    error = null,
                )
            } catch (t: Throwable) {
                Log.e(TAG, "tunnel up failed", t)
                _status.value = WgStatus(connected = false, error = t.message)
            }
        }
        return _status.value
    }

    /** Stop the tunnel and tear down the TUN interface. */
    @JvmStatic
    fun stopVpn(context: Context): WgStatus {
        Log.i(TAG, "stopVpn")
        scope.launch {
            try {
                val backend = GoBackend(context)
                backend.setState(LookOnTunnel, Tunnel.State.DOWN, null)
            } catch (t: Throwable) {
                Log.e(TAG, "tunnel down failed", t)
            }
        }
        val intent = Intent(context, WireGuardVpnService::class.java).apply {
            action = WireGuardVpnService.ACTION_STOP
        }
        context.startService(intent)
        _status.value = WgStatus(connected = false, exitIp = "", error = null)
        return _status.value
    }

    /** Current status — safe to poll from Rust every ~1.5 s. */
    @JvmStatic
    fun getStatus(): WgStatus = _status.value

    // ---------- helpers ----------

    /** Simple wg-quick parser → wireguard-android `Config`. */
    private fun parseConfig(text: String): Config {
        val lines = text.lines().map { it.trim() }
        var section = ""
        var ifaceBuilder = Interface.Builder()
        val peers = mutableListOf<Peer.Builder>()
        var curPeer: Peer.Builder? = null

        for (line in lines) {
            if (line.isEmpty() || line.startsWith("#") || line.startsWith(";")) continue
            if (line.startsWith("[")) {
                section = line
                if (section.equals("[Peer]", ignoreCase = true)) {
                    curPeer = Peer.Builder()
                }
                continue
            }
            val (k, v) = line.split("=", limit = 2).map { it.trim() }.let { it[0] to it[1] }
            when (section.lowercase()) {
                "[interface]" -> when (k.lowercase()) {
                    "privatekey" -> ifaceBuilder = ifaceBuilder.parsePrivateKey(Key.fromHex(v))
                    "address" -> v.split(",").map { it.trim() }.forEach {
                        ifaceBuilder = ifaceBuilder.parseAddresses(InetNetwork.parse(it))
                    }
                    "dns" -> ifaceBuilder = ifaceBuilder.parseDnsServers(v.split(",").map { it.trim() })
                }
                "[peer]" -> {
                    val p = curPeer ?: continue
                    when (k.lowercase()) {
                        "publickey" -> p.parsePublicKey(Key.fromHex(v))
                        "endpoint" -> p.parseEndpoint(InetEndpoint.parse(v))
                        "allowedips" -> v.split(",").map { it.trim() }.forEach {
                            p.parseAllowedIPs(InetNetwork.parse(it))
                        }
                        "persistentkeepalive" -> p.parsePersistentKeepalive(v.toInt())
                    }
                }
            }
        }
        val peerList = (listOfNotNull(curPeer) + peers).map { it.build() }
        return Config.Builder()
            .addInterface(ifaceBuilder.build())
            .addPeers(peerList)
            .build()
    }

    /** Pull the client tunnel address (heuristic exit IP). */
    private fun extractExitIp(config: Config): String {
        return config.`interface`.addresses.firstOrNull()?.address?.hostAddress ?: ""
    }
}

/** Minimal Tunnel handle for the WireGuard backend. */
private object LookOnTunnel : Tunnel {
    override fun getName(): String = "LookOnVPN"
    override fun onStateChange(newState: Tunnel.State) {
        Log.i("LookOnWG", "tunnel state → $newState")
    }
}

/** Status DTO returned to Rust via JNI. */
data class WgStatus(
    val connected: Boolean = false,
    val exitIp: String = "",
    val error: String? = null,
)
