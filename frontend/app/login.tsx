// Sign in / create account / forgot password (emailed 6-digit code) / reset.
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Redirect, useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/src/components/ui";
import { useAuth } from "@/src/services/auth";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Mode = "login" | "register" | "forgot" | "reset";

const TITLES: Record<Mode, { title: string; subtitle: string; cta: string }> = {
  login: { title: "Welcome back", subtitle: "Sign in to keep watching for good rides.", cta: "Sign in" },
  register: { title: "Create account", subtitle: "Use your email and a password (8+ characters).", cta: "Create account" },
  forgot: { title: "Forgot password", subtitle: "We'll email you a 6-digit code.", cta: "Send code" },
  reset: { title: "Set new password", subtitle: "Enter the code from your email and a new password.", cta: "Update password" },
};

// Rotating "assistant thinking" lines shown under the orb.
const STATUS_LINES = [
  "Scanning nearby demand…",
  "Comparing fares to your minimum…",
  "Filtering out long pickups…",
  "Ready when a good ride appears.",
];

// Footer: what the assistant does, so the bottom of the screen is never empty.
const SIGNALS = [
  { title: "Demand zones", body: "Spots where requests are picking up." },
  { title: "Fare check", body: "Rides scored against your own rules." },
  { title: "Pickup distance", body: "Long, low-pay pickups get flagged." },
];

const ORB = 132;
const RING_COUNT = 3;
const PULSE_MS = 3000;

/** Pulsing radar rings + breathing core + orbiting spark. */
function AssistOrb({ reduceMotion }: { reduceMotion: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();

  const rings = useRef(
    Array.from({ length: RING_COUNT }, (_, i) => new Animated.Value(i / RING_COUNT)),
  ).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const orbit = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const running: Animated.CompositeAnimation[] = [];

    // Each ring starts at its own phase, finishes that lap, then loops evenly.
    rings.forEach((v, i) => {
      const phase = i / RING_COUNT;
      const first = Animated.timing(v, {
        toValue: 1,
        duration: PULSE_MS * (1 - phase),
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      });
      running.push(first);
      first.start(({ finished }) => {
        if (!finished) return;
        const loop = Animated.loop(
          Animated.timing(v, {
            toValue: 1,
            duration: PULSE_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          { resetBeforeIteration: true, iterations: -1 },
        );
        running.push(loop);
        v.setValue(0);
        loop.start();
      });
    });

    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    const orbitLoop = Animated.loop(
      Animated.timing(orbit, { toValue: 1, duration: 7000, easing: Easing.linear, useNativeDriver: true }),
    );
    breatheLoop.start();
    orbitLoop.start();
    running.push(breatheLoop, orbitLoop);

    return () => running.forEach((a) => a.stop());
  }, [reduceMotion, rings, breathe, orbit]);

  const coreScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] });
  const spin = orbit.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={styles.orbWrap} accessible={false} importantForAccessibility="no-hide-descendants">
      {rings.map((v, i) => (
        <Animated.View
          key={i}
          style={[
            styles.ring,
            {
              opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
              transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1.25] }) }],
            },
          ]}
        />
      ))}

      {/* Static guide ring the spark travels on */}
      <View style={styles.track} />
      <Animated.View style={[styles.orbitArm, { transform: [{ rotate: spin }] }]}>
        <View style={styles.spark} />
      </Animated.View>

      <Animated.View style={[styles.core, { transform: [{ scale: coreScale }] }]}>
        <View style={styles.coreInner} />
      </Animated.View>
    </View>
  );
}

/** Cross-fading status line that cycles through STATUS_LINES. */
function StatusTicker({ reduceMotion }: { reduceMotion: boolean }) {
  const styles = useStyles();
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
        setIndex((i) => (i + 1) % STATUS_LINES.length);
        Animated.timing(fade, { toValue: 1, duration: 320, useNativeDriver: true }).start();
      });
    }, 2800);
    return () => clearInterval(id);
  }, [reduceMotion, fade]);

  return (
    <View style={styles.ticker}>
      <LiveDot reduceMotion={reduceMotion} />
      <Animated.Text style={[styles.tickerText, { opacity: fade }]} numberOfLines={1}>
        {STATUS_LINES[index]}
      </Animated.Text>
    </View>
  );
}

function LiveDot({ reduceMotion }: { reduceMotion: boolean }) {
  const styles = useStyles();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, pulse]);

  return <Animated.View style={[styles.liveDot, { opacity: pulse }]} />;
}

