// Share redacted text: native share sheet on device, clipboard in the web preview.
import { Platform, Share } from "react-native";

export async function exportText(text: string, title: string): Promise<"shared" | "copied"> {
  if (Platform.OS === "web") {
    const clipboard = (globalThis as { navigator?: { clipboard?: { writeText: (t: string) => Promise<void> } } })
      .navigator?.clipboard;
    if (!clipboard) throw new Error("clipboard unavailable");
    await clipboard.writeText(text);
    return "copied";
  }
  await Share.share({ message: text, title });
  return "shared";
}
