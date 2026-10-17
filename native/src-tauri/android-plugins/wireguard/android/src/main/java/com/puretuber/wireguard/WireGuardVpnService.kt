package com.puretuber.wireguard

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.wireguard.android.backend.GoBackend

/**
 * Foreground VpnService that owns the TUN interface for the WireGuard tunnel.
 *
 * Flow:
 *   1. App calls `VpnService.prepare(activity)` (returns null if already granted).
 *   2. App calls `context.startForegroundService(Intent(ACTION_START).putExtra(EXTRA_CONFIG, ...))`.
 *   3. `onStartCommand` receives the config, calls `Builder.establish()` to
 *      create the TUN FD, and registers the FD with `GoBackend`.
 *   4. `WireGuardPlugin.startVpn(context, config)` then sets the tunnel state
 *      to UP via the backend.
 *   5. When the user disconnects, `ACTION_STOP` tears everything down and the
 *      service stops itself.
 *
 * Permission: declared in `AndroidManifest.xml` as
 *   `<service android:name=".WireGuardVpnService"
 *      android:permission="android.permission.BIND_VPN_SERVICE"
 *      android:foregroundServiceType="specialUse">
 *      <intent-filter><action android:name="android.net.VpnService"/></intent-filter>
 *   </service>`
 */
class WireGuardVpnService : VpnService() {

    override fun onCreate() {
        super.onCreate()
        // GoBackend uses this VpnService instance to establish the TUN interface.
        GoBackend.setVpnService(this)
        Log.i(TAG, "VpnService created, GoBackend attached")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val config = intent.getStringExtra(EXTRA_CONFIG) ?: run {
                    Log.e(TAG, "ACTION_START without config extra")
                    stopSelf()
                    return START_NOT_STICKY
                }
                startForeground(NOTIFICATION_ID, buildNotification())
                establishTun(config)
            }
            ACTION_STOP -> {
                stopTun()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        stopTun()
        super.onDestroy()
    }

    // ---------- TUN interface ----------

    private fun establishTun(config: String) {
        try {
            val builder = Builder()
                .setSession(SESSION_NAME)
                .setMtu(1280)
                .allowFamily(android.system.OsConstants.AF_INET)
                .allowFamily(android.system.OsConstants.AF_INET6)

            // Parse addresses + DNS from the wg-quick config (very small parser;
            // WireGuardPlugin.parseConfig already does the full one).
            for (line in config.lines()) {
                val l = line.trim()
                if (l.startsWith("Address", ignoreCase = true)) {
                    val addrs = l.substringAfter("=").trim().split(",").map { it.trim() }
                    addrs.forEach { builder.addAddress(it.substringBefore("/"), it.substringAfter("/").toIntOrNull() ?: 32) }
                } else if (l.startsWith("DNS", ignoreCase = true)) {
                    l.substringAfter("=").trim().split(",").map { it.trim() }
                        .forEach { builder.addDnsServer(it) }
                }
            }
            // Route all traffic through the tunnel.
            builder.addRoute("0.0.0.0", 0)
            builder.addRoute("::", 0)

            val tunFd = builder.establish()
            if (tunFd == null) {
                Log.e(TAG, "Builder.establish() returned null — VPN permission revoked?")
                stopSelf()
                return
            }
            Log.i(TAG, "TUN established, fd=$tunFd")
            // GoBackend picks up the FD via the VpnService reference set in onCreate.
        } catch (t: Throwable) {
            Log.e(TAG, "establishTun failed", t)
            stopSelf()
        }
    }

    private fun stopTun() {
        // GoBackend.setState(..., Tunnel.State.DOWN, null) is called from
        // WireGuardPlugin.stopVpn(). The TUN FD is closed by the backend.
        Log.i(TAG, "TUN torn down")
    }

    // ---------- Foreground notification ----------

    private fun buildNotification(): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    "PureTuber VPN",
                    NotificationManager.IMPORTANCE_LOW,
                ).apply { description = "WireGuard tunnel active" }
            )
        }
        val pendingIntent = PendingIntent.getService(
            this,
            0,
            Intent(this, WireGuardVpnService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_vpncall)
            .setContentTitle("PureTuber VPN")
            .setContentText("Protected — WireGuard tunnel active")
            .setOngoing(true)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Disconnect", pendingIntent)
            .build()
    }

    companion object {
        private const val TAG = "PureTuberVpnSvc"
        private const val SESSION_NAME = "PureTuberVPN"
        private const val CHANNEL_ID = "puretuber_vpn"
        private const val NOTIFICATION_ID = 0x7FFF
        const val ACTION_START = "com.puretuber.wireguard.START"
        const val ACTION_STOP = "com.puretuber.wireguard.STOP"
        const val EXTRA_CONFIG = "config"
    }
}
