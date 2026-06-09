import { ENV } from "./env";
import {
  stripHtml,
  mapCarrierTypeToPhoneType,
  channelPatchForPhoneType,
  type LeadQa,
} from "@shared/qualify";
import { NICHE_TERMS } from "./apify";

// Outscraper Google Maps search. Takes a keyword + location and returns
// business listings with phone (the public/cell line on the GBP), website,
// city/state, category, rating and review count. Phone-only — no email
// enrichment (this list feeds cold calling + SMS).
// Docs: https://app.outscraper.com/api-docs#tag/Google-Maps
const API = "https://api.app.outscraper.com";

export function outscraperConfigured(): boolean {
  return Boolean(ENV.outscraperApiKey);
}

function authHeaders(): Record<string, string> {
  return { "X-API-KEY": ENV.outscraperApiKey, "Content-Type": "application/json" };
}

export type OutscraperRunRef = { runId: string; status: string };

// Kick off an async Maps search. Async (not sync) because a scrape can outlast
// the serverless timeout; Outscraper returns a request id we poll.
export async function startMapsRun(input: {
  search: string;
  location: string;
  limit?: number;
}): Promise<OutscraperRunRef> {
  // Outscraper scopes by query text, e.g. "Foundation Repair, Dallas, TX".
  const query = [input.search.trim(), input.location.trim()].filter(Boolean).join(", ");
  const url = new URL(`${API}/maps/search-v3`);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(input.limit ?? 100));
  url.searchParams.set("async", "true");
  url.searchParams.set("language", "en");
  url.searchParams.set("region", "US");
  // Phone Numbers Enricher: each business comes back with carrier name + line
  // type (mobile / landline / voip) so leads are pre-classified at scrape time
  // — no separate Twilio call needed to know whether to SMS or dial. Outscraper
  // flattens this onto each item as phone.phones_enricher.carrier_{name,type}.
  url.searchParams.set("enrichment", "phones_enricher_service");

  const res = await fetch(url.toString(), { headers: authHeaders() });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.errorMessage || json?.error || `Outscraper run failed (${res.status}).`);
  }
  if (!json?.id) throw new Error("Outscraper did not return a request id.");
  return { runId: String(json.id), status: String(json.status || "Pending") };
}

export type OutscraperResult = { status: string; done: boolean; items: any[] };

// Normalize Outscraper status strings to the SUCCEEDED/RUNNING/FAILED set the
// scrape modal already understands (shared with the BBB flow).
export function normalizeStatus(status: string): "SUCCEEDED" | "RUNNING" | "FAILED" {
  const s = (status || "").toLowerCase();
  if (s === "success" || s === "finished" || s === "completed") return "SUCCEEDED";
  if (s === "error" || s === "failed" || s === "canceled" || s === "cancelled") return "FAILED";
  return "RUNNING";
}

// Fetch the request by id. While pending the API answers 202 (or status
// "Pending"); when finished it returns status "Success" with a `data` array of
// arrays (one sub-array per query). We flatten to a flat item list.
export async function getMapsRun(runId: string): Promise<OutscraperResult> {
  const res = await fetch(`${API}/requests/${encodeURIComponent(runId)}`, {
    headers: authHeaders(),
  });
  if (res.status === 202) return { status: "Pending", done: false, items: [] };
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.errorMessage || `Outscraper status failed (${res.status}).`);
  }
  const status = String(json?.status || "Pending");
  if (normalizeStatus(status) !== "SUCCEEDED") {
    return { status, done: false, items: [] };
  }
  const data = Array.isArray(json?.data) ? json.data : [];
  const items = data.flat().filter(Boolean);
  return { status, done: true, items };
}

// Column names line up with the field accessors in shared/qualify.ts so a Maps
// scrape imports exactly like a BBB scrape or an uploaded CSV.
export const MAPS_HEADERS = [
  "Company Name",
  "Phone",
  "Phone Line Type",
  "Phone Carrier",
  "Website",
  "City",
  "State",
  "Category",
  "Google Rating",
  "Review Count",
  "Address",
  "Maps URL",
  "Notes",
] as const;

