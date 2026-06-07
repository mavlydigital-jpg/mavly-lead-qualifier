import { ENV } from "./env";

export type TwilioLookupResult = {
  ok: boolean;
  error?: string;
  phone_number?: string;
  national_format?: string;
  valid?: boolean | null;
  line_type?: string;
  carrier?: string;
};

export function normalizePhone(value: string): string {
  const raw = (value || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  if (raw.startsWith("+")) return "+" + digits;
  return raw;
}

export function twilioConfigured(): boolean {
  return Boolean(ENV.twilioAccountSid && ENV.twilioAuthToken);
}

export async function twilioLookup(phone: string): Promise<TwilioLookupResult> {
  if (!twilioConfigured()) {
    return { ok: false, error: "Twilio credentials are not configured." };
  }
  const normalized = normalizePhone(phone);
  if (!normalized || !normalized.startsWith("+")) {
    return { ok: false, error: "Phone number must be a valid U.S. or E.164 number." };
  }
  const endpoint =
    "https://lookups.twilio.com/v2/PhoneNumbers/" +
    encodeURIComponent(normalized) +
    "?Fields=line_type_intelligence";
  const auth = Buffer.from(`${ENV.twilioAccountSid}:${ENV.twilioAuthToken}`).toString("base64");

  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: payload?.message || `Twilio lookup failed (${response.status}).`,
      };
    }
    const lti = payload.line_type_intelligence || {};
    return {
      ok: true,
      phone_number: payload.phone_number || normalized,
      national_format: payload.national_format || "",
      valid: payload.valid ?? null,
      line_type: lti.type || "",
      carrier: lti.carrier_name || lti.carrier || "",
    };
  } catch (err: any) {
    return { ok: false, error: `Could not reach Twilio: ${err?.message || String(err)}` };
  }
}
