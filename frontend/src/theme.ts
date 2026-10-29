// Design tokens for RideAssist — single driver-focused dark theme
// (Personality 7 "Dark-First Utility DARK" from /app/design_guidelines.json).
//
// The keys match the "color" block of /app/design_guidelines.json. Components
// build StyleSheets with makeStyles() and read useTheme().colors for color props:
//   const styles = makeStyles((colors) => ({
//     card: { backgroundColor: colors.surfaceSecondary, padding: 16 },
//     title: { color: colors.onSurfaceSecondary, fontSize: 16 },
//   }));
//   const { colors } = useTheme();
//
// The app intentionally ships dark-only (glanceable day/night for working
// drivers); both scheme slots point at the same token set so the device
// setting never flips the palette.

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from "react-native";

export type ColorScheme = "dark";

const dark = {
  // Surfaces: backgrounds, from the screen down to small fills.
  surface: "#121418", // primary canvas
  onSurface: "#F0F2F5", // text and icons on the canvas
  surfaceSecondary: "#1A1D24", // cards, sheets, list rows
  onSurfaceSecondary: "#C5CBD3", // text and icons on cards
  surfaceTertiary: "#222630", // inputs, chips, deepest nesting
  onSurfaceTertiary: "#8F98A8", // text on inputs and chips
  surfaceInverse: "#FFFFFF", // anything popping against the theme
  onSurfaceInverse: "#121418", // text on the inverse surface
  muted: "#7C879B", // captions, timestamps, placeholders

  // Brand
  brand: "#FF6B00",
  onBrand: "#FFFFFF",
  brandPrimary: "#FF6B00", // primary CTA, active states
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#E05E00", // secondary accent
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "rgba(255, 107, 0, 0.15)", // subtle brand moments
  onBrandTertiary: "#FF8C38",

  // Status: semantic only.
  success: "#10B981",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  onWarning: "#121418",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#3B82F6",
  onInfo: "#FFFFFF",

  // Lines
  border: "#2A2F3D",
  borderStrong: "#3E4658",
  divider: "#1F2430",
};

export type ThemeColors = typeof dark;

export const defaultScheme = "dark" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light: dark, dark };

// Typography (loaded with expo-font in app/_layout.tsx).
export const fonts = {
  display: "BarlowCondensed-Bold",
  body: "Barlow-Regular",
  bodyMedium: "Barlow-Medium",
  bodySemiBold: "Barlow-SemiBold",
} as const;

// Spacing / radius tokens from design_guidelines.json ("spacing", "radius_tokens").
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 } as const;

// Pinned dark: keep native chrome dark too.
export function setColorScheme(_scheme: ColorScheme | null) {
  Appearance.setColorScheme?.("dark");
}

setColorScheme?.("dark");

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system === "dark" && themes.dark ? "dark" : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

// Themed StyleSheet hook: builds the sheet from the theme colors and memoizes it
// until the scheme changes. (Generic is kept free of RN's NamedStyles types,
// which no longer ship with react-native 0.88.)
type NamedStyle = ViewStyle | TextStyle | ImageStyle;

export function makeStyles<T extends { [key: string]: NamedStyle }>(factory: (colors: ThemeColors) => T): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)) as T, [colors]);
  };
}
