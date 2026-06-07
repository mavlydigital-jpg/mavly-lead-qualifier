// Shared qualification logic — used by both client UI and server tests/exports.

export type LeadQa = {
  status: "Pending" | "Review" | "Qualified" | "Removed";
  removed: boolean;
  removeReason: string;
  duplicateGroup: string;
  phoneType: "Mobile" | "Landline" | "VoIP" | "Toll-free" | "Unknown";
  phoneValid: "Yes" | "No" | "Unknown";
  twilioLineType: string;
  twilioCarrier: string;
  twilioEvidence: string;
  runningAds: "Yes" | "No" | "Unknown";
  googleActiveAdCount: string;
  googleAdFormats: string;
  googleAdsNotes: string;
  metaAds: "Yes" | "No" | "Unknown";
  metaActiveAdCount: string;
  metaOfferAngle: string;
  metaNotes: string;
  gbpScore: number;
  googleRating: string;
  reviewCount: string;
  gbpNotes: string;
  fitRating: "Hot" | "Warm" | "Cold" | "Unrated";
  nextStep: string;
  notes: string;
  smsTag: boolean;
  callTag: boolean;
  lastUpdated: string;
};

export type LeadRecord = {
  id: number;
  sessionId: number;
  position: number;
  raw: Record<string, string>;
  qa: LeadQa;
};

export const PHONE_TYPES = ["Mobile", "Landline", "VoIP", "Toll-free", "Unknown"] as const;
export const FIT_RATINGS = ["Hot", "Warm", "Cold"] as const;
export const FILTER_CHIPS = ["All", "Pending", "Qualified", "Removed"] as const;
export const GRADE_LABELS = ["Hot", "Warm", "Review", "Remove", "Removed"] as const;

export function defaultQa(): LeadQa {
  return {
    status: "Pending",
    removed: false,
    removeReason: "",
    duplicateGroup: "",
    phoneType: "Unknown",
    phoneValid: "Unknown",
    twilioLineType: "",
    twilioCarrier: "",
    twilioEvidence: "",
    runningAds: "Unknown",
    googleActiveAdCount: "",
    googleAdFormats: "",
    googleAdsNotes: "",
    metaAds: "Unknown",
    metaActiveAdCount: "",
    metaOfferAngle: "",
    metaNotes: "",
    gbpScore: 0,
    googleRating: "",
    reviewCount: "",
    gbpNotes: "",
    fitRating: "Unrated",
    nextStep: "",
    notes: "",
    smsTag: false,
    callTag: false,
    lastUpdated: "",
  };
}

export function migrateQa(partial: Partial<LeadQa> | null | undefined): LeadQa {
  return { ...defaultQa(), ...(partial || {}) };
}

// Named HTML entities we actually see in scraped lead data.
const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
  hellip: "...",
};

/**
 * Strip HTML markup from a raw field value.
 *
 * BBB (and some CSV exports) wrap matched search terms in <em>…</em> highlight
 * tags and emit HTML entities. Those tags would flow straight into the GHL
 * import, so we remove tags, decode common entities, and collapse whitespace.
 * Casing is intentionally left untouched.
 */
