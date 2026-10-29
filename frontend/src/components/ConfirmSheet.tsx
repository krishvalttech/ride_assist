// Bottom confirmation sheet (RN Modal) — replaces Alert dialogs everywhere.
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/src/components/ui";
import { fonts, makeStyles, radius, spacing } from "@/src/theme";

export interface SheetAction {
  label: string;
  onPress: () => void;
  testID: string;
  tone?: "primary" | "danger" | "neutral" | "success";
}

export function ConfirmSheet({
  visible,
  title,
  message,
  actions,
  onDismiss,
}: {
  visible: boolean;
  title: string;
  message?: string;
  actions: SheetAction[];
  onDismiss: () => void;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss} testID="confirm-sheet">
      <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityLabel="Dismiss">
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title} testID="confirm-sheet-title">
            {title}
          </Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actionsWrap}>
            {actions.map((action) => (
              <PrimaryButton
                key={action.testID}
                label={action.label}
                onPress={action.onPress}
                testID={action.testID}
                tone={action.tone ?? "primary"}
              />
            ))}
            <PrimaryButton label="Cancel" onPress={onDismiss} testID="confirm-sheet-cancel" tone="neutral" />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 26,
    color: colors.onSurface,
  },
  message: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.onSurfaceTertiary,
  },
  actionsWrap: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
}));
