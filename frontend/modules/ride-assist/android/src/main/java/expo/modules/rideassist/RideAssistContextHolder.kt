package expo.modules.rideassist

import android.content.Context

/** Process-wide application context holder so background services and the hub
 *  can reach SharedPreferences without leaking an Activity. */
object RideAssistContextHolder {
    @Volatile
    var applicationContext: Context? = null
}