export function stripHtml(value: string): string {
  if (!value || (value.indexOf("<") === -1 && value.indexOf("&") === -1)) {
    return value;
  }
  return value
    // Decode entities first so any encoded tags (&lt;em&gt;) become real tags
    // and then get removed by the tag pass below.
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
      if (body[0] === "#") {
        const code =
          body[1] === "x" || body[1] === "X"
            ? parseInt(body.slice(2), 16)
            : parseInt(body.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      const named = HTML_ENTITIES[body.toLowerCase()];
      return named !== undefined ? named : match;
    })
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Field accessors against raw CSV columns ---
function findField(lead: LeadRecord, names: string[]): string {
  const raw = lead.raw || {};
  const lowered = Object.entries(raw).map(([k, v]) => [k, k.toLowerCase(), v] as const);
  for (const target of names) {
    const exact = Object.keys(raw).find((k) => k === target);
    if (exact && raw[exact]) return stripHtml(raw[exact]);
  }
  for (const target of names) {
    const found = lowered.find(([, kl]) => kl.includes(target.toLowerCase()));
    if (found) return stripHtml(raw[found[0]] || "");
  }
  return "";
}

export const leadCompany = (l: LeadRecord) =>
  findField(l, ["Company Name", "Company", "Business Name", "Name", "Lead Name"]) || "Untitled lead";
export const leadOwner = (l: LeadRecord) =>
  findField(l, ["Owner / Contact", "Owner", "Contact Name", "Owner / Principal", "First Name"]);
export const leadPhone = (l: LeadRecord) =>
  findField(l, ["Phone", "Phone E.164", "Phone Display", "Phone Number", "Mobile"]);
export const leadWebsite = (l: LeadRecord) =>
  findField(l, ["Website", "Website / URL", "URL", "Source URL"]);
export const leadCity = (l: LeadRecord) => findField(l, ["City", "City / Area", "Area"]);
export const leadState = (l: LeadRecord) => findField(l, ["State"]);
export const leadNotes = (l: LeadRecord) => findField(l, ["Notes", "Fit Notes", "Category / Specialty"]);
export { findField };

// --- Scoring & grading ---
export function qaScore(lead: LeadRecord): number {
  if (lead.qa.removed) return 0;
  let score = 0;
  if (lead.qa.phoneType === "Mobile") score += 25;
  if (lead.qa.phoneType === "VoIP") score += 12;
  if (lead.qa.phoneType === "Toll-free") score += 8;
  if (lead.qa.phoneType === "Landline") score -= 18;
  if (lead.qa.phoneValid === "No") score -= 35;
  if (lead.qa.runningAds === "Yes") score += 18;
  if (lead.qa.runningAds === "No") score += 6;
  if (lead.qa.metaAds === "Yes") score += 22;
  if (lead.qa.metaAds === "No") score += 6;
  score += Number(lead.qa.gbpScore || 0) * 7;
  if (lead.qa.fitRating === "Hot") score += 20;
  if (lead.qa.fitRating === "Warm") score += 12;
  if (lead.qa.fitRating === "Cold") score += 3;
  return Math.max(0, Math.min(100, score));
}

export type Grade = {
  label: (typeof GRADE_LABELS)[number];
  tone: "good" | "warn" | "bad" | "blue";
  action: string;
};

export function leadGrade(lead: LeadRecord): Grade {
  if (lead.qa.removed) return { label: "Removed", tone: "bad", action: "Removed from good export" };
  const score = qaScore(lead);
  const wrongOrInvalid = lead.qa.phoneValid === "No" || lead.qa.fitRating === "Cold";
  if (wrongOrInvalid) return { label: "Remove", tone: "bad", action: "Likely remove unless research says otherwise" };
  if (score >= 76) return { label: "Hot", tone: "good", action: "Prioritize for SMS/call" };
  if (score >= 56) return { label: "Warm", tone: "warn", action: "Keep and personalize" };
  return { label: "Review", tone: "blue", action: "Needs more evidence" };
}

// --- Checklist ---
export type ChecklistItem = { label: string; done: boolean };

export function checklistItems(lead: LeadRecord): ChecklistItem[] {
  const phoneDone = lead.qa.phoneType !== "Unknown" || Boolean(lead.qa.twilioEvidence);
  const gbpDone = Boolean(lead.qa.gbpScore || lead.qa.googleRating || lead.qa.reviewCount || lead.qa.gbpNotes);
  const googleDone =
    lead.qa.runningAds !== "Unknown" ||
    Boolean(lead.qa.googleActiveAdCount || lead.qa.googleAdFormats || lead.qa.googleAdsNotes);
  const metaDone =
    lead.qa.metaAds !== "Unknown" ||
    Boolean(lead.qa.metaActiveAdCount || lead.qa.metaOfferAngle || lead.qa.metaNotes);
  const finalDone = lead.qa.status === "Qualified" || lead.qa.removed || lead.qa.fitRating !== "Unrated";
  return [
    { label: "Phone checked", done: phoneDone },
    { label: "GBP checked", done: gbpDone },
    { label: "Google Ads checked", done: googleDone },
    { label: "Meta Ads checked", done: metaDone },
    { label: "Final decision", done: finalDone },
  ];
}

export function checklistSummary(lead: LeadRecord) {
  const items = checklistItems(lead);
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, percent: Math.round((done / items.length) * 100), items };
}

export function completionScore(lead: LeadRecord): number {
  return (
    [leadOwner(lead), leadPhone(lead), leadWebsite(lead), leadCity(lead), lead.qa.twilioEvidence, lead.qa.gbpScore]
      .filter(Boolean).length + (lead.qa.status === "Qualified" ? 2 : 0)
  );
}

// --- Phone normalization ---
export function normalizePhoneForKey(value: string): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

export function normalizeCompanyForKey(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(llc|inc|ltd|corp|corporation|co|company|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function e164Phone(value: string): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (String(value || "").trim().startsWith("+")) return `+${digits}`;
  return String(value || "").trim();
}

export function mapTwilioLineType(lineType = ""): LeadQa["phoneType"] {
  const value = String(lineType || "").toLowerCase();
  if (value.includes("mobile")) return "Mobile";
  if (value.includes("voip")) return "VoIP";
  if (value.includes("landline")) return "Landline";
  if (value.includes("fixed")) return "Landline";
  if (value.includes("toll")) return "Toll-free";
  return "Unknown";
}

// VoIP numbers ring fine on a call but don't reliably receive SMS, so a VoIP
// lead should be routed to calling. Returns the channel-tag overrides to apply
// whenever a lead's phone type is (re)classified. Other types are left untouched
// so existing manual SMS/Call choices are preserved.
export function channelPatchForPhoneType(phoneType: LeadQa["phoneType"]): Partial<LeadQa> {
  if (phoneType === "VoIP") return { callTag: true, smsTag: false };
  return {};
}

// --- Duplicate detection ---
export type DedupResult = { removedIds: number[]; updates: Map<number, { reason: string; group: string; note: string }> };

export function detectDuplicates(leads: LeadRecord[]): DedupResult {
  const groups = new Map<string, LeadRecord[]>();
  for (const lead of leads) {
    const phoneKey = normalizePhoneForKey(leadPhone(lead));
    const displayCompany = leadCompany(lead);
    const companyKey = displayCompany === "Untitled lead" ? "" : normalizeCompanyForKey(displayCompany);
    const cityKey = normalizeCompanyForKey(leadCity(lead));
    if (!companyKey && !phoneKey) continue;
    const key = phoneKey && phoneKey.length >= 10 ? `phone:${phoneKey}` : `company:${companyKey}|${cityKey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(lead);
  }
  const removedIds: number[] = [];
  const updates = new Map<number, { reason: string; group: string; note: string }>();
  groups.forEach((items, key) => {
    if (items.length < 2) return;
    items.sort((a, b) => completionScore(b) - completionScore(a));
    const keeper = items[0];
    items.slice(1).forEach((lead) => {
      if (lead.qa.removed) return;
      removedIds.push(lead.id);
      updates.set(lead.id, {
        reason: "Duplicate",
        group: key,
        note: [lead.qa.notes, `Duplicate of ${leadCompany(keeper)}`].filter(Boolean).join(" | "),
      });
    });
  });
  return { removedIds, updates };
}
