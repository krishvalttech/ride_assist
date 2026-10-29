// Tab-bar helpers shared by the tabs layout and every tab screen.
import { Platform } from "react-native";

/**
 * iOS 26+ renders expo-router NativeTabs (floating liquid-glass bar that
 * overlays content). Older iOS, Android and web use the classic JS <Tabs>,
 * which reserves its own layout space outside the viewport.
 */
export const usesNativeTabs = Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;

/**
 * Bottom chrome already handled by the navigator:
 * - NativeTabs: content flows under the bar → insets.bottom already includes it.
 * - classic JS tabs: the bar is outside the viewport → no extra inset needed.
 */
export const bottomChromeInset = (insetsBottom: number): number => (usesNativeTabs ? insetsBottom : 0);
