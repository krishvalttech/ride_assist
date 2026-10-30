// Sign in / create account / forgot password (emailed 6-digit code) / reset.
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
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

export default function LoginScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!auth.loading && auth.user) return <Redirect href="/" />;

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setInfo(null);
    setPassword("");
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
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + spacing.xxxl,
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: spacing.xl,
          gap: spacing.lg,
        }}
      >
        <Text style={styles.brand}>RIDEASSIST</Text>
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
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  brand: { fontFamily: fonts.display, fontSize: 20, letterSpacing: 2, color: colors.brandPrimary },
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
}));