// The Phone Numbers Enricher flattens onto each Maps item as
// `phone.phones_enricher.carrier_type` / `carrier_name`. We also tolerate a few
// alternate shapes (nested object, alternate key prefixes) so a change in
// Outscraper's flattening doesn't silently drop the data.
export function extractPhoneEnrichment(item: any): { carrierType: string; carrierName: string } {
  if (!item || typeof item !== "object") return { carrierType: "", carrierName: "" };
  const flatType =
    item["phone.phones_enricher.carrier_type"] ??
    item["phones_enricher.carrier_type"] ??
    item?.phones_enricher?.carrier_type ??
    item?.phone?.phones_enricher?.carrier_type ??
    "";
  const flatName =
    item["phone.phones_enricher.carrier_name"] ??
    item["phones_enricher.carrier_name"] ??
    item?.phones_enricher?.carrier_name ??
    item?.phone?.phones_enricher?.carrier_name ??
    "";
  return {
    carrierType: String(flatType || "").trim(),
    carrierName: String(flatName || "").trim(),
  };
}

// Niche allowlist — same foundation/waterproofing/crawl-space terms as BBB,
// matched against the Maps name + category + type + subtypes.
export function matchesNicheMaps(item: any): boolean {
  const subtypes = Array.isArray(item?.subtypes) ? item.subtypes.join(" ") : item?.subtypes || "";
  const haystack =
    `${item?.name || ""} ${item?.category || ""} ${item?.type || ""} ${subtypes}`.toLowerCase();
  return NICHE_TERMS.some((t) => haystack.includes(t));
}

export function mapMapsItemToRow(item: any): Record<string, string> {
  // Build a de-duped category string from the richest available fields. Each
  // term is compared case-insensitively so "Foundation"/"foundation" collapse.
  const subtypeList = Array.isArray(item?.subtypes)
    ? item.subtypes
    : String(item?.subtypes || "").split(",");
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of [item?.category, item?.type, ...subtypeList]) {
    const term = stripHtml(String(raw || "").trim());
    const key = term.toLowerCase();
    if (term && !seen.has(key)) {
      seen.add(key);
      terms.push(term);
    }
  }
  const category = terms.join(", ");
  const state = item?.state_code || item?.state || "";
  const address = item?.full_address || item?.address || "";
  const { carrierType, carrierName } = extractPhoneEnrichment(item);
  const phoneType = mapCarrierTypeToPhoneType(carrierType);
  return {
    "Company Name": stripHtml(String(item?.name || "").trim()),
    Phone: String(item?.phone || "").trim(),
    // Human-readable line type for the table/CSV. Falls back to the raw carrier
    // type string if it doesn't map cleanly to one of our buckets.
    "Phone Line Type": phoneType !== "Unknown" ? phoneType : carrierType,
    "Phone Carrier": carrierName,
    Website: String(item?.site || item?.website || "").trim(),
    City: stripHtml(String(item?.city || "").trim()),
    State: stripHtml(String(state).trim()),
    Category: category,
    "Google Rating": item?.rating != null ? String(item.rating) : "",
    "Review Count": item?.reviews != null ? String(item.reviews) : "",
    Address: stripHtml(String(address).trim()),
    "Maps URL": String(item?.location_link || "").trim(),
    Notes: ["Source: Google Maps", category].filter(Boolean).join(" · "),
  };
}

// Derive the QA patch for a freshly-scraped, enriched Maps item. Pre-fills the
// phone classification from Outscraper so a new scrape lands already sorted into
// SMS-able (Mobile) vs call-only (VoIP / Landline) — the Twilio recheck button
// can still override any of this later. Returns {} when no carrier type came
// back, leaving the lead "Unknown" exactly as before.
export function qaFromMapsItem(item: any): Partial<LeadQa> {
  const { carrierType, carrierName } = extractPhoneEnrichment(item);
  if (!carrierType) return {};
  const phoneType = mapCarrierTypeToPhoneType(carrierType);
  return {
    phoneType,
    // Outscraper returns a carrier type only for live, dialable numbers, so a
    // hit is a reasonable "valid" signal. Twilio can refine this on recheck.
    phoneValid: "Yes",
    outscraperLineType: carrierType,
    outscraperCarrier: carrierName,
    // VoIP → route to calling (texts unreliable on VoIP); mirrors Twilio path.
    ...channelPatchForPhoneType(phoneType),
  };
}
