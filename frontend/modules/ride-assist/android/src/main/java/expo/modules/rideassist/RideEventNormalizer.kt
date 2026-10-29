package expo.modules.rideassist

import org.json.JSONObject

/**
 * Pure (framework-free) helpers shared by the listener and accessibility
 * services: package→platform mapping, ride-ness gating, event normalization
 * and redaction. Unit-tested in RideEventNormalizerTest.
 *
 * The package ids are the same pre-filled defaults shown (and editable) in the
 * app — they are NOT verified against real app versions.
 */
object RideEventNormalizer {

    val PLATFORM_PACKAGES: Map<String, String> = mapOf(
        "com.rapido.captain" to "rapido",
        "com.ubercab.driver" to "uber",
        "com.olacabs.driver" to "ola",
    )

    private val RIDE_KEYWORDS = listOf(
        Regex("ride\\s*request", RegexOption.IGNORE_CASE),
        Regex("new\\s*ride", RegexOption.IGNORE_CASE),
        Regex("trip\\s*request", RegexOption.IGNORE_CASE),
        Regex("new\\s*trip", RegexOption.IGNORE_CASE),
    )

    private val SECRET_LABELED = Regex("\\b(otp|code|password|pin|pass)\\b[^0-9\\n]{0,12}[0-9]{3,8}", RegexOption.IGNORE_CASE)
    private val LONG_DIGIT_RUN = Regex("[0-9]{7,}")

    fun platformForPackage(packageName: String): String? = PLATFORM_PACKAGES[packageName]

    fun looksLikeRideNotification(title: String, text: String): Boolean {
        val combined = "$title $text"
        return RIDE_KEYWORDS.any { it.containsMatchIn(combined) }
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
