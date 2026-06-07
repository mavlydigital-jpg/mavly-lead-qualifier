// Client-side CSV parsing + export builders for the Lead Qualifier.
import {
  type LeadRecord,
  qaScore,
  leadGrade,
  checklistSummary,
  leadCompany,
  leadOwner,
  leadPhone,
  leadWebsite,
  leadCity,
  leadState,
  e164Phone,
  findField,
} from "@shared/qualify";

// --- CSV parsing ---
export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        records.push(row);
        row = [];
        field = "";
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  const nonEmpty = records.filter((r) => r.some((cell) => cell.trim() !== ""));
  if (!nonEmpty.length) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").trim();
    });
    return obj;
  });
  return { headers, rows };
}

// --- CSV serialization ---
function csvCell(value: unknown, excelSafePhone = false): string {
  const s = String(value ?? "");
  if (excelSafePhone && /^\+?\d[\d\s().-]+$/.test(s) && s.replace(/\D/g, "").length >= 7) {
    // Excel-safe phone wrapper — emit `="+1555..."` as the final cell value so
    // spreadsheet apps treat it as a literal string. The wrapper already
    // contains quotes so it is its own complete cell — do not double-escape.
    return `="${s}"`;
  }
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCSV(
  headers: string[],
  rows: Record<string, unknown>[],
  opts: { excelSafePhones?: boolean } = {},
): string {
  const lines = [headers.map((h) => csvCell(h)).join(",")];
  for (const row of rows) {
    lines.push(
      headers
        .map((h) => {
          const isPhone = /phone/i.test(h);
          return csvCell(row[h], opts.excelSafePhones && isPhone);
        })
        .join(","),
    );
  }
  return lines.join("\n");
}

export function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- QA field labels included in audit exports ---
export const QA_FIELDS = [
  "QA Status",
  "QA Lead Score",
  "QA Lead Grade",
  "QA Checklist Complete",
  "QA Removed",
  "QA Remove Reason",
  "QA Phone Type",
  "QA Phone Valid",
  "QA Twilio Line Type",
  "QA Twilio Carrier",
  "QA Twilio Evidence",
  "QA Google Ads",
  "QA Meta Ads",
  "QA GBP Score",
  "QA Google Rating",
  "QA Review Count",
  "QA Fit Rating",
  "QA Next Step",
  "QA Notes",
  "QA SMS Tag",
  "QA Call Tag",
  "QA Channel Tags",
  "QA Last Updated",
];

function qaExportValues(lead: LeadRecord): Record<string, unknown> {
  const grade = leadGrade(lead);
  const checks = checklistSummary(lead);
  const sms = isSmsLead(lead);
  const call = isCallLead(lead);
  const channelTags = [
    sms ? "mavly-sms" : "",
    call ? "mavly-call" : "",
    `mavly-${grade.label.toLowerCase().replace(/\s+/g, "-")}`,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    "QA Status": lead.qa.status,
    "QA Lead Score": qaScore(lead),
    "QA Lead Grade": grade.label,
    "QA Checklist Complete": `${checks.done}/${checks.total}`,
    "QA Removed": lead.qa.removed ? "Yes" : "No",
    "QA Remove Reason": lead.qa.removeReason,
    "QA Phone Type": lead.qa.phoneType,
    "QA Phone Valid": lead.qa.phoneValid,
    "QA Twilio Line Type": lead.qa.twilioLineType,
    "QA Twilio Carrier": lead.qa.twilioCarrier,
    "QA Twilio Evidence": lead.qa.twilioEvidence,
    "QA Google Ads": lead.qa.runningAds,
    "QA Meta Ads": lead.qa.metaAds,
    "QA GBP Score": lead.qa.gbpScore,
    "QA Google Rating": lead.qa.googleRating,
    "QA Review Count": lead.qa.reviewCount,
    "QA Fit Rating": lead.qa.fitRating,
    "QA Next Step": lead.qa.nextStep,
    "QA Notes": lead.qa.notes,
    "QA SMS Tag": sms ? "mavly-sms" : "",
    "QA Call Tag": call ? "mavly-call" : "",
    "QA Channel Tags": channelTags,
    "QA Last Updated": lead.qa.lastUpdated,
  };
}

export function buildAuditRows(leads: LeadRecord[], rawHeaders: string[]) {
  const headers = [...rawHeaders.filter((h) => h && !QA_FIELDS.includes(h)), ...QA_FIELDS];
  const rows = leads.map((lead) => ({ ...lead.raw, ...qaExportValues(lead) }));
  return { headers, rows };
}

// --- GHL export ---
export function ghlTags(lead: LeadRecord, channel: "sms" | "call"): string {
  const grade = leadGrade(lead).label.toLowerCase().replace(/\s+/g, "-");
  const base = channel === "sms" ? "mavly-sms" : "mavly-call";
  // Cross-tag: if a lead is eligible for the other channel too, mark it so
  // downstream workflows can branch without re-querying phone metadata.
  const cross =
    channel === "sms"
      ? isCallLead(lead)
        ? "mavly-call"
        : ""
      : isSmsLead(lead)
        ? "mavly-sms"
        : "";
  return [base, cross, "mavly-qualified", `mavly-${grade}`].filter(Boolean).join(", ");
}

export const GHL_HEADERS = [
  "First Name",
  "Last Name",
  "Company Name",
  "Phone",
  "Website",
  "City",
  "State",
  "Tags",
  "Lead Score",
  "Lead Grade",
  "Phone Type",
  "Google Ads",
  "Meta Ads",
  "GBP Score",
  "Google Rating",
  "Review Count",
  "Fit Rating",
  "Next Step",
  "Notes",
];

export function buildGhlRows(leads: LeadRecord[], channel: "sms" | "call") {
  return leads.map((lead) => {
    const first = findField(lead, ["First Name"]);
    const last = findField(lead, ["Last Name"]);
    const owner = leadOwner(lead);
    const ownerParts = owner && !first ? owner.replace(/\(.*?\)/g, "").split(/\s+/) : [];
    return {
      "First Name": first || ownerParts[0] || "",
      "Last Name": last || ownerParts.slice(1).join(" ") || "",
      "Company Name": leadCompany(lead),
      Phone: e164Phone(leadPhone(lead)),
      Website: leadWebsite(lead),
      City: leadCity(lead),
      State: leadState(lead),
      Tags: ghlTags(lead, channel),
      "Lead Score": qaScore(lead),
      "Lead Grade": leadGrade(lead).label,
      "Phone Type": lead.qa.phoneType,
      "Google Ads": lead.qa.runningAds,
      "Meta Ads": lead.qa.metaAds,
      "GBP Score": lead.qa.gbpScore,
      "Google Rating": lead.qa.googleRating,
      "Review Count": lead.qa.reviewCount,
      "Fit Rating": lead.qa.fitRating,
      "Next Step": channel === "sms" ? "SMS" : "Call",
      Notes: [lead.qa.notes, lead.qa.googleAdsNotes, lead.qa.metaNotes, lead.qa.gbpNotes]
        .filter(Boolean)
        .join(" | "),
    };
  });
}

// --- export selectors ---
// Auto-eligibility (used as the fallback when user hasn't manually tagged).
function autoSmsEligible(lead: LeadRecord): boolean {
  return !lead.qa.removed && Boolean(leadPhone(lead)) && lead.qa.phoneValid !== "No" && lead.qa.phoneType === "Mobile";
}
function autoCallEligible(lead: LeadRecord): boolean {
  return !lead.qa.removed && Boolean(leadPhone(lead)) && lead.qa.phoneValid !== "No";
}

// Manual override: when user has toggled either SMS or Call on the lead,
// trust the explicit choice. Otherwise fall back to auto-eligibility.
export function isSmsLead(lead: LeadRecord): boolean {
  if (lead.qa.removed) return false;
  if (lead.qa.smsTag || lead.qa.callTag) return lead.qa.smsTag;
  return autoSmsEligible(lead);
}

export function isCallLead(lead: LeadRecord): boolean {
  if (lead.qa.removed) return false;
  if (lead.qa.smsTag || lead.qa.callTag) return lead.qa.callTag;
  return autoCallEligible(lead);
}

export function sanitizeBase(name: string): string {
  return (name || "leads").replace(/\.csv$/i, "").replace(/[^a-z0-9-_]+/gi, "_");
}

export function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}
