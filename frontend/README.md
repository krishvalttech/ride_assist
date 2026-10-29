# RideAssist

Ride-request monitoring and acceptance-assistance app for drivers using **Rapido Captain, Uber Driver and Ola Driver** (India: ₹ and km). It runs on-device only.

> **Honesty first.** RideAssist never shows a ride as accepted without reliable evidence. Integrations with third-party driver apps have **not** been checked against real app versions. Package IDs are pre-filled but marked unverified, and automatic acceptance is disabled until a permitted interaction adapter is verified on a real device. Manual approval is the working path.

---

## 1. Architecture

| Layer | Tech | Location |
|---|---|---|
| UI | React Native 0.88 + Expo SDK 58 + expo-router (TypeScript, strict) | `frontend/app`, `frontend/src/components` |
| Domain core (pure TS, no RN) | rules engine, parsers, state machine, fingerprinting, redaction | `frontend/src/rules`, `src/parsers`, `src/state`, `src/services/redact.ts` |
| Single source of truth | `rideStore` (serialized ingest queue, atomic transitions, expiry sweeper, persistence) | `frontend/src/services/rideStore.ts` |
| Acceptance abstraction | `AcceptanceProvider`: manual / simulated / native (native reports UNAVAILABLE) | `frontend/src/services/acceptance.ts` |
| JS ↔ native bridge | typed wrapper: one native subscription, payload validation, pending-event drain, AppState drain | `frontend/src/services/nativeBridge.ts` |
| Native Android (Kotlin) | Expo local module `RideAssist`: NotificationListenerService, read-only AccessibilityService, event hub | `frontend/modules/ride-assist/android` |
| Simulation | Realistic and adversarial payloads run through the **same** ingest pipeline | `frontend/src/services/simulator.ts` |

Pipeline: `notification → package validation (Kotlin) → event hub → bridge → rideStore.ingest → parse → fingerprint/dedup → rules → state machine → acceptance provider → evidence`.

State machine: `DETECTED → PARSING → EVALUATING → AWAITING_CONFIRMATION → ACCEPT_REQUESTED → ACCEPTED`, with other outcomes `REJECTED / EXPIRED / FAILED / UNKNOWN`. Illegal transitions are blocked and logged. `FAILED` can never move back to `ACCEPT_REQUESTED`, so there are no blind retries. `UNKNOWN` can only be resolved by explicit user verification.

### Persistence choice (deviation from the original brief)
The brief suggested Room. This build stores ride history and diagnostics in **AsyncStorage**, as bounded (400 rides / 250 logs) JSON written by `rideStore`. The native side keeps the last 20 events as **redacted** metadata in private SharedPreferences, plus an in-memory buffer of 50 events for delivery before JS mounts.

Why: the Expo managed workflow builds without hand-maintained Gradle files, and the dataset is small and bounded. You can move to Room later, behind the same store API, without changing the UI.

## 2. Versions

| Item | Value |
|---|---|
| Expo SDK | 58 |
| React Native | 0.88 |
| TypeScript | 6.0 (strict) |
| Kotlin target | JVM 17 |
| Android minSdk / target | 24 / 36 (module defaults via `safeExtGet`) |
| Coroutines | kotlinx-coroutines-android 1.8.1 |
| Package manager | yarn 1.22 (see `packageManager` in package.json) |

## 3. Build & install (Windows)

The Emergent container **cannot run Android Gradle builds**. Run these on your own machine with Android Studio (JDK 17, Android SDK 36) installed:

