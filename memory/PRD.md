# RideAssist — PRD

## Original problem statement
Build RideAssist: a real Android ride-request monitoring & acceptance-assistance app for Rapido Captain, Uber Driver, Ola Driver. React Native + TypeScript, Kotlin native integration (NotificationListenerService, optional Accessibility), typed bridge, deterministic rules engine, state machine, dedup, local persistence, redacted diagnostics, manual approval fallback, AcceptanceProvider abstraction distinguishing attempts from confirmed acceptance. No root/ADB/uinput/security bypass. Honest reporting of what is verified.

## User choices
- Full app with real Kotlin notification capture + Simulation Mode for the preview
- ₹ and kilometres
- Driver-focused dark theme

## Architecture
- Expo SDK 58 / RN 0.88 / expo-router, TypeScript strict. No backend (on-device only).
- Pure-TS core: `src/rules/engine.ts`, `src/parsers`, `src/state/machine.ts`, `src/state/fingerprint.ts`, `src/services/redact.ts`
- Store: `src/services/rideStore.ts` (serialized ingest, atomic transitions, expiry sweeper, AsyncStorage persistence, restart recovery)
- Acceptance: `src/services/acceptance.ts` (manual, simulated, native=UNAVAILABLE)
- Bridge: `src/services/nativeBridge.ts`; Kotlin Expo local module `modules/ride-assist/android`
- Screens: Dashboard, Requests, History, Settings tabs + /filters + /platform/[id]

## Implemented (2026-06)
- All 5 required screen areas, simulation pipeline, manual confirmation sheet, UNKNOWN verification
- Kotlin: NotificationListenerService (package validation, group summary skip, redaction, dedup, buffered delivery), read-only AccessibilityService, module bridge, unit + instrumentation tests (not executed here)
- 60 Jest tests passing; tsc + ESLint clean; testing agent iteration 1 at ~88% pass, then all 6 reported bugs fixed
- (2026-06) Earnings Insights (/earnings + Dashboard card): today / last-7-days ₹ totals, weighted ₹/km, per-platform, simulated toggle — CONFIRMED accepted rides only, detected fares labelled as estimates
- (2026-06) Notification Capture Tool (/capture): redacted live + pasted samples, parse result, ride/not-ride labels, parser agreement %, export/clear
- (2026-06) Spoken Ride Alerts: on-device expo-speech (en-IN) for eligible requests, once per ride, test button; 70 Jest tests passing; testing agent iteration 3 all pass

## Backlog
- P0: Build APK on Windows (`npx expo prebuild` + `gradlew.bat assembleDebug`), run Kotlin tests, verify real notification formats/package IDs on device
- P1: Room migration if dataset grows; on-device ML Kit OCR adapter (only if notification/node text is insufficient)
- P1: Per-platform verified interaction adapter (only if permitted)
- P2: Earnings/time analytics summary, CSV export
