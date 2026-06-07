import { useState } from "react";
import { type LeadRecord, leadGrade } from "@shared/qualify";
import {
  buildAuditRows,
  buildGhlRows,
  GHL_HEADERS,
  toCSV,
  download,
  isSmsLead,
  isCallLead,
  sanitizeBase,
  stamp,
} from "@/lib/csv";
import { cn } from "@/lib/utils";
import { Download, MessageSquare, PhoneCall, Flame, CheckCircle2, XCircle, Database } from "lucide-react";
import { toast } from "sonner";

export function ExportBar({
  leads,
  headers,
  fileName,
}: {
  leads: LeadRecord[];
  headers: string[];
  fileName: string;
}) {
  const [open, setOpen] = useState(false);
  const base = sanitizeBase(fileName);

  const exportGhl = (channel: "sms" | "call") => {
    const pool = leads.filter(channel === "sms" ? isSmsLead : isCallLead);
    if (!pool.length) return toast.error(`No ${channel === "sms" ? "mobile" : "valid phone"} leads to export.`);
    download(`${base}_ghl_${channel}_${stamp()}.csv`, toCSV(GHL_HEADERS, buildGhlRows(pool, channel), { excelSafePhones: true }));
    toast.success(`Exported ${pool.length} ${channel.toUpperCase()} leads.`);
  };

  const exportAudit = (label: string, predicate: (l: LeadRecord) => boolean, suffix: string) => {
    const pool = leads.filter(predicate);
    if (!pool.length) return toast.error(`No ${label} leads to export.`);
    const { headers: h, rows } = buildAuditRows(pool, headers);
    download(`${base}_${suffix}_${stamp()}.csv`, toCSV(h, rows, { excelSafePhones: true }));
    toast.success(`Exported ${pool.length} ${label} leads.`);
  };

  const actions = [
    {
      key: "sms",
      label: "GHL SMS",
      desc: "Mobile-only leads",
      icon: <MessageSquare className="h-4 w-4" />,
      run: () => exportGhl("sms"),
      tone: "good",
    },
    {
      key: "call",
      label: "GHL Call",
      desc: "All valid phone leads",
      icon: <PhoneCall className="h-4 w-4" />,
      run: () => exportGhl("call"),
      tone: "blue",
    },
    {
      key: "hotwarm",
      label: "Hot/Warm",
      desc: "Top grades",
      icon: <Flame className="h-4 w-4" />,
      run: () =>
        exportAudit(
          "Hot/Warm",
          (l) => !l.qa.removed && ["Hot", "Warm"].includes(leadGrade(l).label),
          "hot_warm",
        ),
      tone: "warn",
    },
    {
      key: "good",
      label: "Good",
      desc: "All kept leads",
      icon: <CheckCircle2 className="h-4 w-4" />,
      run: () => exportAudit("good", (l) => !l.qa.removed, "good"),
      tone: "good",
    },
    {
      key: "bad",
      label: "Bad/Removed",
      desc: "Removed leads",
      icon: <XCircle className="h-4 w-4" />,
      run: () => exportAudit("removed", (l) => l.qa.removed, "removed"),
      tone: "bad",
    },
    {
      key: "all",
      label: "All",
      desc: "Everything + QA",
      icon: <Database className="h-4 w-4" />,
      run: () => exportAudit("all", () => true, "all"),
      tone: "blue",
    },
  ] as const;

  const toneClass: Record<string, string> = {
    good: "hover:border-emerald-400/30 hover:bg-emerald-400/10",
    warn: "hover:border-amber-400/30 hover:bg-amber-400/10",
    bad: "hover:border-[#FF2E63]/30 hover:bg-[#FF2E63]/10",
    blue: "hover:border-[#3BA3FF]/30 hover:bg-[#1E88FF]/10",
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 items-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#1E88FF,#3BA3FF)] px-4 text-sm font-bold text-primary-foreground shadow-[0_16px_34px_rgba(30,136,255,0.22)] transition hover:brightness-110 active:scale-[0.98]"
      >
        <Download className="h-4 w-4" /> Export
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="glass-card absolute right-0 z-40 mt-2 w-[320px] origin-top-right rounded-[24px] p-2">
            <div className="grid grid-cols-1 gap-1.5">
              {actions.map((a) => (
                <button
                  key={a.key}
                  onClick={() => {
                    a.run();
                    setOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-[18px] border border-transparent bg-white/[0.05] p-3 text-left transition hover:shadow-sm active:scale-[0.99]",
                    toneClass[a.tone],
                  )}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-foreground">
                    {a.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{a.label}</span>
                    <span className="block text-xs text-muted-foreground">{a.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