```bat
cd frontend
yarn install
npx tsc --noEmit
npx jest --runInBand
npx expo prebuild --platform android
cd android
gradlew.bat assembleDebug
gradlew.bat :ride-assist:testDebugUnitTest
gradlew.bat :ride-assist:connectedAndroidTest   :: needs a device or emulator
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Install it with `adb install -r app-debug.apk`.

**Release builds:** use Emergent's **Publish** button (top-right) to deploy and generate signed Android/iOS builds.

> Expo Go cannot load custom native code. In Expo Go and the web preview the native module is absent, so the Dashboard shows **SIM PREVIEW** and you test the full flow with **Simulation Mode**.

## 4. Permission setup (standalone Android build)

1. Open RideAssist → Dashboard → **Open notification access settings** → enable *RideAssist Ride Request Listener*.
2. (Optional) Android Settings → Accessibility → *RideAssist Screen Reader (optional)*. This is read-only and never taps.
3. Settings → Driver apps → check each app's **package id** against the app actually installed on your phone, and correct it if needed.
4. Tap **Start Monitoring**.

To revoke access, pause monitoring, or turn off notification/accessibility access in Android Settings. Settings is polled every 15 s while monitoring, so the Dashboard reflects the change. To delete all local data, go to History → **Delete local data**.

Permissions used: notification listener (special access), accessibility (optional, special access), and package visibility `<queries>` for the three configured packages only. **No** `QUERY_ALL_PACKAGES`, root, ADB, uinput, `WRITE_SECURE_SETTINGS`, device admin or foreground service.

## 5. Configuration

- **Ride filters:** min fare (₹), max pickup km, min trip km, min ₹/km, operating hours (wraps past midnight; equal = 24 h), max request age, min confidence, required fields, platform toggles, categories, approval mode. Inputs are validated, there is reset-to-defaults, and a live summary.
- Defaults are **illustrative**. They are not earnings advice.
- Missing data is shown as "not detected" or "—", never as 0. A fare of 0 counts as missing. A pickup distance of 0 km is valid.

## 6. Tests

| Suite | Command | Status (this environment) |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | ✅ passed |
| ESLint | `yarn lint` | ✅ passed |
| Jest, 60 tests in 7 suites (engine, parsers, machine, fingerprint, redact, store/acceptance pipeline, bridge wrapper) | `npx jest --runInBand` | ✅ 60/60 passed |
| Kotlin unit tests (`RideEventNormalizerTest`) | `gradlew.bat :ride-assist:testDebugUnitTest` | ⛔ not executed (no Gradle/Android SDK here) |
| Instrumentation (`RideAssistInstrumentationTest`) | `gradlew.bat :ride-assist:connectedAndroidTest` | ⛔ not executed (needs a device) |
| `assembleDebug` | see §3 | ⛔ not executed. Kotlin has **not** been compiled here, so check for compile errors on first build |

**Verified only with mocked or simulated data:** parsing of Rapido/Uber/Ola notification text, the acceptance evidence flow, and permission-state UI.

**Needs a physical Android phone:** real notification capture, permission revocation, accessibility observation, and restart/process-death recovery of native buffered events.

**Needs supported third-party app versions:** real notification formats, package IDs, and any future interaction adapter.

## 7. Known limitations

- Notification formats for Rapido/Uber/Ola are **not verified**. Parsers use conservative heuristics and report missing fields rather than guessing.
- No automatic acceptance adapter exists. `nativeAcceptanceProvider.isSupported()` returns `false`, and "Auto (where permitted)" mode logs that it is unavailable and leaves the request for manual approval.
- OCR (ML Kit) is **not included**. Notification text and accessibility node text come first, and adding OCR without a verified need would increase privacy risk. It can be added as a separate adapter later.
- Latency figures are measured in-app but not benchmarked on a physical device.
- The native module source is not compiled in this environment.

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| Dashboard shows SIM PREVIEW | You are in Expo Go or the web preview. Build a standalone APK (§3). |
| PERMISSION REQUIRED | Grant notification access (§4), then pull to refresh on the Dashboard. |
| No requests detected | Check the package id on the platform screen, make sure monitoring is ON, and confirm the driver app actually posts notifications. |
| Requests always rejected | Open **Rule checks** on the card to see each failed rule, then adjust filters. |
| Outcome UNKNOWN | Verify in the driver app, then tap **Verify** on the card. |
| Jest hangs | Run `npx jest --runInBand --forceExit`. |

## 9. Privacy & data flows

Everything is local. Nothing is uploaded and there is no analytics or tracking. Logs and exports are redacted: OTPs, passwords, phone numbers and long digit runs are stripped, and full notification content is never stored. Exporting uses the system share sheet and only sends a redacted JSON file.

Third-party libraries: Expo/React Native core, react-native-keyboard-controller, react-native-vector-icons, dayjs, plus Jest for tests.

The Kotlin side has no dependencies beyond AndroidX core and coroutines.
