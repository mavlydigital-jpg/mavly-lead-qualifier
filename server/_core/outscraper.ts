import { ENV } from "./env";
import { stripHtml } from "@shared/qualify";
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
  return {
    "Company Name": stripHtml(String(item?.name || "").trim()),
    Phone: String(item?.phone || "").trim(),
    Website: String(item?.site || "").trim(),
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
