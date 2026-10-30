// Per-platform configuration: detection toggle, editable (unverified) package
// id, permission status, acceptance assistance, allowed categories.
import { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Chip, EmptyState, KeyValueRow, SectionCard, ToggleRow } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { nativeBridge } from "@/src/services/nativeBridge";
import { rideStore } from "@/src/services/rideStore";
import { platformDisplayName } from "@/src/services/platformRegistry";
import { CATEGORY_OPTIONS } from "@/src/rules/defaults";
import { useRideAssistState } from "@/src/hooks/useRideEngine";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function PlatformConfigScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const state = useRideAssistState();
  const params = useLocalSearchParams<{ id: string }>();

  const validPlatform = (["rapido", "uber", "ola"] as const).find((p) => p === params.id);
  const platform = validPlatform ?? "rapido";
  const config = state.platformConfigs.find((p) => p.platform === platform)!;

  const [packageName, setPackageName] = useState(config.packageName);
  const [installed, setInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    setPackageName(config.packageName);
  }, [config.packageName]);

  useEffect(() => {
    let cancelled = false;
    void nativeBridge.isPackageInstalled(config.packageName).then((result) => {
      if (!cancelled) setInstalled(result);
    });
    return () => {
      cancelled = true;
    };
  }, [config.packageName]);

  const nativeAvailable = nativeBridge.isAvailable();
  const notifState = state.nativePermission?.notificationListener ?? "unavailable";
  const a11yState = state.nativePermission?.accessibility ?? "unavailable";
  const [lastEventAt, setLastEventAt] = useState<number>(0);
  const [batteryOk, setBatteryOk] = useState<boolean | null>(null);
  useEffect(() => {
    const read = () => {
      setLastEventAt(nativeBridge.getPlatformActivity()?.[platform] ?? 0);
      setBatteryOk(nativeBridge.isIgnoringBatteryOptimizations());
    };
    read();
    const timer = setInterval(read, 5000);
    return () => clearInterval(timer);
  }, [platform]);
  // "Connected" only after a REAL event from this app was observed on this phone.
  const detectionStatus = !nativeAvailable
    ? "Needs APK build"
    : notifState !== "granted"
      ? "Permission required"
      : lastEventAt > 0
        ? `Connected · last event ${new Date(lastEventAt).toLocaleTimeString()}`
        : "Not detected yet";
  const categories = CATEGORY_OPTIONS[platform];

  const commitPackageName = (): boolean => {
    const trimmed = packageName.trim();
    if (!/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i.test(trimmed)) {
      toast.show("Package id looks invalid — expected e.g. com.example.app", "error");
      return false;
    }
    if (trimmed !== config.packageName) {
      rideStore.setPlatformConfig(platform, { packageName: trimmed });
      toast.show(`Package id for ${platformDisplayName(platform)} updated (still unverified)`, "info");
    }
    return true;
  };

  const toggleCategory = (category: string) => {
    const current = state.settings.allowedCategories[platform] ?? [];
    const next = current.includes(category)
      ? current.filter((c) => c !== category)
      : [...current, category];
    rideStore.setSettings({
      ...state.settings,
      allowedCategories: { ...state.settings.allowedCategories, [platform]: next },
    });
  };

  if (!validPlatform) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]} testID="platform-screen-unknown">
        <EmptyState
          icon="help-circle-outline"
          title="Unknown platform"
          message="RideAssist supports Rapido Captain, Uber Driver and Ola Driver."
          actionLabel="Back to Settings"
          onAction={() => router.replace("/settings")}
          actionTestID="platform-unknown-back"
        />
      </View>
    );
  }

  return (
    <View style={styles.screen} testID={`platform-screen-${platform}`}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: spacing.lg,
          gap: spacing.md,
        }}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>{platformDisplayName(platform)}</Text>
          <Text style={styles.link} onPress={() => {
              if (!commitPackageName()) return;
              if (router.canGoBack()) router.back();
              else router.replace("/settings");
            }}
            testID="platform-close">
            Done
          </Text>
        </View>

        <SectionCard testID="platform-status-card">
          <KeyValueRow
            label="Installed"
            value={installed === null ? "Unknown (needs APK build)" : installed ? "Yes" : "Not found"}
            testID={`platform-installed-${platform}`}
          />
          <KeyValueRow
            label="Notification access"
            value={!nativeAvailable ? "Needs APK build" : notifState === "granted" ? "Granted" : "Not granted"}
          />
          <KeyValueRow
            label="Detection status"
            value={detectionStatus}
            testID={`platform-detection-status-${platform}`}
          />
          <KeyValueRow
            label="Accessibility (Accept tap)"
            value={!nativeAvailable ? "Needs APK build" : a11yState === "granted" ? "Enabled" : "Off"}
          />
          {nativeAvailable && batteryOk === false && (
            <Text style={styles.link} onPress={() => nativeBridge.openBatteryOptimizationSettings()} testID="platform-battery-fix">
              Battery optimisation is ON — Android may stop detection. Tap to allow RideAssist.
            </Text>
          )}
          <KeyValueRow label="Package id verified" value="No — editable below" />
        </SectionCard>

        <SectionCard title="Detection" testID="platform-detection-card">
          <ToggleRow
            label="Detect ride requests"
            description="Only notifications from the package id below are considered."
            value={config.detectionEnabled}
            onValueChange={(v) => rideStore.setPlatformConfig(platform, { detectionEnabled: v })}
            testID={`platform-detection-toggle-${platform}`}
          />
          <View style={styles.packageBlock}>
            <Text style={styles.packageLabel}>Android package id</Text>
            <TextInput
              testID={`platform-package-input-${platform}`}
              style={styles.packageInput}
              value={packageName}
              onChangeText={setPackageName}
              onBlur={() => void commitPackageName()}
              onSubmitEditing={() => void commitPackageName()}
              returnKeyType="done"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
              placeholder="com.example.driverapp"
              placeholderTextColor={colors.onSurfaceTertiary}
            />
            <Text style={styles.packageHint}>
              Pre-filled from common package names and clearly marked UNVERIFIED. Correct it to match the driver app
              installed on your phone — being installed alone never means fully integrated.
            </Text>
          </View>
        </SectionCard>

        <SectionCard testID="platform-acceptance-card">
          <ToggleRow
            label="Auto-tap Accept (Accessibility)"
            description="Off by default. When on and Accessibility is enabled, RideAssist taps the single visible Accept button only if the on-screen fare matches the request that passed your filters. A tap is never counted as accepted until the driver app shows a confirmation."
            value={config.acceptanceAssistEnabled}
            onValueChange={(v) => {
              rideStore.setPlatformConfig(platform, { acceptanceAssistEnabled: v });
              if (v && nativeAvailable && a11yState !== "granted") {
                toast.show("Enable RideAssist in Accessibility settings to allow the tap", "info");
                void nativeBridge.openAccessibilitySettings();
              }
            }}
            testID={`platform-acceptance-toggle-${platform}`}
          />
          <Text style={styles.note}>
            Unverified on real {platformDisplayName(platform)} versions — swipe-only buttons cannot be tapped. RideAssist
            never bypasses security prompts, CAPTCHAs or OTP checks, and does not use root, ADB or uinput injection. If
            the tap is unavailable or fails, accept manually in the driver app.
          </Text>
        </SectionCard>

        <SectionCard
          title="Allowed request categories"
          subtitle="Only used when a category is reliably identified in the notification"
          testID="platform-categories-card"
        >
          <View style={styles.chipWrap}>
            {categories.map((category) => (
              <Chip
                key={category}
                label={category}
                selected={(state.settings.allowedCategories[platform] ?? []).includes(category)}
                onPress={() => toggleCategory(category)}
                testID={`platform-category-${platform}-${category}`}
              />
            ))}
          </View>
          <Text style={styles.note}>
            Missing category data is listed under required-field checks — it is never guessed from unrelated
            notifications.
          </Text>
        </SectionCard>

        <SectionCard title="Why permissions matter" testID="platform-permissions-card">
          <Text style={styles.note}>
            • Notification access (special access): lets RideAssist read ride request notifications from this app
            only.{"\n"}• Accessibility (optional, off by default): reads ride cards on screen, and — only if you switch on
            Auto-tap Accept for this app — taps the single visible Accept button.{"\n"}• Every other app&apos;s notifications are ignored and redacted
            from logs.
          </Text>
        </SectionCard>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 38,
    color: colors.onSurface,
  },
  link: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.onBrandTertiary,
    minHeight: 44,
    textAlignVertical: "center",
    paddingHorizontal: spacing.sm,
  },
  packageBlock: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  packageLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.onSurface,
  },
  packageInput: {
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTertiary,
    color: colors.onSurface,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    paddingHorizontal: spacing.md,
  },
  packageHint: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 15,
    color: colors.onSurfaceTertiary,
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.onSurfaceTertiary,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
}));
