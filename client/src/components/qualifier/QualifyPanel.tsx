"use client";

import {
  type LeadRecord,
  type LeadQa,
  qaScore,
  leadGrade,
  checklistSummary,
  leadCompany,
  leadOwner,
  leadPhone,
  leadWebsite,
  leadCity,
  leadState,
  leadNotes,
  PHONE_TYPES,
  FIT_RATINGS,
  channelPatchForPhoneType,
} from "@shared/qualify";
import { cn } from "@/lib/utils";
import {
  Phone,
  Globe,
  MapPin,
  Search,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Star,
  Loader2,
  Copy,
  ExternalLink,
  CloudOff,
  Cloud,
  CloudUpload,
  MessageSquare,
  PhoneCall,
} from "lucide-react";
import { toast } from "sonner";
import type { SaveStatus } from "@/hooks/useLeads";

const gradeBadge: Record<string, string> = {
  good: "bg-emerald-400/12 text-emerald-300 border-emerald-400/20",
  warn: "bg-amber-400/12 text-amber-300 border-amber-400/20",
  bad: "bg-[#FF2E63]/12 text-[#ff7a9c] border-[#FF2E63]/24",
  blue: "bg-[#1E88FF]/14 text-[#8bc5ff] border-[#3BA3FF]/24",
};

function safeHref(url: string): string {
  const s = String(url || "").trim();
  if (!s) return "#";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(s)) return `https://${s}`;
  return `https://www.google.com/search?q=${encodeURIComponent(s)}`;
}

