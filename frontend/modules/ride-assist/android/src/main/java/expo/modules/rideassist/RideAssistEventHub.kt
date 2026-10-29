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
        val key = "${event.optString("id")}:${event.optLong("postedAt")}"
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
            }
        }
        persistMetadata(event)
    }

    /** Returns and clears buffered events (those emitted before JS mounted). */
    fun drainPending(): JSONArray {
        synchronized(lock) {
            val out = JSONArray()
            for (event in pending) out.put(event)
            pending.clear()
            return out
        }
    }

    fun clearPending() {
        synchronized(lock) { pending.clear() }
    }

    fun bufferedCount(): Int = synchronized(lock) { pending.size }

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
