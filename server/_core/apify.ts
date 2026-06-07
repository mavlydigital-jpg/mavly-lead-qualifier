import { ENV } from "./env";
import { stripHtml } from "@shared/qualify";

// BBB listings scraper: takes a keyword + location and returns business
// listings with phone (often the owner's number), address, rating, and
// accreditation. Actor: https://apify.com/piotrv1001/bbb-advanced-scraper
const BBB_ACTOR = "piotrv1001~bbb-advanced-scraper";
const API = "https://api.apify.com/v2";

export function apifyConfigured(): boolean {
  return Boolean(ENV.apifyToken);
}

export type ApifyRunRef = { runId: string; datasetId: string; status: string };

export async function startBbbRun(input: {
  search: string;
  location: string;
  distance?: number;
}): Promise<ApifyRunRef> {
  const res = await fetch(`${API}/acts/${BBB_ACTOR}/runs?token=${ENV.apifyToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      search: input.search,
      location: input.location,
      distance: input.distance ?? 10,
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error?.message || `Apify run failed (${res.status}).`);
  }
  const d = json.data || {};
  return { runId: d.id, datasetId: d.defaultDatasetId, status: d.status };
}

export async function getRun(runId: string): Promise<{ status: string; datasetId: string }> {
  const res = await fetch(`${API}/actor-runs/${runId}?token=${ENV.apifyToken}`);
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `Apify status failed (${res.status}).`);
  const d = json.data || {};
  return { status: d.status, datasetId: d.defaultDatasetId };
}

export async function getDatasetItems(datasetId: string, limit: number): Promise<any[]> {
  const res = await fetch(
    `${API}/datasets/${datasetId}/items?token=${ENV.apifyToken}&clean=true&limit=${limit}`,
  );
  if (!res.ok) throw new Error(`Apify dataset fetch failed (${res.status}).`);
  return (await res.json().catch(() => [])) as any[];
}

// Map a raw BBB item to the flat string-map the qualifier expects. Column
// names line up with the field accessors in shared/qualify.ts so a scrape
// imports exactly like an uploaded CSV.
export const BBB_HEADERS = [
  "Company Name",
  "Phone",
  "City",
  "State",
  "Category",
  "BBB Rating",
  "Accredited",
  "BBB Profile",
  "Notes",
] as const;

// Niche allowlist — keep only foundation repair / waterproofing / crawl space
// businesses. A business qualifies if any of these terms appears in its
// categories, name, or BBB type-of-business text. Plain "General Contractor",
// "Home Builders", painters, etc. (with no niche term) get dropped.
const NICHE_TERMS = [
  "foundation",
  "waterproof",
  "crawl space",
  "crawlspace",
  "basement",
  "pier",
  "underpinning",
  "helical",
  "piling",
  "slab",
  "mudjack",
  "slabjack",
  "concrete leveling",
  "concrete lifting",
  "french drain",
  "sump",
  "structural repair",
  "settlement",
  "moisture",
  "encapsulat",
];

export function matchesNiche(item: any): boolean {
  const cats = Array.isArray(item?.categories) ? item.categories.join(" ") : "";
  const haystack = `${item?.businessName || ""} ${item?.tobText || ""} ${cats}`.toLowerCase();
  return NICHE_TERMS.some((t) => haystack.includes(t));
}

export function mapBbbItemToRow(item: any): Record<string, string> {
  const phone = Array.isArray(item?.phone) ? item.phone[0] : item?.phone || "";
  const categories = stripHtml(
    Array.isArray(item?.categories) ? item.categories.join(", ") : "",
  );
  const accredited =
    item?.accreditationStatus || (item?.bbbMember ? "Accredited" : "");
  const profile = item?.reportUrl ? `https://www.bbb.org${item.reportUrl}` : "";
  return {
    "Company Name": stripHtml(String(item?.businessName || "").trim()),
    Phone: String(phone || "").trim(),
    City: stripHtml(String(item?.city || "").trim()),
    State: stripHtml(String(item?.state || "").trim()),
    Category: categories,
    "BBB Rating": String(item?.rating || "").trim(),
    Accredited: String(accredited || "").trim(),
    "BBB Profile": profile,
    Notes: ["Source: BBB", categories].filter(Boolean).join(" · "),
  };
}
