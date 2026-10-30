package expo.modules.rideassist

import android.app.Notification
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject

/**
 * Detects ride request notifications from EXPLICITLY configured driver apps.
 *
 * Behavior:
 * - Validates the source package against the synced (or default) package map
 *   before touching any content.
 * - Reads only the notification fields that actually exist (title, text,
 *   bigText, subText). Nothing is inferred.
 * - Group summaries are skipped; child notifications are processed normally.
 * - Updates and repeated delivery are deduped in-process; reconciliation
 *   with existing requests happens in the TypeScript store.
 * - Notification removal is forwarded as `removed=true` and is NEVER treated
 *   as acceptance evidence downstream.
 * - Persisted metadata and logs are redacted — full notification content is
 *   never stored.
 */
class RideAssistNotificationListenerService : NotificationListenerService() {

    override fun onListenerConnected() {
        super.onListenerConnected()
        RideAssistContextHolder.applicationContext = applicationContext
    }

    /** Service restarts: ask the system to rebind instead of staying silently dead. */
    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        try {
            requestRebind(android.content.ComponentName(this, RideAssistNotificationListenerService::class.java))
        } catch (_: Exception) {
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        handle(sbn, removed = false)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        handle(sbn, removed = true)
    }

    private fun handle(sbn: StatusBarNotification, removed: Boolean) {
        val prefs = getSharedPreferences(RideAssistModule.PREFS_NAME, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(RideAssistModule.KEY_MONITORING, false)) return

        val platform = platformForPackage(sbn.packageName, prefs) ?: return
        if (sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

        val extras = sbn.notification.extras
        val title = (extras.getCharSequence(Notification.EXTRA_TITLE_BIG) ?: extras.getCharSequence(Notification.EXTRA_TITLE))?.toString() ?: ""
        // Inbox-style and custom-view notifications often leave EXTRA_TEXT empty:
        // fall back to text lines, info text and ticker so fare/km are not lost.
        val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.joinToString(" ") { it.toString() }
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
            ?.takeIf { it.isNotBlank() }
            ?: lines
            ?: sbn.notification.tickerText?.toString()
            ?: ""
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
        val subText = listOfNotNull(
            extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString(),
            extras.getCharSequence(Notification.EXTRA_INFO_TEXT)?.toString(),
            extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT)?.toString(),
        ).joinToString(" ").ifBlank { bigText ?: "" }

        val event = RideEventNormalizer.buildEvent(
            id = sbn.key ?: "${sbn.packageName}:${sbn.postTime}",
            platform = platform,
            title = title,
            text = if (bigText.isNullOrBlank()) text else bigText,
            subText = subText,
            postedAt = sbn.postTime,
            source = "notification",
            removed = removed,
        )
        RideAssistEventHub.emit(event)
        // Structured, redacted log only — never the full content.
        android.util.Log.d(
            "RideAssist",
            "event emitted: platform=${event.optString("platform")} removed=$removed preview=${RideEventNormalizer.redact(title).take(60)}",
        )
    }

    private fun platformForPackage(packageName: String, prefs: android.content.SharedPreferences): String? {
        val synced = prefs.getString(RideAssistModule.KEY_PLATFORM_PACKAGES, null)
        if (synced != null) {
            try {
                val map = org.json.JSONObject(synced)
                // map: platform -> packageName; invert for lookup
                for (key in map.keys()) {
                    if (map.optString(key) == packageName) return key
                }
            } catch (_: Exception) {
                // fall through to defaults
            }
        }
        return RideEventNormalizer.platformForPackage(packageName)
    }
}
