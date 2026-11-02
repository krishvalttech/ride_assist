package expo.modules.rideassist

import java.util.ArrayDeque
import java.util.LinkedHashSet
import org.json.JSONArray
import org.json.JSONObject

/**
 * Bridges the background services (NotificationListener / Accessibility) to
 * the React Native module.
 *
 * - Exactly one listener slot (set by the module in OnCreate, cleared in
 *   OnDestroy) — no duplicate native event subscriptions.
 * - Events emitted before the JS tree is ready (cold start, process death)
 *   are buffered in memory (bounded) AND persisted (redacted, bounded) so
 *   JavaScript can drain them via getPendingEvents().
 * - In-process dedup prevents repeated delivery of the same notification
 *   instance across service reconnections.
 */
object RideAssistEventHub {

    @Volatile
    var onEvent: ((JSONObject) -> Unit)? = null

    private const val MAX_BUFFER = 50
    private const val MAX_RECENT_KEYS = 100

    private val lock = Any()
    private val pending = ArrayDeque<JSONObject>()
    private val recentKeys = LinkedHashSet<String>()

    fun emit(event: JSONObject) {
        // Include a content hash: notification UPDATES often reuse the same key
        // and post time, and were previously dropped as duplicates.
        val key = "${event.optString("id")}:${event.optLong("postedAt")}:${event.optBoolean("removed")}:${(event.optString("title") + event.optString("text")).hashCode()}"
        recordActivity(event)
        synchronized(lock) {
            if (!recentKeys.add(key)) return
            if (recentKeys.size > MAX_RECENT_KEYS) {
                val eldest = recentKeys.firstOrNull()
                if (eldest != null) recentKeys.remove(eldest)
            }
            val listener = onEvent
            if (listener != null) {
                listener(event)
            } else {
                if (pending.size >= MAX_BUFFER) pending.removeFirst()
                pending.addLast(event)
                persistPendingQueue(pending)
            }
        }
        persistMetadata(event)
    }

    /** Returns and clears buffered events (both in-memory and persisted). */
    fun drainPending(): JSONArray {
        synchronized(lock) {
            val out = JSONArray()
            if (pending.isEmpty()) {
                val persisted = loadPersistedPendingQueue()
                for (event in persisted) {
                    out.put(event)
                }
            } else {
                for (event in pending) {
                    out.put(event)
                }
                pending.clear()
            }
            clearPersistedPendingQueue()
            return out
        }
    }

    fun clearPending() {
        synchronized(lock) {
            pending.clear()
            clearPersistedPendingQueue()
        }
    }

    private fun persistPendingQueue(events: ArrayDeque<JSONObject>) {
        try {
            val context = RideAssistContextHolder.applicationContext ?: return
            val prefs = context.getSharedPreferences(RideAssistModule.PREFS_NAME, android.content.Context.MODE_PRIVATE)
            val arr = JSONArray()
            for (evt in events) {
                arr.put(evt)
            }
            prefs.edit().putString(RideAssistModule.KEY_PENDING_QUEUE, arr.toString()).apply()
        } catch (_: Exception) {
        }
    }

    private fun loadPersistedPendingQueue(): List<JSONObject> {
        val list = ArrayList<JSONObject>()
        try {
            val context = RideAssistContextHolder.applicationContext ?: return list
            val prefs = context.getSharedPreferences(RideAssistModule.PREFS_NAME, android.content.Context.MODE_PRIVATE)
            val raw = prefs.getString(RideAssistModule.KEY_PENDING_QUEUE, null) ?: return list
            val arr = JSONArray(raw)
            for (i in 0 until arr.length()) {
                arr.optJSONObject(i)?.let { list.add(it) }
            }
        } catch (_: Exception) {
        }
        return list
    }

    private fun clearPersistedPendingQueue() {
        try {
            val context = RideAssistContextHolder.applicationContext ?: return
            context.getSharedPreferences(RideAssistModule.PREFS_NAME, android.content.Context.MODE_PRIVATE)
                .edit().remove(RideAssistModule.KEY_PENDING_QUEUE).apply()
        } catch (_: Exception) {
        }
    }

    fun bufferedCount(): Int = synchronized(lock) { pending.size }

    /** Per-platform "last real event" timestamp, used for Connected / Not Detected status. */
    private fun recordActivity(event: JSONObject) {
        try {
            val context = RideAssistContextHolder.applicationContext ?: return
            context.getSharedPreferences(RideAssistModule.PREFS_NAME, android.content.Context.MODE_PRIVATE)
                .edit().putLong("last_event_${event.optString("platform")}", System.currentTimeMillis()).apply()
        } catch (_: Exception) {
        }
    }

    /** Bounded, redacted local persistence of essential event metadata. */
    private fun persistMetadata(event: JSONObject) {
        try {
            val context = RideAssistContextHolder.applicationContext ?: return
            val prefs = context.getSharedPreferences(
                RideAssistModule.PREFS_NAME,
                android.content.Context.MODE_PRIVATE,
            )
            val arr = JSONArray(prefs.getString(RideAssistModule.KEY_RECENT_EVENTS, "[]"))
            arr.put(RideEventNormalizer.previewForPersistence(event))
            while (arr.length() > 20) arr.remove(0)
            prefs.edit().putString(RideAssistModule.KEY_RECENT_EVENTS, arr.toString()).apply()
        } catch (_: Exception) {
            // Persistence is best-effort; event delivery must never crash the service.
        }
    }
}
