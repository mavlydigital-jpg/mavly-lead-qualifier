import { describe, it, expect } from "vitest";
import {
  mapMapsItemToRow,
  matchesNicheMaps,
  normalizeStatus,
  extractPhoneEnrichment,
  qaFromMapsItem,
  MAPS_HEADERS,
} from "./outscraper";

const sample = {
  name: "James Bond <em>Foundation</em> Repair",
  phone: "+1 214-621-8771",
  site: "https://example.com",
  city: "Dallas",
  state: "Texas",
  state_code: "TX",
  category: "Foundation",
  type: "Foundation",
  subtypes: ["Foundation", "Concrete contractor"],
  rating: 4.9,
  reviews: 47,
  full_address: "11825 Donore Ln, Dallas, TX 75218",
  location_link: "https://www.google.com/maps/place/...",
  // Flattened shape Outscraper actually returns when phones_enricher is on.
  "phone.phones_enricher.carrier_name": "CELLCO PARTNERSHIP DBA VERIZON",
  "phone.phones_enricher.carrier_type": "mobile",
};

describe("mapMapsItemToRow", () => {
  const row = mapMapsItemToRow(sample);

  it("maps core fields to the shared column names", () => {
    expect(row["Company Name"]).toBe("James Bond Foundation Repair"); // <em> stripped
    expect(row.Phone).toBe("+1 214-621-8771");
    expect(row.Website).toBe("https://example.com");
    expect(row.City).toBe("Dallas");
    expect(row.State).toBe("TX"); // prefers state_code
    expect(row["Google Rating"]).toBe("4.9");
    expect(row["Review Count"]).toBe("47");
    expect(row.Address).toBe("11825 Donore Ln, Dallas, TX 75218");
    expect(row["Maps URL"]).toContain("google.com/maps");
  });

  it("de-dupes the category string", () => {
    expect(row.Category).toBe("Foundation, Concrete contractor");
  });

  it("only emits the declared headers", () => {
    for (const key of Object.keys(row)) {
      expect(MAPS_HEADERS as readonly string[]).toContain(key);
    }
  });

  it("tolerates missing fields", () => {
    const r = mapMapsItemToRow({ name: "Acme" });
    expect(r["Company Name"]).toBe("Acme");
    expect(r.Phone).toBe("");
    expect(r["Google Rating"]).toBe("");
  });
});

describe("matchesNicheMaps", () => {
  it("keeps foundation/waterproofing/crawl-space businesses", () => {
    expect(matchesNicheMaps(sample)).toBe(true);
    expect(matchesNicheMaps({ name: "Aqua Basement Waterproofing" })).toBe(true);
    expect(matchesNicheMaps({ name: "Doe", subtypes: ["Crawl space"] })).toBe(true);
  });
  it("drops off-niche businesses", () => {
    expect(matchesNicheMaps({ name: "Tony's Pizza", category: "Restaurant" })).toBe(false);
    expect(matchesNicheMaps({ name: "Generic Home Builders", category: "Home builder" })).toBe(false);
  });
});

describe("normalizeStatus", () => {
  it("maps Outscraper statuses to the modal set", () => {
    expect(normalizeStatus("Success")).toBe("SUCCEEDED");
    expect(normalizeStatus("Pending")).toBe("RUNNING");
    expect(normalizeStatus("Error")).toBe("FAILED");
  });
});

describe("extractPhoneEnrichment", () => {
  it("reads the flattened phones_enricher keys", () => {
    expect(extractPhoneEnrichment(sample)).toEqual({
      carrierType: "mobile",
      carrierName: "CELLCO PARTNERSHIP DBA VERIZON",
    });
  });
  it("tolerates a nested object shape", () => {
    const nested = { phone: { phones_enricher: { carrier_type: "voip", carrier_name: "Bandwidth" } } };
    expect(extractPhoneEnrichment(nested)).toEqual({ carrierType: "voip", carrierName: "Bandwidth" });
  });
  it("returns empties when no enrichment present", () => {
    expect(extractPhoneEnrichment({ name: "Acme" })).toEqual({ carrierType: "", carrierName: "" });
  });
});

describe("mapMapsItemToRow phone columns", () => {
  const row = mapMapsItemToRow(sample);
  it("fills the line type and carrier columns from enrichment", () => {
    expect(row["Phone Line Type"]).toBe("Mobile");
    expect(row["Phone Carrier"]).toBe("CELLCO PARTNERSHIP DBA VERIZON");
  });
  it("still only emits declared headers", () => {
    for (const key of Object.keys(row)) {
      expect(MAPS_HEADERS as readonly string[]).toContain(key);
    }
  });
});

describe("qaFromMapsItem", () => {
  it("pre-classifies a mobile lead and marks it valid", () => {
    const qa = qaFromMapsItem(sample);
    expect(qa.phoneType).toBe("Mobile");
    expect(qa.phoneValid).toBe("Yes");
    expect(qa.outscraperLineType).toBe("mobile");
    expect(qa.outscraperCarrier).toBe("CELLCO PARTNERSHIP DBA VERIZON");
    // Mobile leaves channel tags untouched (handled at export time).
    expect(qa.callTag).toBeUndefined();
  });
  it("routes VoIP to calling", () => {
    const qa = qaFromMapsItem({ "phone.phones_enricher.carrier_type": "voip" });
    expect(qa.phoneType).toBe("VoIP");
    expect(qa.callTag).toBe(true);
    expect(qa.smsTag).toBe(false);
  });
  it("returns an empty patch when no carrier type", () => {
    expect(qaFromMapsItem({ name: "Acme" })).toEqual({});
  });
});
