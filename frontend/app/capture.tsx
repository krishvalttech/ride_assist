// Notification Capture Tool: collect redacted samples of real driver-app
// notifications (and pasted ones), see how the parser read them, label the
// truth, and export them so parsers can be tuned to your app versions.
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";

import { Chip, EmptyState, PrimaryButton, SectionCard, ToggleRow } from "@/src/components/ui";
import { ConfirmSheet } from "@/src/components/ConfirmSheet";
import { useToast } from "@/src/components/Toast";
import { parseRideNotification } from "@/src/parsers";
import { buildCaptureSample, rideStore } from "@/src/services/rideStore";
import { nativeBridge } from "@/src/services/nativeBridge";
import { formatINR, PLATFORM_ORDER, platformDisplayName } from "@/src/services/platformRegistry";
import { useRideAssistState } from "@/src/hooks/useRideEngine";
import { exportText } from "@/src/utils/exportText";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { CaptureSample, RidePlatform } from "@/src/models/types";

const km = (v: number | undefined) => (v === undefined ? "—" : `${v} km`);

export default function CaptureScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const state = useRideAssistState();

  const [platform, setPlatform] = useState<RidePlatform>("rapido");
  const [text, setText] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const samples = useMemo(() => [...state.samples].reverse(), [state.samples]);
  const labeled = state.samples.filter((s) => s.label !== null);
  const agreeing = labeled.filter((s) => (s.label === "ride") === s.parsedAsRide).length;

  const parseManual = () => {
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      toast.show("Paste or type the notification text first", "warning");
      return;
    }
    const parsed = parseRideNotification(platform, { title: "", text: trimmed });
    rideStore.addSample(
      buildCaptureSample({ platform, title: "", text: trimmed, source: "notification", simulated: false }, parsed, "manual"),
    );
    setText("");
    toast.show(parsed.isRideRequest ? "Parsed as a ride request — sample saved" : "Not recognised as a ride — sample saved", "info");
  };

  const handleExport = async () => {
    try {
      const result = await exportText(rideStore.buildSamplesExport(), "RideAssist notification samples");
      toast.show(result === "copied" ? "Redacted samples copied to clipboard" : "Samples shared", "success");
    } catch {
      toast.show("Could not export samples on this device", "error");
    }
  };

  return (
    <View style={styles.screen} testID="capture-screen">
      <KeyboardAwareScrollView
        bottomOffset={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: spacing.lg,
          gap: spacing.md,
        }}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Capture Tool</Text>
          <Text
            style={styles.link}
            testID="capture-close"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/settings"))}
          >
            Done
          </Text>
        </View>

        <SectionCard testID="capture-toggle-card">
          <ToggleRow
            label="Capture driver-app notifications"
            description={
              nativeBridge.isAvailable()
                ? "Saves a redacted copy of every notification from your configured driver apps, including ones the parser ignored."
                : "Live capture needs the standalone Android build. In this preview it captures Simulation Mode notifications — or paste real ones below."
            }
            value={state.captureOn}
            onValueChange={(v) => rideStore.setCapture(v)}
            testID="capture-toggle"
          />
          <Text style={styles.note}>
            OTPs, passwords and phone numbers are stripped before saving. Up to 60 samples are kept on this device.
          </Text>
        </SectionCard>

        <SectionCard title="Test the parser" subtitle="Paste a notification you received in the driver app" testID="capture-manual-card">
          <View style={styles.chipWrap}>
            {PLATFORM_ORDER.map((p) => (
              <Chip key={p} label={platformDisplayName(p)} selected={platform === p} onPress={() => setPlatform(p)} testID={`capture-platform-${p}`} />
            ))}
          </View>
          <TextInput
            testID="capture-manual-input"
            style={styles.input}
            value={text}
            onChangeText={setText}
            multiline
            placeholder="e.g. New ride request — ₹184 · Pickup 1.2 km · Trip 6.4 km"
            placeholderTextColor={colors.onSurfaceTertiary}
          />
          <PrimaryButton label="Parse & save sample" onPress={parseManual} testID="capture-manual-parse" />
        </SectionCard>

        <SectionCard title="Parser accuracy" testID="capture-stats-card">
          <Text style={styles.statText} testID="capture-stats">
            {state.samples.length} sample(s) · {labeled.length} labelled
            {labeled.length > 0 ? ` · parser agrees on ${agreeing}/${labeled.length} (${Math.round((agreeing / labeled.length) * 100)}%)` : ""}
          </Text>
          <View style={styles.buttonRow}>
            <View style={styles.flex}>
              <PrimaryButton label="Export samples" onPress={() => void handleExport()} testID="capture-export" disabled={state.samples.length === 0} />
            </View>
            <View style={styles.flex}>
              <PrimaryButton label="Clear" onPress={() => setConfirmClear(true)} testID="capture-clear" tone="neutral" disabled={state.samples.length === 0} />
            </View>
          </View>
        </SectionCard>

        {samples.length === 0 ? (
          <EmptyState
            icon="message-text-clock-outline"
            title="No samples yet"
            message="Turn on capture or paste a notification above. Label each sample so you can see where the parser is wrong."
          />
        ) : (
          samples.map((sample) => <SampleCard key={sample.id} sample={sample} />)
        )}
      </KeyboardAwareScrollView>

      <ConfirmSheet
        visible={confirmClear}
        title="Clear all samples?"
        message="Captured and pasted notification samples are deleted from this device."
        actions={[
          {
            label: "Clear samples",
            tone: "danger",
            testID: "capture-clear-confirm",
            onPress: () => {
              rideStore.clearSamples();
              setConfirmClear(false);
              toast.show("Samples cleared", "info");
            },
          },
        ]}
        onDismiss={() => setConfirmClear(false)}
      />
    </View>
  );
}

