package expo.modules.rideassist

import org.json.JSONObject

/**
 * Pure (framework-free) helpers shared by the listener and accessibility
 * services: package→platform mapping, ride-ness gating, screen rate-limit
 * decisions, event normalization and redaction. Unit-tested in
 * RideEventNormalizerTest.
 *
 * The package ids are the same pre-filled defaults shown (and editable) in the
 * app — they are NOT verified against real app versions.
 */
object RideEventNormalizer {

    val PLATFORM_PACKAGES: Map<String, String> = mapOf(
        // Package ids cross-checked against the reference RideAssist APK's
        // string table (com.olacabs.oladriver is Ola's driver app; the
        // previously used com.olacabs.driver was wrong). Still unverified on
        // a physical device.
        "com.rapido.captain" to "rapido",
        "com.rapido.partner" to "rapido",
        "com.ubercab.driver" to "uber",
        "com.olacabs.oladriver" to "ola",
        "com.olacabs.driver" to "ola",
    )

    private val RIDE_KEYWORDS = listOf(
        Regex("ride\\s*request", RegexOption.IGNORE_CASE),
        Regex("new\\s*ride", RegexOption.IGNORE_CASE),
        Regex("trip\\s*request", RegexOption.IGNORE_CASE),
        Regex("new\\s*trip", RegexOption.IGNORE_CASE),
    )

    private val ACCEPT_SCREEN_RE = Regex(
        "\\b(accept|accept ride|accept trip|tap to accept|swipe to accept|accept request)\\b",
        RegexOption.IGNORE_CASE,
    )
    private val FARE_OR_DISTANCE_RE = Regex(
        "(₹|\\brs\\.?\\s*[0-9]|\\binr\\s*[0-9]|\\bfare\\b|[0-9]+(?:\\.[0-9]+)?\\s*(?:km|m\\b))",
        RegexOption.IGNORE_CASE,
    )

    private val SECRET_LABELED = Regex("\\b(otp|code|password|pin|pass)\\b[^0-9\\n]{0,12}[0-9]{3,8}", RegexOption.IGNORE_CASE)
    private val LONG_DIGIT_RUN = Regex("[0-9]{7,}")

    fun platformForPackage(packageName: String): String? = PLATFORM_PACKAGES[packageName]

    /**
     * Resolves a package name using the user-synced platform->package JSON map
     * first, falling back to PLATFORM_PACKAGES defaults.
     */
    fun resolvePlatform(packageName: String, syncedJson: String?): String? {
        if (!syncedJson.isNullOrBlank()) {
            try {
                val map = JSONObject(syncedJson)
                for (key in map.keys()) {
                    if (map.optString(key) == packageName) return key
                }
            } catch (_: Exception) {
                // fall through to defaults
            }
        }
        return platformForPackage(packageName)
    }

    fun looksLikeRideNotification(title: String, text: String): Boolean {
        val combined = "$title $text"
        return RIDE_KEYWORDS.any { it.containsMatchIn(combined) }
    }

    /**
     * True when screen text contains ride keywords OR an Accept control paired
     * with fare/distance text. Used so rate-limiting never drops a real ride
     * card that appears right after a routine window update.
     */
    fun looksLikeRideScreen(text: String): Boolean {
        if (text.isBlank()) return false
        if (looksLikeRideNotification("", text)) return true
        return ACCEPT_SCREEN_RE.containsMatchIn(text) && FARE_OR_DISTANCE_RE.containsMatchIn(text)
    }

    /**
     * Determines whether a screen observation should be emitted.
     * - Blank observations are never emitted (and do not advance the rate limit).
     * - A new ride-request screen (different content hash from the last ride
     *   screen) bypasses the cooldown from prior non-ride events so legitimate
     *   ride requests are never silently discarded.
     * - All other observations obey [rateLimitMs].
     */
    fun shouldEmitScreenObservation(
        text: String,
        nowMs: Long,
        lastEmitMs: Long,
        lastRideHash: Int?,
        rateLimitMs: Long = 2000L,
    ): Boolean {
        if (text.isBlank()) return false
        val isRide = looksLikeRideScreen(text)
        if (isRide && text.hashCode() != lastRideHash) {
            return true
        }
        return nowMs - lastEmitMs >= rateLimitMs
    }

    /** Strip OTP/password/phone-like content before anything is stored or logged. */
    fun redact(text: String): String {
        return text.replace(SECRET_LABELED) { m -> m.groupValues[1] + " ••••" }.replace(LONG_DIGIT_RUN, "••••••")
    }

    fun buildEvent(
        id: String,
        platform: String,
        title: String,
        text: String,
        subText: String?,
        postedAt: Long,
        source: String,
        removed: Boolean,
    ): JSONObject {
        return JSONObject().apply {
            put("id", id)
            put("platform", platform)
            put("title", title.take(300))
            put("text", text.take(300))
            put("subText", subText?.take(300) ?: "")
            put("postedAt", postedAt)
            put("source", source)
            put("removed", removed)
        }
    }

    /** Redacted, bounded preview persisted for diagnostics after restarts. */
    fun previewForPersistence(event: JSONObject): JSONObject {
        return JSONObject().apply {
            put("id", event.optString("id"))
            put("platform", event.optString("platform"))
            put("postedAt", event.optLong("postedAt"))
            put("removed", event.optBoolean("removed"))
            put("preview", redact("${event.optString("title")} — ${event.optString("text")}").take(160))
        }
    }
}
