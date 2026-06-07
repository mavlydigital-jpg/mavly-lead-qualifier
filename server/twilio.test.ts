import { describe, expect, it } from "vitest";
import { twilioLookup, twilioConfigured, normalizePhone } from "./_core/twilio";

describe("twilio helper", () => {
  it("normalizes phone numbers to E.164", () => {
    expect(normalizePhone("(555) 111-2222")).toBe("+15551112222");
    expect(normalizePhone("1-555-111-2222")).toBe("+15551112222");
  });

  it("has credentials configured", () => {
    expect(twilioConfigured()).toBe(true);
  });

  it("performs a live lookup with the configured credentials", async () => {
    // Twilio's public test number used for documentation examples.
    const result = await twilioLookup("+15108675310");
    if (!result.ok) {
      throw new Error(`Twilio lookup failed — credentials may be invalid: ${result.error}`);
    }
    expect(result.ok).toBe(true);
    expect(result.phone_number).toContain("+1510867531");
  }, 20000);
});