function SampleCard({ sample }: { sample: CaptureSample }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const mismatch = sample.label !== null && (sample.label === "ride") !== sample.parsedAsRide;
  return (
    <View testID={`capture-sample-${sample.id}`} style={[styles.sample, mismatch && { borderColor: colors.error }]}>
      <View style={styles.sampleHeader}>
        <Text style={styles.sampleTitle}>
          {platformDisplayName(sample.platform)} · {sample.origin === "manual" ? "pasted" : sample.simulated ? "simulated" : "live"}
        </Text>
        <Text style={styles.sampleTime}>{dayjs(sample.ts).format("DD MMM HH:mm:ss")}</Text>
      </View>
      <Text style={styles.samplePreview}>{sample.preview}</Text>
      <Text style={[styles.sampleParse, { color: sample.parsedAsRide ? colors.success : colors.onSurfaceTertiary }]} testID={`capture-sample-parse-${sample.id}`}>
        {sample.parsedAsRide
          ? `Parsed as ride · fare ${sample.fare !== undefined ? formatINR(sample.fare) : "—"} · pickup ${km(sample.pickupDistanceKm)} · trip ${km(sample.tripDistanceKm)} · ${sample.category ?? "no category"} · ${Math.round(sample.confidence * 100)}%`
          : "Not recognised as a ride request"}
      </Text>
      {mismatch ? (
        <Text style={[styles.sampleParse, { color: colors.error }]} testID={`capture-sample-mismatch-${sample.id}`}>
          Parser disagrees with your label
        </Text>
      ) : null}
      <View style={styles.labelRow}>
        <Chip label="Is a ride" selected={sample.label === "ride"} onPress={() => rideStore.labelSample(sample.id, sample.label === "ride" ? null : "ride")} testID={`capture-label-ride-${sample.id}`} />
        <Chip label="Not a ride" selected={sample.label === "not-ride"} onPress={() => rideStore.labelSample(sample.id, sample.label === "not-ride" ? null : "not-ride")} testID={`capture-label-notride-${sample.id}`} />
        <Pressable onPress={() => rideStore.deleteSample(sample.id)} accessibilityRole="button" style={styles.deleteBtn} testID={`capture-delete-${sample.id}`}>
          <Text style={[styles.deleteText, { color: colors.error }]}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: colors.onSurface },
  link: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.onBrandTertiary,
    minHeight: 44,
    textAlignVertical: "center",
    paddingHorizontal: spacing.sm,
  },
  note: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.onSurfaceTertiary },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  input: {
    minHeight: 88,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTertiary,
    color: colors.onSurface,
    fontFamily: fonts.body,
    fontSize: 14,
    padding: spacing.md,
    textAlignVertical: "top",
  },
  statText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.onSurfaceSecondary },
  buttonRow: { flexDirection: "row", gap: spacing.md },
  flex: { flex: 1 },
  sample: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  sampleHeader: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  sampleTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.onSurface, flexShrink: 1 },
  sampleTime: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },
  samplePreview: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.onSurfaceSecondary },
  sampleParse: { fontFamily: fonts.bodyMedium, fontSize: 11, lineHeight: 15 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap", paddingTop: spacing.xs },
  deleteBtn: { minHeight: 36, justifyContent: "center", paddingHorizontal: spacing.sm, marginLeft: "auto" },
  deleteText: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
}));
