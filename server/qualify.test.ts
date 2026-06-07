import { describe, expect, it } from "vitest";
import {
  defaultQa,
  qaScore,
  leadGrade,
  checklistSummary,
  detectDuplicates,
  mapTwilioLineType,
  normalizePhoneForKey,
  e164Phone,
  stripHtml,
  leadCompany,
  PHONE_TYPES,
  FIT_RATINGS,
  FILTER_CHIPS,
  GRADE_LABELS,
  type LeadRecord,
} from "../shared/qualify";

function makeLead(id: number, raw: Record<string, string>, qa: Partial<ReturnType<typeof defaultQa>> = {}): LeadRecord {
  return { id, sessionId: 1, position: id, raw, qa: { ...defaultQa(), ...qa } };
}

describe("constraint labels", () => {
  it("uses exact required string sets", () => {
    expect([...PHONE_TYPES]).toEqual(["Mobile", "Landline", "VoIP", "Toll-free", "Unknown"]);
    expect([...FIT_RATINGS]).toEqual(["Hot", "Warm", "Cold"]);
    expect([...FILTER_CHIPS]).toEqual(["All", "Pending", "Qualified", "Removed"]);
    expect([...GRADE_LABELS]).toEqual(["Hot", "Warm", "Review", "Remove", "Removed"]);
  });
});

describe("stripHtml", () => {
  it("removes <em> highlight tags from scraped names", () => {
    expect(stripHtml("HG FOUNDATION <em>REPAIR</em>")).toBe("HG FOUNDATION REPAIR");
  });

  it("decodes common HTML entities", () => {
    expect(stripHtml("Smith &amp; Sons &#39;Best&#39; Waterproofing")).toBe(
      "Smith & Sons 'Best' Waterproofing",
    );
  });

  it("decodes encoded tags then strips them, and collapses whitespace", () => {
    expect(stripHtml("Acme   &lt;b&gt;Basement&lt;/b&gt;   Co")).toBe("Acme Basement Co");
  });

  it("leaves clean values and casing untouched", () => {
    expect(stripHtml("ABC Foundation Repair")).toBe("ABC Foundation Repair");
    expect(stripHtml("")).toBe("");
  });

  it("cleans the company name read off a lead", () => {
    const lead = makeLead(1, { "Company Name": "HG FOUNDATION <em>REPAIR</em>" });
    expect(leadCompany(lead)).toBe("HG FOUNDATION REPAIR");
  });
});

describe("qaScore", () => {
  it("returns 0 for removed leads", () => {
    const lead = makeLead(1, {}, { removed: true, phoneType: "Mobile", fitRating: "Hot" });
    expect(qaScore(lead)).toBe(0);
  });

  it("rewards mobile + ads + GBP + hot fit and clamps to 100", () => {
    const lead = makeLead(1, {}, {
      phoneType: "Mobile",
      runningAds: "Yes",
      metaAds: "Yes",
      gbpScore: 5,
      fitRating: "Hot",
    });
    expect(qaScore(lead)).toBe(100);
  });

  it("penalizes invalid phone numbers", () => {
    const lead = makeLead(1, {}, { phoneType: "Landline", phoneValid: "No", fitRating: "Cold" });
    expect(qaScore(lead)).toBe(0);
  });
});

describe("leadGrade", () => {
  it("grades a strong lead as Hot", () => {
    const lead = makeLead(1, {}, {
      phoneType: "Mobile",
      runningAds: "Yes",
      metaAds: "Yes",
      gbpScore: 5,
      fitRating: "Hot",
    });
    expect(leadGrade(lead).label).toBe("Hot");
  });

  it("marks invalid phone as Remove", () => {
    const lead = makeLead(1, {}, { phoneValid: "No" });
    expect(leadGrade(lead).label).toBe("Remove");
  });

  it("marks removed leads as Removed", () => {
    const lead = makeLead(1, {}, { removed: true });
    expect(leadGrade(lead).label).toBe("Removed");
  });

  it("uses Review for low-evidence leads", () => {
    const lead = makeLead(1, {}, { phoneType: "Unknown" });
    expect(leadGrade(lead).label).toBe("Review");
  });
});

describe("checklistSummary", () => {
  it("counts five items and tracks completion", () => {
    const empty = makeLead(1, {});
    expect(checklistSummary(empty).total).toBe(5);
    expect(checklistSummary(empty).done).toBe(0);

    const full = makeLead(2, {}, {
      phoneType: "Mobile",
      gbpScore: 4,
      runningAds: "Yes",
      metaAds: "No",
      status: "Qualified",
      fitRating: "Hot",
    });
    expect(checklistSummary(full).percent).toBe(100);
  });
});

describe("detectDuplicates", () => {
  it("keeps the most complete lead and marks others Duplicate", () => {
    const a = makeLead(1, { "Company Name": "Acme", Phone: "(555) 111-2222", City: "Austin", Website: "acme.com" });
    const b = makeLead(2, { "Company Name": "Acme LLC", Phone: "555-111-2222", City: "Austin" });
    const { removedIds, updates } = detectDuplicates([a, b]);
    expect(removedIds).toEqual([2]);
    expect(updates.get(2)?.reason).toBe("Duplicate");
  });

  it("matches by company+city when phone missing", () => {
    const a = makeLead(1, { "Company Name": "Bright Plumbing", City: "Dallas", Website: "x.com" });
    const b = makeLead(2, { "Company Name": "Bright Plumbing Inc", City: "Dallas" });
    const { removedIds } = detectDuplicates([a, b]);
    expect(removedIds.length).toBe(1);
  });

  it("does not flag distinct leads", () => {
    const a = makeLead(1, { "Company Name": "Alpha", Phone: "555-000-0001" });
    const b = makeLead(2, { "Company Name": "Beta", Phone: "555-000-0002" });
    expect(detectDuplicates([a, b]).removedIds).toEqual([]);
  });
});

describe("phone helpers", () => {
  it("normalizes US numbers for keys", () => {
    expect(normalizePhoneForKey("+1 (555) 111-2222")).toBe("5551112222");
    expect(normalizePhoneForKey("555-111-2222")).toBe("5551112222");
  });

  it("builds E.164", () => {
    expect(e164Phone("5551112222")).toBe("+15551112222");
    expect(e164Phone("1-555-111-2222")).toBe("+15551112222");
  });

  it("maps Twilio line types", () => {
    expect(mapTwilioLineType("mobile")).toBe("Mobile");
    expect(mapTwilioLineType("landline")).toBe("Landline");
    expect(mapTwilioLineType("voip")).toBe("VoIP");
    expect(mapTwilioLineType("tollFree")).toBe("Toll-free");
    expect(mapTwilioLineType("")).toBe("Unknown");
  });
});
