import { describe, expect, it } from "vitest";
import { parseCSV, toCSV, buildGhlRows, buildAuditRows, isSmsLead, isCallLead, GHL_HEADERS } from "./csv";
import { defaultQa, type LeadRecord } from "@shared/qualify";

function makeLead(id: number, raw: Record<string, string>, qa: Partial<ReturnType<typeof defaultQa>> = {}): LeadRecord {
  return { id, sessionId: 1, position: id, raw, qa: { ...defaultQa(), ...qa } };
}

describe("parseCSV", () => {
  it("parses headers and rows", () => {
    const { headers, rows } = parseCSV("Company Name,Phone\nAcme,5551112222\nBeta,5553334444");
    expect(headers).toEqual(["Company Name", "Phone"]);
    expect(rows.length).toBe(2);
    expect(rows[0]["Company Name"]).toBe("Acme");
  });

  it("handles quoted fields with commas and newlines", () => {
    const { rows } = parseCSV('Company Name,Notes\n"Acme, Inc","Line1\nLine2"');
    expect(rows[0]["Company Name"]).toBe("Acme, Inc");
    expect(rows[0]["Notes"]).toBe("Line1\nLine2");
  });

  it("handles escaped quotes", () => {
    const { rows } = parseCSV('Name\n"He said ""hi"""');
    expect(rows[0]["Name"]).toBe('He said "hi"');
  });
});

describe("toCSV", () => {
  it("escapes special chars and wraps phones for excel safety", () => {
    const csv = toCSV(["Company Name", "Phone"], [{ "Company Name": "Acme, Inc", Phone: "+15551112222" }], {
      excelSafePhones: true,
    });
    expect(csv).toContain('"Acme, Inc"');
    expect(csv).toContain('="+15551112222"');
  });
});

describe("export selectors", () => {
  it("sms export is mobile valid leads only", () => {
    const mobile = makeLead(1, { Phone: "5551112222" }, { phoneType: "Mobile" });
    const landline = makeLead(2, { Phone: "5553334444" }, { phoneType: "Landline" });
    const removed = makeLead(3, { Phone: "5555556666" }, { phoneType: "Mobile", removed: true });
    expect(isSmsLead(mobile)).toBe(true);
    expect(isSmsLead(landline)).toBe(false);
    expect(isSmsLead(removed)).toBe(false);
  });

  it("call export is non-mobile valid leads only (mobile is strictly SMS)", () => {
    const landline = makeLead(2, { Phone: "5553334444" }, { phoneType: "Landline" });
    const voip = makeLead(4, { Phone: "5557778888" }, { phoneType: "VoIP" });
    const mobile = makeLead(5, { Phone: "5551112222" }, { phoneType: "Mobile" });
    const invalid = makeLead(3, { Phone: "5550000000" }, { phoneValid: "No" });
    expect(isCallLead(landline)).toBe(true);
    expect(isCallLead(voip)).toBe(true);
    expect(isCallLead(mobile)).toBe(false);
    expect(isCallLead(invalid)).toBe(false);
  });
});

describe("buildGhlRows", () => {
  it("produces GHL header-aligned rows with tags", () => {
    const lead = makeLead(1, { "Company Name": "Acme", Phone: "5551112222", "Owner / Contact": "Jane Doe" }, {
      phoneType: "Mobile",
      fitRating: "Hot",
      runningAds: "Yes",
    });
    const rows = buildGhlRows([lead], "sms");
    expect(Object.keys(rows[0])).toEqual(GHL_HEADERS);
    expect(rows[0].Phone).toBe("+15551112222");
    expect(rows[0]["First Name"]).toBe("Jane");
    expect(String(rows[0].Tags)).toContain("mavly-sms");
  });
});

describe("buildAuditRows", () => {
  it("appends QA columns to raw headers", () => {
    const lead = makeLead(1, { "Company Name": "Acme", Phone: "5551112222" }, { status: "Qualified" });
    const { headers, rows } = buildAuditRows([lead], ["Company Name", "Phone"]);
    expect(headers).toContain("QA Status");
    expect(headers).toContain("QA Lead Score");
    expect(rows[0]["QA Status"]).toBe("Qualified");
  });
});