export function QualifyPanel({
  lead,
  index,
  total,
  onPatch,
  onPrev,
  onNext,
  onQualify,
  onToggleRemove,
  onTwilio,
  twilioBusy,
  twilioConfigured,
  saveStatus,
  lastSavedAt,
}: {
  lead: LeadRecord;
  index: number;
  total: number;
  onPatch: (patch: Partial<LeadQa>) => void;
  onPrev: () => void;
  onNext: () => void;
  onQualify: () => void;
  onToggleRemove: () => void;
  onTwilio: () => void;
  twilioBusy: boolean;
  twilioConfigured: boolean;
  saveStatus?: SaveStatus;
  lastSavedAt?: number | null;
}) {
  const grade = leadGrade(lead);
  const score = qaScore(lead);
  const checks = checklistSummary(lead);
  const phone = leadPhone(lead);
  const website = leadWebsite(lead);

  const copyPhone = async () => {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      toast.success("Phone copied");
    } catch {
      toast(phone);
    }
  };

  const openResearch = (kind: "google" | "meta" | "transparency") => {
    const name = [leadCompany(lead), leadCity(lead), leadState(lead)].filter(Boolean).join(" ").trim();
    let url = "";
    if (kind === "google") url = `https://www.google.com/search?q=${encodeURIComponent(name + " Google Business Profile ads")}`;
    if (kind === "meta")
      url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&media_type=all&search_type=keyword_unordered&q=${encodeURIComponent(name)}`;
    if (kind === "transparency") url = "https://adstransparency.google.com/";
    if (name && kind !== "google") navigator.clipboard?.writeText(name).catch(() => {});
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_330px]"
      style={{ animation: "fadeUp 0.35s ease-out" }}
    >
      {/* Main column */}
      <div className="flex flex-col gap-5">
        {/* Hero */}
        <GlassCard className="relative overflow-hidden rounded-[28px]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(520px_circle_at_24%_-12%,rgba(30,136,255,0.22),transparent_50%)]" />
          <div className="relative p-5 sm:p-6">
            <div className="flex items-start justify-between gap-5">
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <StatusBadge qa={lead.qa} />
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.05] px-2.5 py-0.5 text-[10px] font-extrabold tracking-wider text-muted-foreground">
                    #{index + 1}
                  </span>
                  <SaveBadge status={saveStatus} lastSavedAt={lastSavedAt} />
                </div>
                <h2 className="truncate text-[28px] font-black leading-tight tracking-tight sm:text-3xl">
                  {leadCompany(lead)}
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Owner ·{" "}
                  <span className="font-semibold text-foreground">
                    {leadOwner(lead) || "Not listed"}
                  </span>
                </p>
              </div>
              <div className="relative grid shrink-0 place-items-center rounded-[22px] bg-[linear-gradient(135deg,#1E88FF,#3BA3FF)] px-5 py-4 text-center text-white shadow-[0_20px_46px_rgba(30,136,255,0.28)]">
                <div className="text-4xl font-black leading-none tracking-tight">{score}</div>
                <div className="mt-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] opacity-85">
                  {grade.label}
                </div>
              </div>
            </div>

            <div className="relative mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <InfoTile icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={phone || "Missing"} />
              <InfoTile
                icon={<MapPin className="h-3.5 w-3.5" />}
                label="Location"
                value={[leadCity(lead), leadState(lead)].filter(Boolean).join(", ") || "Missing"}
              />
              <InfoTile
                icon={<Globe className="h-3.5 w-3.5" />}
                label="Website"
                value={website || "Missing"}
                href={website ? safeHref(website) : undefined}
              />
              <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.05] p-3 sm:col-span-3">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Original notes</div>
                <div className="text-sm">{leadNotes(lead) || "No notes in CSV"}</div>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Qualification sections */}
        <GlassCard className="flex flex-col gap-3 rounded-[28px] p-4">
          {/* Phone */}
          <Section title="Phone" hint="Outscraper at scrape · Twilio recheck">
            <Segmented
              options={PHONE_TYPES as unknown as string[]}
              value={lead.qa.phoneType}
              onChange={(v) => {
                const phoneType = (v || "Unknown") as LeadQa["phoneType"];
                // VoIP → auto-tag for calling (texts unreliable on VoIP).
                onPatch({ phoneType, ...channelPatchForPhoneType(phoneType) });
              }}
              tones={{ Mobile: "good", Landline: "bad", VoIP: "warn" }}
            />
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                onClick={onTwilio}
                disabled={!phone || twilioBusy || !twilioConfigured}
                className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#1E88FF,#3BA3FF)] text-sm font-bold text-primary-foreground shadow-[0_16px_34px_rgba(30,136,255,0.22)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
              >
                {twilioBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {twilioConfigured ? "Twilio check" : "Twilio not configured"}
              </button>
              <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.05] p-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Evidence</div>
                <div className="mt-0.5 line-clamp-2 text-xs">
                  {lead.qa.twilioEvidence ||
                    (lead.qa.outscraperLineType
                      ? [
                          `Outscraper: ${lead.qa.outscraperLineType}`,
                          lead.qa.outscraperCarrier,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : "No lookup yet")}
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <SmallBtn onClick={copyPhone} disabled={!phone}>
                <Copy className="h-3 w-3" /> Copy phone
              </SmallBtn>
            </div>
          </Section>

          {/* Google Ads */}
          <Section title="Google Ads" hint="Transparency Center">
            <Segmented
              options={["Yes", "No", "Unknown"]}
              value={lead.qa.runningAds}
              onChange={(v) =>
                onPatch({ runningAds: (v || "Unknown") as LeadQa["runningAds"] })
              }
              tones={{ Yes: "good", No: "warn" }}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <SmallBtn onClick={() => openResearch("transparency")}>
                <ExternalLink className="h-3 w-3" /> Open Transparency
              </SmallBtn>
              <SmallBtn onClick={() => openResearch("google")}>
                <ExternalLink className="h-3 w-3" /> Google search
              </SmallBtn>
            </div>
            <textarea
              value={lead.qa.googleAdsNotes}
              onChange={(e) => onPatch({ googleAdsNotes: e.target.value })}
              placeholder="Google ads notes..."
              className="mt-2 min-h-[60px] w-full resize-y rounded-2xl border border-white/[0.08] bg-[#0A142D]/70 p-2.5 text-sm text-[#EAF0FF] outline-none placeholder:text-muted-foreground/70 focus:border-[#3BA3FF]/60 focus:ring-2 focus:ring-[#1E88FF]/20"
            />
          </Section>

          {/* Meta Ads */}
          <Section title="Meta Ads" hint="Ad Library">
            <Segmented
              options={["Yes", "No", "Unknown"]}
              value={lead.qa.metaAds}
              onChange={(v) =>
                onPatch({ metaAds: (v || "Unknown") as LeadQa["metaAds"] })
              }
              tones={{ Yes: "good", No: "warn" }}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <SmallBtn onClick={() => openResearch("meta")}>
                <ExternalLink className="h-3 w-3" /> Open Meta Library
              </SmallBtn>
            </div>
            <textarea
              value={lead.qa.metaNotes}
              onChange={(e) => onPatch({ metaNotes: e.target.value })}
              placeholder="Meta offer angle / notes..."
              className="mt-2 min-h-[60px] w-full resize-y rounded-2xl border border-white/[0.08] bg-[#0A142D]/70 p-2.5 text-sm text-[#EAF0FF] outline-none placeholder:text-muted-foreground/70 focus:border-[#3BA3FF]/60 focus:ring-2 focus:ring-[#1E88FF]/20"
            />
          </Section>

          {/* GBP */}
          <Section title="Google Business Profile" hint="1–5 score">
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => onPatch({ gbpScore: n === lead.qa.gbpScore ? 0 : n })}
                  className={cn(
                    "grid h-11 place-items-center rounded-2xl border transition active:scale-[0.97]",
                    n <= lead.qa.gbpScore
                      ? "border-amber-300/30 bg-amber-400/14 text-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.12)]"
                      : "border-white/[0.08] bg-white/[0.05] text-muted-foreground hover:border-amber-300/20 hover:text-amber-300",
                  )}
                >
                  <Star className={cn("h-4 w-4", n <= lead.qa.gbpScore && "fill-amber-400")} />
                </button>
              ))}
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              <LabeledInput
                label="Google rating"
                value={lead.qa.googleRating}
                onChange={(v) => onPatch({ googleRating: v })}
                placeholder="4.8"
              />
              <LabeledInput
                label="Review count"
                value={lead.qa.reviewCount}
                onChange={(v) => onPatch({ reviewCount: v })}
                placeholder="120"
              />
            </div>
          </Section>

          {/* Fit + final */}
          <Section title="Fit & next step" hint="Final decision">
            <Segmented
              options={FIT_RATINGS as unknown as string[]}
              value={lead.qa.fitRating === "Unrated" ? "" : lead.qa.fitRating}
              onChange={(v) =>
                onPatch({ fitRating: (v || "Unrated") as LeadQa["fitRating"] })
              }
              tones={{ Hot: "good", Warm: "warn", Cold: "bad" }}
            />

            {/* Channel — manual SMS / Call toggle. Drives export tagging. */}
            <div className="mt-2.5">
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Channel · how to reach out
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ChannelToggle
                  active={lead.qa.smsTag}
                  onClick={() => onPatch({ smsTag: !lead.qa.smsTag })}
                  icon={<MessageSquare className="h-4 w-4" />}
                  label="SMS"
                  tone="good"
                />
                <ChannelToggle
                  active={lead.qa.callTag}
                  onClick={() => onPatch({ callTag: !lead.qa.callTag })}
                  icon={<PhoneCall className="h-4 w-4" />}
                  label="Call"
                  tone="blue"
                />
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Select one or both. Tag appears in export CSV (<code>mavly-sms</code> / <code>mavly-call</code>).
              </p>
            </div>

            <LabeledInput
              className="mt-2.5"
              label="Next step note (optional)"
              value={lead.qa.nextStep}
              onChange={(v) => onPatch({ nextStep: v })}
              placeholder="e.g. SMS intro then call Tuesday"
            />
            <textarea
              value={lead.qa.notes}
              onChange={(e) => onPatch({ notes: e.target.value })}
              placeholder="Notes..."
              className="mt-2.5 min-h-[70px] w-full resize-y rounded-2xl border border-white/[0.08] bg-[#0A142D]/70 p-2.5 text-sm text-[#EAF0FF] outline-none placeholder:text-muted-foreground/70 focus:border-[#3BA3FF]/60 focus:ring-2 focus:ring-[#1E88FF]/20"
            />
          </Section>
        </GlassCard>
      </div>

      {/* Aside */}
      <div className="flex flex-col gap-4">
        <ActionPanel className="xl:sticky xl:top-4">
          <div className="relative">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-muted-foreground">
                Progress
              </span>
              <span
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold tracking-wider",
                  gradeBadge[grade.tone],
                )}
              >
                {grade.label}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#1E88FF,#3BA3FF)] transition-[width] duration-500"
                style={{ width: `${checks.percent}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {checks.done}/{checks.total} steps · {checks.percent}% complete
            </p>
          </div>

          <div className="relative flex flex-col gap-1.5">
            {checks.items.map((item) => (
              <div
                key={item.label}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-[12px] font-semibold transition",
                  item.done
                    ? "border-emerald-400/20 bg-emerald-400/10 text-foreground"
                    : "border-white/[0.08] bg-white/[0.05] text-muted-foreground",
                )}
              >
                <span>{item.label}</span>
                <span
                  className={cn(
                    "grid h-5 w-5 place-items-center rounded-full text-[10px] font-black text-white transition",
                    item.done
                      ? "bg-emerald-500"
                      : "bg-muted-foreground/30",
                  )}
                >
                  {item.done ? "✓" : ""}
                </span>
              </div>
            ))}
          </div>

          <div className="relative grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={onPrev}
              className="flex h-10 items-center justify-center gap-1 rounded-2xl border border-white/[0.08] bg-white/[0.05] text-xs font-bold transition hover:border-[#3BA3FF]/35 hover:bg-white/[0.08] active:scale-[0.98]"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <button
              onClick={onNext}
              className="flex h-10 items-center justify-center gap-1 rounded-2xl border border-white/[0.08] bg-white/[0.05] text-xs font-bold transition hover:border-[#3BA3FF]/35 hover:bg-white/[0.08] active:scale-[0.98]"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            onClick={onQualify}
            className="relative flex h-12 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-[#12B981] text-sm font-bold text-white shadow-[0_18px_38px_rgba(18,185,129,0.22)] transition hover:brightness-110 active:scale-[0.98]"
          >
            <Check className="h-4 w-4" /> Mark qualified
          </button>
          <button
            onClick={onToggleRemove}
            className={cn(
              "flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-bold transition active:scale-[0.98]",
              lead.qa.removed
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/15"
                : "border-[#FF2E63]/25 bg-[#FF2E63]/10 text-[#ff8baa] hover:bg-[#FF2E63]/15",
            )}
          >
            <X className="h-4 w-4" /> {lead.qa.removed ? "Restore lead" : "Remove lead"}
          </button>
          <p className="text-center text-[11px] text-muted-foreground">
            {index + 1} of {total} · J/K to navigate · Q qualify · X remove
          </p>
        </ActionPanel>
      </div>
    </div>
  );
}