export default function LoginScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const router = useRouter();
  const auth = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  // Form fades in whenever the mode changes, so the swap reads as a response to the tap.
  const formFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  if (!auth.loading && auth.user) return <Redirect href="/" />;

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setInfo(null);
    setPassword("");
    if (!reduceMotion) {
      formFade.setValue(0);
      Animated.timing(formFade, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    }
  };

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());
  const canSubmit =
    validEmail &&
    (mode === "forgot" || password.length >= (mode === "login" ? 1 : 8)) &&
    (mode !== "reset" || /^\d{6}$/.test(code.trim()));

  const submit = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "login") await auth.login(email, password);
      else if (mode === "register") await auth.register(email, password);
      else if (mode === "forgot") {
        setInfo(await auth.forgotPassword(email));
        setMode("reset");
      } else {
        const message = await auth.resetPassword(email, code, password);
        switchMode("login");
        setInfo(message);
      }
      if (mode === "login" || mode === "register") router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const meta = TITLES[mode];

  return (
    <View style={styles.screen} testID="login-screen">
      {/* Soft brand glow behind the orb */}
      <View pointerEvents="none" style={styles.glow} />

      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          minHeight: height,
          paddingTop: insets.top + spacing.xl,
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: spacing.xl,
          gap: spacing.lg,
        }}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <AssistOrb reduceMotion={reduceMotion} />
          <Text style={styles.brand}>RIDE ASSIST</Text>
          <StatusTicker reduceMotion={reduceMotion} />
        </View>

        <Animated.View style={{ gap: spacing.lg, opacity: formFade }}>
          <View style={{ gap: spacing.xs }}>
            <Text style={styles.title} testID="login-title">{meta.title}</Text>
            <Text style={styles.subtitle}>{meta.subtitle}</Text>
          </View>

          <View style={{ gap: spacing.md }}>
            <TextInput
              testID="login-email-input"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              editable={mode !== "reset"}
            />
            {mode === "reset" && (
              <TextInput
                testID="login-code-input"
                style={styles.input}
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
                placeholder="6-digit code"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                autoComplete="one-time-code"
              />
            )}
            {mode !== "forgot" && (
              <TextInput
                testID="login-password-input"
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder={mode === "reset" ? "New password" : "Password"}
                placeholderTextColor={colors.muted}
                secureTextEntry
                autoCapitalize="none"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                onSubmitEditing={() => canSubmit && !busy && void submit()}
              />
            )}
          </View>

          {error ? <Text style={styles.error} testID="login-error">{error}</Text> : null}
          {info ? <Text style={styles.info} testID="login-info">{info}</Text> : null}

          <PrimaryButton
            label={busy ? "Please wait…" : meta.cta}
            onPress={() => void submit()}
            disabled={!canSubmit || busy}
            testID="login-submit-button"
          />

          <View style={styles.links}>
            {mode === "login" && (
              <>
                <Text style={styles.link} onPress={() => switchMode("forgot")} testID="login-forgot-link">
                  Forgot password?
                </Text>
                <Text style={styles.link} onPress={() => switchMode("register")} testID="login-register-link">
                  New driver? Create account
                </Text>
              </>
            )}
            {mode !== "login" && (
              <Text style={styles.link} onPress={() => switchMode("login")} testID="login-back-link">
                Back to sign in
              </Text>
            )}
            {mode === "reset" && (
              <Text style={styles.link} onPress={() => switchMode("forgot")} testID="login-resend-link">
                Didn&apos;t get a code? Send again
              </Text>
            )}
          </View>
        </Animated.View>

        {/* Pushes the footer to the bottom so no blank gap is left on tall screens */}
        <View style={{ flexGrow: 1 }} />

        <View style={styles.footer} testID="login-footer">
          <View style={styles.footerHeader}>
            <LiveDot reduceMotion={reduceMotion} />
            <Text style={styles.footerHeading}>What your assistant watches</Text>
          </View>
          {SIGNALS.map((s, i) => (
            <View key={s.title} style={[styles.signalRow, i > 0 && styles.signalDivider]}>
              <Text style={styles.signalTitle}>{s.title}</Text>
              <Text style={styles.signalBody}>{s.body}</Text>
            </View>
          ))}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  glow: {
    position: "absolute",
    top: -120,
    alignSelf: "center",
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: colors.brandPrimary,
    opacity: 0.12,
  },

  hero: { alignItems: "center", gap: spacing.md, paddingTop: spacing.md },
  orbWrap: { width: ORB, height: ORB, alignItems: "center", justifyContent: "center" },
  ring: {
    position: "absolute",
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    borderWidth: 2,
    borderColor: colors.brandPrimary,
  },
  track: {
    position: "absolute",
    width: ORB * 0.72,
    height: ORB * 0.72,
    borderRadius: (ORB * 0.72) / 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  orbitArm: {
    position: "absolute",
    width: ORB * 0.72,
    height: ORB * 0.72,
    alignItems: "center",
  },
  spark: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: -5,
    backgroundColor: colors.brandPrimary,
  },
  core: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandPrimary,
  },
  coreInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.surface,
    opacity: 0.9,
  },

  brand: { fontFamily: fonts.display, fontSize: 20, letterSpacing: 2, color: colors.brandPrimary },
  ticker: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 20 },
  tickerText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.onSurfaceTertiary },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },

  title: { fontFamily: fonts.display, fontSize: 34, color: colors.onSurface },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.onSurfaceTertiary },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.lg,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.onSurface,
  },
  error: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.error },
  info: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.success },
  links: { gap: spacing.lg, alignItems: "center", marginTop: spacing.sm },
  link: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.onBrandTertiary, paddingVertical: spacing.xs },

  footer: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    padding: spacing.lg,
    gap: spacing.md,
  },
  footerHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  footerHeading: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.onSurface },
  signalRow: { gap: 2 },
  signalDivider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  signalTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.onSurface },
  signalBody: { fontFamily: fonts.body, fontSize: 13, color: colors.onSurfaceTertiary },
}));