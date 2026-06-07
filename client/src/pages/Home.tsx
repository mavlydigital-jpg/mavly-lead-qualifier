"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { parseCSV } from "@/lib/csv";
import { useLeads } from "@/hooks/useLeads";
import { Sidebar } from "@/components/qualifier/Sidebar";
import { QualifyPanel } from "@/components/qualifier/QualifyPanel";
import { Dropzone } from "@/components/qualifier/Dropzone";
import { ExportBar } from "@/components/qualifier/ExportBar";
import { SessionPicker } from "@/components/qualifier/SessionPicker";
import { ScrapeModal } from "@/components/qualifier/ScrapeModal";
import { FILTER_CHIPS } from "@shared/qualify";
import { toast } from "sonner";
import { Loader2, Menu, ScanSearch, Copy as CopyIcon, ShieldCheck, LogIn, LogOut, Globe, X } from "lucide-react";
import { cn } from "@/lib/utils";

type FilterValue = (typeof FILTER_CHIPS)[number];
const STORAGE_KEY = "mavly-current-session";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();

  const [sessionId, setSessionId] = useState<number | null>(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    return saved ? Number(saved) : null;
  });
  const [currentLeadId, setCurrentLeadId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("All");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [scrapeOpen, setScrapeOpen] = useState(false);

  const { leads, fileName, headers, isLoading, patchQa, refetch, saveStatus, lastSavedAt, flushAll } = useLeads(sessionId);

  const twilioStatusQuery = trpc.leads.twilioStatus.useQuery(undefined, { enabled: isAuthenticated });
  const scrapeStatusQuery = trpc.leads.scrapeStatus.useQuery(undefined, { enabled: isAuthenticated });
  const createSession = trpc.leads.createSession.useMutation();
  const twilioLookup = trpc.leads.twilioLookup.useMutation();
  const twilioBulk = trpc.leads.twilioBulkLookup.useMutation();
  const dedup = trpc.leads.dedup.useMutation();

  useEffect(() => {
    if (sessionId != null) window.localStorage.setItem(STORAGE_KEY, String(sessionId));
    else window.localStorage.removeItem(STORAGE_KEY);
  }, [sessionId]);

  useEffect(() => {
    if (!leads.length) {
      setCurrentLeadId(null);
      return;
    }
    if (currentLeadId == null || !leads.some((l) => l.id === currentLeadId)) {
      setCurrentLeadId(leads[0].id);
    }
  }, [leads, currentLeadId]);

  const currentIndex = useMemo(
    () => leads.findIndex((l) => l.id === currentLeadId),
    [leads, currentLeadId],
  );
  const currentLead = currentIndex >= 0 ? leads[currentIndex] : null;

  const go = useCallback(
    (delta: number) => {
      if (!leads.length) return;
      // Always flush before navigating away. Belt-and-suspenders against
      // any pending debounce window — no edits should ride a lead change.
      flushAll();
      const base = currentIndex < 0 ? 0 : currentIndex;
      const next = (base + delta + leads.length) % leads.length;
      setCurrentLeadId(leads[next].id);
    },
    [leads, currentIndex, flushAll],
  );

  const qualify = useCallback(() => {
    if (!currentLead) return;
    patchQa(currentLead.id, { status: "Qualified", removed: false });
    toast.success("Marked qualified");
  }, [currentLead, patchQa]);

  const toggleRemove = useCallback(() => {
    if (!currentLead) return;
    const removed = !currentLead.qa.removed;
    patchQa(currentLead.id, {
      removed,
      status: removed ? "Removed" : "Review",
      removeReason: removed ? currentLead.qa.removeReason || "Manual" : "",
    });
    toast(removed ? "Lead removed" : "Lead restored");
  }, [currentLead, patchQa]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "j":
        case "J":
        case "ArrowLeft":
          e.preventDefault();
          go(-1);
          break;
        case "k":
        case "K":
        case "ArrowRight":
          e.preventDefault();
          go(1);
          break;
        case "q":
        case "Q":
          e.preventDefault();
          qualify();
          break;
        case "x":
        case "X":
          e.preventDefault();
          toggleRemove();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [go, qualify, toggleRemove]);

  const handleFile = useCallback(
    async (file: File) => {
      setUploadBusy(true);
      try {
        const text = await file.text();
        const { headers: h, rows } = parseCSV(text);
        if (!rows.length) {
          toast.error("No data rows found in CSV.");
          return;
        }
        const res = await createSession.mutateAsync({ fileName: file.name, headers: h, rows });
        setSessionId(res.sessionId);
        setCurrentLeadId(null);
        setFilter("All");
        setQuery("");
        setPickerOpen(false);
        toast.success(`Imported ${rows.length} leads.`);

        // Auto-dedup
        try {
          const dd = await dedup.mutateAsync({ sessionId: res.sessionId });
          if (dd.removed) toast(`Removed ${dd.removed} duplicates`);
        } catch (e: any) {
          // Non-fatal — user can re-run from sidebar.
          console.warn("Auto-dedup failed:", e?.message);
        }

        // Auto Twilio bulk + auto-tag by line type.
        // The whole point: skip manual qualification entirely. Mobile/VoIP get
        // the SMS tag, Landline gets the Call tag, everything else is left
        // un-tagged for the user to glance at.
        if (twilioStatusQuery.data?.configured) {
          try {
            const r = await twilioBulk.mutateAsync({ sessionId: res.sessionId });
            for (const p of r.patches || []) {
              const t = p.patch.phoneType;
              // Mobile → SMS. VoIP + Landline → Call (texts unreliable on both).
              const autoTag: Partial<typeof p.patch> =
                t === "Mobile"
                  ? { smsTag: true, status: "Qualified" }
                  : t === "VoIP" || t === "Landline"
                    ? { callTag: true, status: "Qualified" }
                    : {};
              patchQa(p.leadId, { ...p.patch, ...autoTag });
            }
            const tagged = (r.patches || []).filter((p) => {
              const t = p.patch.phoneType;
              return t === "Mobile" || t === "VoIP" || t === "Landline";
            }).length;
            toast.success(
              `Auto-tagged ${tagged} of ${r.checked} · SMS + Call lists ready in Export.`,
            );
          } catch (e: any) {
            toast.error(`Twilio bulk failed: ${e?.message || "unknown"}`);
          }
        } else {
          toast.message("Twilio not configured — auto phone-type split skipped.");
        }
      } catch (err: any) {
        toast.error(err?.message || "Failed to import CSV.");
      } finally {
        setUploadBusy(false);
      }
    },
    [createSession, dedup, twilioBulk, twilioStatusQuery.data?.configured, patchQa],
  );

  const runTwilioSingle = useCallback(() => {
    if (!currentLead || sessionId == null) return;
    const leadId = currentLead.id;
    twilioLookup.mutate(
      { sessionId, leadId },
      {
        onSuccess: (r) => {
          // Route Twilio results through autosave so unsaved local edits stay.
          if (r?.patch) patchQa(leadId, r.patch);
          toast.success("Phone checked via Twilio");
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }, [currentLead, sessionId, twilioLookup, patchQa]);

  const runTwilioBulk = useCallback(() => {
    if (sessionId == null) return;
    twilioBulk.mutate(
      { sessionId },
      {
        onSuccess: (r) => {
          // Apply each Twilio patch through patchQa — same autosave path,
          // no overwrites of local edits on other fields.
          for (const p of r.patches || []) patchQa(p.leadId, p.patch);
          toast.success(`Bulk check done: ${r.checked} checked, ${r.failed} failed of ${r.total}.`);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }, [sessionId, twilioBulk, patchQa]);

  const runDedup = useCallback(() => {
    if (sessionId == null) return;
    dedup.mutate(
      { sessionId },
      {
        onSuccess: (r) => {
          refetch();
          toast.success(r.removed ? `Removed ${r.removed} duplicates.` : "No duplicates found.");
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }, [sessionId, dedup, refetch]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="glass-card w-full max-w-md rounded-[28px] p-8 text-center">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-[linear-gradient(135deg,#1E88FF,#3BA3FF)] text-2xl font-black text-white shadow-[0_18px_42px_rgba(30,136,255,0.28)]">
            M
          </div>
          <h1 className="text-2xl font-black tracking-tight">Mavly Lead Qualifier</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to upload leads, qualify them with Twilio, and export clean lists. Your data is stored securely in
            your account.
          </p>
          <a
            href={getLoginUrl()}
            className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#1E88FF,#3BA3FF)] text-sm font-bold text-primary-foreground shadow-[0_16px_34px_rgba(30,136,255,0.28)] transition hover:brightness-110 active:scale-[0.98]"
          >
            <LogIn className="h-4 w-4" /> Sign in
          </a>
        </div>
      </div>
    );
  }

  const twilioConfigured = Boolean(twilioStatusQuery.data?.configured);

  const sidebar = (
    <Sidebar
      leads={leads}
      currentId={currentLeadId}
      onSelect={(id) => {
        setCurrentLeadId(id);
        setMobileSidebar(false);
      }}
      query={query}
      onQuery={setQuery}
      filter={filter}
      onFilter={setFilter}
      onUpload={() => {
        setSessionId(null);
        setPickerOpen(false);
        setMobileSidebar(false);
      }}
      onReset={() => {
        if (sessionId == null) return;
        setPickerOpen(true);
      }}
      onSwitchSession={() => setPickerOpen(true)}
      fileName={fileName}
    />
  );

  return (
    <div className="min-h-screen">
      <SessionPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        currentSessionId={sessionId}
        onSelect={(id) => {
          setSessionId(id);
          setCurrentLeadId(null);
          setPickerOpen(false);
        }}
        onNew={() => {
          setSessionId(null);
          setPickerOpen(false);
        }}
      />

      <ScrapeModal
        open={scrapeOpen}
        onClose={() => setScrapeOpen(false)}
        onImported={(id) => {
          setScrapeOpen(false);
          setSessionId(id);
          setCurrentLeadId(null);
          setFilter("All");
          setQuery("");
        }}
      />

      {!sessionId ? (
        <div>
          <TopBar user={user} exportBar={null} tools={null} onMenu={null} />
          <Dropzone onFile={handleFile} busy={uploadBusy} />
          <div className="mx-auto mt-4 flex max-w-md flex-col items-center gap-2 px-4 text-center">
            <div className="flex w-full items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
            </div>
            <button
              onClick={() => setScrapeOpen(true)}
              disabled={!scrapeStatusQuery.data?.configured}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.06] text-sm font-bold transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-40"
            >
              <Globe className="h-4 w-4" />
              {scrapeStatusQuery.data?.configured ? "Scrape leads from BBB" : "BBB scraper not configured"}
            </button>
          </div>
        </div>
      ) : (
        <DashboardShell>
          <div className="hidden min-h-0 lg:block">
            {sidebar}
          </div>

          {mobileSidebar && (
            <div className="fixed inset-0 z-50 flex lg:hidden">
              <div className="flex-1 bg-black/35 backdrop-blur-sm" onClick={() => setMobileSidebar(false)} />
              <div className="flex w-[320px] max-w-[85%] flex-col gap-3 border-l border-white/12 bg-background/90 p-3 shadow-2xl backdrop-blur-xl">
                <div className="flex justify-end">
                  <button
                    onClick={() => setMobileSidebar(false)}
                    className="grid h-8 w-8 place-items-center rounded-lg hover:bg-accent"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {sidebar}
              </div>
            </div>
          )}

          <main className="flex min-h-0 min-w-0 flex-col">
            <TopBar
              user={user}
              onMenu={() => setMobileSidebar(true)}
              exportBar={<ExportBar leads={leads} headers={headers} fileName={fileName} />}
              tools={
                <>
                  <ToolButton
                    onClick={runTwilioBulk}
                    busy={twilioBulk.isPending}
                    disabled={!twilioConfigured}
                    icon={<ScanSearch className="h-4 w-4" />}
                    label="Bulk phone check"
                  />
                  <ToolButton
                    onClick={runDedup}
                    busy={dedup.isPending}
                    icon={<CopyIcon className="h-4 w-4" />}
                    label="Remove duplicates"
                  />
                </>
              }
            />

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {isLoading ? (
                <div className="grid h-[60vh] place-items-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : !leads.length ? (
                <EmptySession onUpload={() => setSessionId(null)} />
              ) : currentLead ? (
                <QualifyPanel
                  lead={currentLead}
                  index={currentIndex}
                  total={leads.length}
                  onPatch={(patch) => patchQa(currentLead.id, patch)}
                  onPrev={() => go(-1)}
                  onNext={() => go(1)}
                  onQualify={qualify}
                  onToggleRemove={toggleRemove}
                  onTwilio={runTwilioSingle}
                  twilioBusy={twilioLookup.isPending}
                  twilioConfigured={twilioConfigured}
                  saveStatus={saveStatus}
                  lastSavedAt={lastSavedAt}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Select a lead from the list.</p>
              )}
            </div>
          </main>
        </DashboardShell>
      )}
    </div>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen p-3 sm:p-5">
      <div className="dashboard-shell mx-auto grid h-[calc(100vh-24px)] max-w-[1520px] grid-cols-1 overflow-hidden rounded-[32px] lg:h-[calc(100vh-40px)] lg:grid-cols-[320px_minmax(0,1fr)]">
        {children}
      </div>
    </div>
  );
}

function TopBar({
  user,
  exportBar,
  tools,
  onMenu,
}: {
  user: any;
  exportBar: React.ReactNode;
  tools: React.ReactNode;
  onMenu: (() => void) | null;
}) {
  return (
    <header className="z-20 flex min-h-[68px] flex-wrap items-center gap-2 border-b border-white/[0.08] bg-[#071126]/70 px-4 py-3 backdrop-blur-2xl sm:px-5">
      {onMenu && (
        <button
          onClick={onMenu}
          className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/10 transition hover:bg-white/15 lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}
      <div className="mr-auto flex items-center gap-2.5">
        <img
          src="/logo.svg"
          alt="Mavly"
          className="h-9 w-9 rounded-xl shadow-[0_0_22px_rgba(30,136,255,0.35)]"
        />
        <span className="hidden text-sm font-black tracking-tight sm:inline">Mavly</span>
        <div className="hidden items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-emerald-300 sm:flex">
          <span className="relative grid h-1.5 w-1.5 place-items-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-50" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          <ShieldCheck className="h-3 w-3" /> Synced
        </div>
      </div>
      {tools}
      {exportBar}
      <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 shadow-sm backdrop-blur transition hover:bg-white/10 sm:flex">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#1E88FF] text-[11px] font-black text-primary-foreground shadow-[0_0_22px_rgba(30,136,255,0.42)]">
          {(user?.name || "U").slice(0, 1).toUpperCase()}
        </span>
        <span className="max-w-[120px] truncate text-xs font-semibold">{user?.name || "User"}</span>
      </div>
      <a
        href="/api/logout"
        title="Log out"
        className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
      >
        <LogOut className="h-4 w-4" />
      </a>
    </header>
  );
}

function ToolButton({
  onClick,
  busy,
  disabled,
  icon,
  label,
}: {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className={cn(
        "flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-3.5 text-xs font-bold shadow-sm backdrop-blur transition hover:border-[#3BA3FF]/40 hover:bg-white/10 active:scale-[0.98] disabled:opacity-40",
      )}
      title={disabled ? "Twilio not configured" : label}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

function EmptySession({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="grid h-[60vh] place-items-center text-center">
      <div>
        <p className="text-sm text-muted-foreground">This session has no leads.</p>
        <button
          onClick={onUpload}
          className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
        >
          Upload a CSV
        </button>
      </div>
    </div>
  );
}
