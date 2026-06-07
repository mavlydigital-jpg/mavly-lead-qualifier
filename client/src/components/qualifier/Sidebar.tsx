"use client";

import { useMemo } from "react";
import {
  type LeadRecord,
  leadCompany,
  leadOwner,
  leadPhone,
  leadCity,
  leadState,
  leadGrade,
  FILTER_CHIPS,
} from "@shared/qualify";
import { cn } from "@/lib/utils";
import {
  Search,
  UploadCloud,
  FolderOpen,
  FileSpreadsheet,
  ListChecks,
  Sparkles,
} from "lucide-react";

type FilterValue = (typeof FILTER_CHIPS)[number];

export function Sidebar({
  leads,
  currentId,
  onSelect,
  query,
  onQuery,
  filter,
  onFilter,
  onUpload,
  onReset,
  onSwitchSession,
  fileName,
}: {
  leads: LeadRecord[];
  currentId: number | null;
  onSelect: (id: number) => void;
  query: string;
  onQuery: (value: string) => void;
  filter: FilterValue;
  onFilter: (value: FilterValue) => void;
  onUpload: () => void;
  onReset: () => void;
  onSwitchSession: () => void;
  fileName: string;
}) {
  const stats = useMemo(() => {
    const total = leads.length;
    let qualified = 0;
    let removed = 0;
    let reviewed = 0;
    for (const l of leads) {
      if (l.qa.removed) removed++;
      if (l.qa.status === "Qualified") qualified++;
      if (l.qa.status !== "Pending") reviewed++;
    }
    return { total, qualified, removed, reviewed, good: total - removed };
  }, [leads]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (filter === "Pending" && lead.qa.status !== "Pending") return false;
      if (filter === "Qualified" && lead.qa.status !== "Qualified") return false;
      if (filter === "Removed" && !lead.qa.removed) return false;
      if (!q) return true;
      const haystack = [
        leadCompany(lead),
        leadOwner(lead),
        leadPhone(lead),
        leadCity(lead),
        leadState(lead),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [leads, filter, query]);

  return (
    <aside className="flex h-full min-h-0 flex-col gap-3 border-r border-white/[0.08] bg-[#071126]/54 p-3 backdrop-blur-2xl">
      <div className="glass-card rounded-[24px] p-3.5">
        <div className="mb-3 flex items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,#1E88FF,#3BA3FF)] text-xs font-black text-white shadow-[0_0_30px_rgba(30,136,255,0.35)]">
            M
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-extrabold tracking-tight">Mavly</span>
              <Sparkles className="h-3 w-3 text-[#3BA3FF]" />
            </div>
            <div className="truncate text-[11px] text-muted-foreground">{fileName || "No file loaded"}</div>
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search company, phone, city…"
            className="h-10 w-full rounded-2xl border border-white/[0.08] bg-[#0A142D]/80 pl-9 pr-3 text-xs text-[#EAF0FF] outline-none transition placeholder:text-muted-foreground/70 focus:border-[#3BA3FF]/60 focus:ring-2 focus:ring-[#1E88FF]/20"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => onFilter(chip)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[11px] font-bold transition active:scale-[0.95]",
                filter === chip
                  ? "border-[#3BA3FF]/40 bg-[#1E88FF]/20 text-[#EAF0FF] shadow-[0_0_24px_rgba(30,136,255,0.22)]"
                  : "border-white/[0.08] bg-white/[0.04] text-muted-foreground hover:border-white/15 hover:bg-white/[0.07] hover:text-foreground",
              )}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <StatTile label="Total" value={stats.total} />
        <StatTile label="Review" value={stats.reviewed} />
        <StatTile label="Good" value={stats.good} tone="good" />
        <StatTile label="Out" value={stats.removed} tone="bad" />
      </div>

      <div className="glass-card min-h-0 flex-1 overflow-hidden rounded-[24px]">
        <div className="flex items-center gap-2 border-b border-white/[0.08] px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5" />
          Leads
          <span className="ml-auto rounded-full border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 text-[10px] font-black text-foreground">
            {filtered.length}
          </span>
        </div>
        <div className="h-[calc(100%-38px)] overflow-y-auto p-2">
          {!filtered.length ? (
            <div className="grid h-full place-items-center px-6 text-center">
              <div className="text-xs text-muted-foreground">
                <FileSpreadsheet className="mx-auto mb-2 h-6 w-6 opacity-50" />
                No leads match this view.
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filtered.map((lead) => {
                const grade = leadGrade(lead);
                return (
                  <SidebarLeadItem
                    key={lead.id}
                    lead={lead}
                    grade={grade}
                    active={lead.id === currentId}
                    onClick={() => onSelect(lead.id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onSwitchSession}
          className="flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.05] text-[11px] font-bold text-muted-foreground transition hover:border-[#3BA3FF]/35 hover:bg-white/[0.08] hover:text-foreground"
        >
          <FolderOpen className="h-3.5 w-3.5" /> Sessions
        </button>
        <button
          onClick={onUpload}
          className="flex h-10 items-center justify-center gap-1.5 rounded-2xl bg-[linear-gradient(135deg,#1E88FF,#3BA3FF)] text-[11px] font-bold text-white shadow-[0_16px_32px_rgba(30,136,255,0.24)] transition hover:brightness-110 active:scale-[0.98]"
        >
          <UploadCloud className="h-3.5 w-3.5" /> New
        </button>
      </div>
      <button
        onClick={onReset}
        className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-muted-foreground transition hover:border-white/15 hover:bg-white/[0.07] hover:text-foreground"
      >
        Switch session
      </button>
    </aside>
  );
}

const gradeBadge: Record<string, string> = {
  good: "bg-emerald-400/12 text-emerald-300",
  warn: "bg-amber-400/12 text-amber-300",
  bad: "bg-[#FF2E63]/12 text-[#ff7a9c]",
  blue: "bg-[#1E88FF]/14 text-[#8bc5ff]",
};

function SidebarLeadItem({
  lead,
  grade,
  active,
  onClick,
}: {
  lead: LeadRecord;
  grade: ReturnType<typeof leadGrade>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex flex-col gap-1 rounded-[18px] border px-3 py-2.5 text-left transition-all active:scale-[0.99]",
        active
          ? "blue-glow border-[#3BA3FF]/38 bg-[#1E88FF]/14"
          : "border-white/[0.06] bg-[#101832]/52 hover:border-white/12 hover:bg-[#141C38]/80",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-bold tracking-tight text-foreground/95">
          {leadCompany(lead)}
        </span>
        <GradeDot tone={grade.tone} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-muted-foreground">{leadPhone(lead) || "No phone"}</span>
        <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider", gradeBadge[grade.tone])}>
          {grade.label}
        </span>
      </div>
    </button>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "good" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-300"
      : tone === "bad"
        ? "text-[#ff7a9c]"
        : "text-foreground";
  return (
    <div className="glass-card-soft rounded-[16px] px-2 py-2 transition hover:bg-white/[0.07]">
      <div className="truncate text-[8px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-0.5 text-base font-black leading-none tracking-tight", toneClass)}>
        {value}
      </div>
    </div>
  );
}

function GradeDot({ tone }: { tone: "good" | "warn" | "bad" | "blue" }) {
  const map: Record<string, string> = {
    good: "bg-emerald-500",
    warn: "bg-amber-500",
    bad: "bg-rose-500",
    blue: "bg-sky-500",
  };
  return <span className={cn("h-2 w-2 shrink-0 rounded-full", map[tone])} />;
}
