// Sensitive-content redaction for logs, previews and exported diagnostics.
// The app never persists full notification content; these helpers strip OTPs,
// passwords, phone numbers and other long digit runs before anything is stored.
const SECRET_LABELED_RE = /\b(otp|code|pin)\b[^0-9\n]{0,12}([0-9]{3,8})/gi;
const PASSWORD_RE = /\b(password|passcode|pwd|pass)\b\s*(?:is|:|=|-)?\s*\S+/gi;
const LONG_DIGIT_RUN_RE = /[0-9]{7,}/g;

/** Remove OTP/password/phone-like content. Keeps fare-like amounts (₹ prefix). */
export function redactSensitive(input: string): string {
  return input
    .replace(PASSWORD_RE, (_match, label: string) => `${label} ••••`)
    .replace(SECRET_LABELED_RE, (_match, label: string) => `${label} ••••`)
    .replace(LONG_DIGIT_RUN_RE, "••••••");
}

/** Redact + truncate for previews and log messages. */
export function previewOf(input: string, max = 120): string {
  const redacted = redactSensitive(input.trim());
  return redacted.length > max ? `${redacted.slice(0, max - 1)}…` : redacted;
}

export type RedactableValue = string | number | boolean | null | undefined;

/** Shallow redaction of diagnostic metadata values. */
export function redactMeta(
  meta: Record<string, RedactableValue> | undefined,
): Record<string, string | number | boolean | null> | undefined {
  if (!meta) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined) continue;
    out[key] = typeof value === "string" ? previewOf(value, 160) : value;
  }
  return out;
}
