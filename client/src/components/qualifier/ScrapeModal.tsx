"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, X, Globe, Search } from "lucide-react";
import { toast } from "sonner";

type Phase = "idle" | "running" | "importing";

const DONE = new Set(["SUCCEEDED"]);
const FAILED = new Set(["FAILED", "ABORTED", "TIMED-OUT", "TIMED_OUT"]);

export function ScrapeModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (sessionId: number) => void;
}) {
  const [search, setSearch] = useState("Foundation Repair");
  const [location, setLocation] = useState("");
  const [distance, setDistance] = useState(10);
  const [max, setMax] = useState(100);
  const [nicheOnly, setNicheOnly] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState<string | null>(null);

  const start = trpc.leads.scrapeBbbStart.useMutation();
  const importRun = trpc.leads.scrapeBbbImport.useMutation();
  const poll = trpc.leads.scrapeBbbPoll.useQuery(
    { runId: runId || "" },
    { enabled: phase === "running" && Boolean(runId), refetchInterval: 4000 },
  );

  // React to poll status changes.
  useEffect(() => {
    if (phase !== "running" || !poll.data) return;
    const status = poll.data.status;
    if (DONE.has(status) && datasetId) {
      setPhase("importing");
      importRun
        .mutateAsync({ datasetId, max, nicheOnly, fileName: `BBB · ${search} · ${location}` })
        .then((res) => {
          toast.success(
            res.dropped
              ? `Imported ${res.imported} foundation leads · dropped ${res.dropped} off-niche.`
              : `Imported ${res.imported} BBB leads.`,
          );
          reset();
          onImported(res.sessionId);
        })
        .catch((e: any) => {
          toast.error(e?.message || "Import failed.");
          setPhase("idle");
        });
    } else if (FAILED.has(status)) {
      toast.error(`Scrape ${status.toLowerCase()}. Try again.`);
      setPhase("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll.data, phase, datasetId]);

  function reset() {
    setPhase("idle");
    setRunId(null);
    setDatasetId(null);
  }

  async function run() {
    if (!search.trim() || !location.trim()) {
      toast.error("Enter a keyword and a location.");
      return;
    }
    try {
      const res = await start.mutateAsync({ search: search.trim(), location: location.trim(), distance });
      setRunId(res.runId);
      setDatasetId(res.datasetId);
      setPhase("running");
    } catch (e: any) {
      toast.error(e?.message || "Could not start scrape.");
    }
  }

  if (!open) return null;
  const busy = phase !== "idle";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="glass-card w-full max-w-md rounded-[28px] p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[linear-gradient(135deg,#1E88FF,#3BA3FF)] text-white shadow-[0_0_22px_rgba(30,136,255,0.35)]">
              <Globe className="h-4 w-4" />
            </span>
            <h2 className="text-lg font-black tracking-tight">Scrape BBB</h2>
          </div>
          <button
            onClick={() => !busy && onClose()}
            disabled={busy}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-white/10 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {busy ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <p className="text-sm font-semibold">
              {phase === "running" ? "Scraping BBB…" : "Importing leads…"}
            </p>
            <p className="text-xs text-muted-foreground">
              This can take a minute. Keep this window open.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Field label="Keyword / trade">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Foundation Repair"
                className={inputCls}
              />
            </Field>
            <div className="-mt-1 flex flex-wrap gap-2">
              {["Foundation Repair", "Waterproofing", "Crawl Space Repair"].map((k) => (
                <button
                  key={k}
                  onClick={() => setSearch(k)}
                  className={
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition " +
                    (search === k
                      ? "border-[#3BA3FF]/50 bg-[#1E88FF]/15 text-[#9fc8ff]"
                      : "border-white/12 bg-white/[0.05] text-muted-foreground hover:bg-white/10")
                  }
                >
                  {k}
                </button>
              ))}
            </div>
            <Field label="Location (city, state)">
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Dallas, TX"
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Radius (miles)">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={distance}
                  onChange={(e) => setDistance(Math.max(1, Math.min(100, Number(e.target.value) || 10)))}
                  className={inputCls}
                />
              </Field>
              <Field label="Max leads to import">
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={max}
                  onChange={(e) => setMax(Math.max(1, Math.min(1000, Number(e.target.value) || 100)))}
                  className={inputCls}
                />
              </Field>
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3">
              <input
                type="checkbox"
                checked={nicheOnly}
                onChange={(e) => setNicheOnly(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#1E88FF]"
              />
              <span className="text-xs">
                <span className="font-bold">Foundation niche only</span>
                <span className="block text-[11px] text-muted-foreground">
                  Keep foundation repair, waterproofing & crawl-space pros. Drop general contractors, home builders, painters, etc.
                </span>
              </span>
            </label>
            <button
              onClick={run}
              className="mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#1E88FF,#3BA3FF)] text-sm font-bold text-primary-foreground shadow-[0_16px_34px_rgba(30,136,255,0.28)] transition hover:brightness-110 active:scale-[0.98]"
            >
              <Search className="h-4 w-4" /> Run scrape
            </button>
            <p className="text-[11px] text-muted-foreground">
              Pulls BBB listings (name, owner phone, city, rating) into a new session. Owner numbers come straight from BBB.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "h-11 w-full rounded-2xl border border-white/[0.1] bg-[#0A142D]/70 px-4 text-sm text-[#EAF0FF] outline-none placeholder:text-muted-foreground/70 focus:border-[#3BA3FF]/60 focus:ring-2 focus:ring-[#1E88FF]/20";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