function SaveBadge({ status, lastSavedAt }: { status?: SaveStatus; lastSavedAt?: number | null }) {
  if (!status || status === "idle") return null;
  const map: Record<SaveStatus, { cls: string; icon: React.ReactNode; label: string }> = {
    idle: { cls: "", icon: null, label: "" },
    saving: {
      cls: "bg-[#1E88FF]/14 text-[#8bc5ff] border-[#3BA3FF]/25",
      icon: <CloudUpload className="h-3 w-3 animate-pulse" />,
      label: "Saving…",
    },
    saved: {
      cls: "bg-emerald-400/12 text-emerald-300 border-emerald-400/22",
      icon: <Cloud className="h-3 w-3" />,
      label: lastSavedAt ? `Saved · ${formatTime(lastSavedAt)}` : "Saved",
    },
    error: {
      cls: "bg-[#FF2E63]/12 text-[#ff8baa] border-[#FF2E63]/25",
      icon: <CloudOff className="h-3 w-3" />,
      label: "Save failed",
    },
  };
  const v = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-extrabold tracking-wider",
        v.cls,
      )}
      title={status === "error" ? "Autosave failed. Edit any field to retry." : v.label}
    >
      {v.icon}
      {v.label}
    </span>
  );
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function StatusBadge({ qa }: { qa: LeadQa }) {
  const map: Record<string, string> = {
    Removed: "bg-[#FF2E63]/12 text-[#ff8baa] border-[#FF2E63]/25",
    Qualified: "bg-emerald-400/12 text-emerald-300 border-emerald-400/22",
    Review: "bg-amber-400/12 text-amber-300 border-amber-400/22",
    Pending: "bg-[#1E88FF]/14 text-[#8bc5ff] border-[#3BA3FF]/25",
  };
  const label = qa.removed ? "Removed" : qa.status;
  return <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-extrabold", map[label] || map.Pending)}>{label}</span>;
}

function GlassCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("glass-card", className)}>{children}</div>;
}

function SectionCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="glass-card-soft rounded-[22px] p-4 transition hover:bg-white/[0.06]">
      <div className="mb-3.5 flex items-center justify-between">
        <h3 className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#BFD5FF]">
          {title}
        </h3>
        {hint && (
          <span className="rounded-full border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {hint}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

const Section = SectionCard;

function ActionPanel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <aside className={cn("glass-card relative flex flex-col gap-3.5 overflow-hidden rounded-[28px] p-5", className)}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(360px_circle_at_50%_-10%,rgba(30,136,255,0.18),transparent_52%)]" />
      <div className="relative flex flex-col gap-3.5">{children}</div>
    </aside>
  );
}

function Segmented({
  options,
  value,
  onChange,
  tones,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  tones?: Record<string, "good" | "warn" | "bad">;
}) {
  const toneActive: Record<string, string> = {
    good: "bg-emerald-600 text-white border-transparent",
    warn: "bg-amber-400 text-[#140f05] border-transparent",
    bad: "bg-rose-600 text-white border-transparent",
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt;
        const tone = tones?.[opt];
        return (
          <button
            key={opt}
            onClick={() => onChange(active ? "" : opt)}
            className={cn(
              "flex-1 whitespace-nowrap rounded-full border px-3 py-2 text-xs font-bold transition active:scale-[0.97]",
              active
                ? tone
                  ? toneActive[tone]
                  : "border-transparent bg-primary text-primary-foreground"
                : "border-white/[0.08] bg-white/[0.05] text-muted-foreground hover:border-[#3BA3FF]/30 hover:bg-white/[0.08] hover:text-foreground",
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function InfoTile({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="group rounded-[18px] border border-white/[0.08] bg-white/[0.05] p-3.5 transition hover:border-[#3BA3FF]/20 hover:bg-white/[0.07]">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
        <span className="grid h-5 w-5 place-items-center rounded-md bg-[#1E88FF]/12 text-[#8bc5ff]">
          {icon}
        </span>
        {label}
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-[13px] font-semibold text-[#8bc5ff] transition hover:underline"
        >
          {value}
        </a>
      ) : (
        <div className="truncate text-[13px] font-semibold text-foreground/90">{value}</div>
      )}
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/[0.08] bg-[#0A142D]/70 px-3 py-2.5 text-sm text-[#EAF0FF] outline-none placeholder:text-muted-foreground/70 focus:border-[#3BA3FF]/60 focus:ring-2 focus:ring-[#1E88FF]/20"
      />
    </div>
  );
}

function ChannelToggle({
  active,
  onClick,
  icon,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tone: "good" | "blue";
}) {
  const activeCls =
    tone === "good"
      ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-200 shadow-[0_10px_28px_rgba(16,185,129,0.18)]"
      : "border-[#3BA3FF]/40 bg-[#1E88FF]/18 text-[#bcd9ff] shadow-[0_10px_28px_rgba(30,136,255,0.22)]";
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-bold transition active:scale-[0.98]",
        active
          ? activeCls
          : "border-white/[0.08] bg-white/[0.05] text-muted-foreground hover:border-[#3BA3FF]/30 hover:bg-white/[0.08] hover:text-foreground",
      )}
      aria-pressed={active}
    >
      {icon}
      {label}
      {active && <Check className="h-3.5 w-3.5" />}
    </button>
  );
}

function SmallBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-[11px] font-bold text-muted-foreground transition hover:border-[#3BA3FF]/28 hover:bg-white/[0.08] hover:text-foreground active:scale-[0.97] disabled:opacity-40"
    >
      {children}
    </button>
  );
}
