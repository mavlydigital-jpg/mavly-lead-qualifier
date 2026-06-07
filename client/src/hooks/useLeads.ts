import { useEffect, useState, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { type LeadRecord, type LeadQa, migrateQa } from "@shared/qualify";
import { toast } from "sonner";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

// Per-lead debounce window. Short enough that switching leads triggers a flush
// before the user perceives any lag; long enough to coalesce keystrokes.
const DEBOUNCE_MS = 450;
const MAX_RETRIES = 2;

type Pending = {
  qa: LeadQa;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  retries: number;
};

export function useLeads(sessionId: number | null) {
  const utils = trpc.useUtils();
  const enabled = sessionId != null;
  const query = trpc.leads.listLeads.useQuery(
    { sessionId: sessionId ?? 0 },
    { enabled, refetchOnWindowFocus: false },
  );

  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  // Hold the latest server data so a stale refetch never blows away
  // unsynced in-memory edits.
  const pendingRef = useRef<Map<number, Pending>>(new Map());
  const sessionIdRef = useRef<number | null>(sessionId);
  sessionIdRef.current = sessionId;

  useEffect(() => {
    if (query.data?.leads) {
      const incoming: LeadRecord[] = query.data.leads.map((l: any) => ({
        id: l.id,
        sessionId: l.sessionId,
        position: l.position,
        raw: l.raw || {},
        qa: migrateQa(l.qa),
      }));
      // Preserve any in-flight or pending edits — server may not have them yet.
      const pendingMap = pendingRef.current;
      const merged = incoming.map((l) => {
        const p = pendingMap.get(l.id);
        return p ? { ...l, qa: p.qa } : l;
      });
      setLeads(merged);
      setFileName(query.data.session?.fileName || "");
      setHeaders((query.data.session?.headers as string[]) || []);
    } else if (!enabled) {
      setLeads([]);
      setFileName("");
      setHeaders([]);
    }
  }, [query.data, enabled]);

  const updateQaMutation = trpc.leads.updateQa.useMutation();

  // Recompute global save status from the pending map. Called after each
  // map mutation so the UI reflects what's actually queued.
  const recomputeStatus = useCallback(() => {
    const map = pendingRef.current;
    let anyQueued = false;
    let anyInFlight = false;
    map.forEach((p) => {
      if (p.inFlight) anyInFlight = true;
      else if (p.timer) anyQueued = true;
    });
    if (anyInFlight || anyQueued) {
      setSaveStatus("saving");
    } else {
      setSaveStatus((prev) => (prev === "error" ? "error" : "saved"));
    }
  }, []);

  const flushLead = useCallback(
    (leadId: number) => {
      const map = pendingRef.current;
      const entry = map.get(leadId);
      const sid = sessionIdRef.current;
      if (!entry || sid == null) return;
      if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
      }
      if (entry.inFlight) return; // mutation in flight will pick up the latest qa via the trampoline below
      entry.inFlight = true;
      recomputeStatus();
      const payload = entry.qa;
      updateQaMutation.mutate(
        { sessionId: sid, leadId, qa: payload as any },
        {
          onSuccess: () => {
            const current = pendingRef.current.get(leadId);
            if (!current) return;
            // If the qa changed during flight, requeue immediately.
            if (current.qa !== payload) {
              current.inFlight = false;
              current.retries = 0;
              // Send next batch on next tick to avoid recursion.
              setTimeout(() => flushLead(leadId), 0);
              return;
            }
            pendingRef.current.delete(leadId);
            setLastSavedAt(Date.now());
            recomputeStatus();
          },
          onError: (err) => {
            const current = pendingRef.current.get(leadId);
            if (!current) return;
            current.inFlight = false;
            if (current.retries < MAX_RETRIES) {
              current.retries += 1;
              // exponential-ish backoff
              const wait = 600 * Math.pow(2, current.retries);
              current.timer = setTimeout(() => flushLead(leadId), wait);
              recomputeStatus();
            } else {
              setSaveStatus("error");
              toast.error(
                `Autosave failed for lead #${leadId}: ${err.message}. Will retry on next edit.`,
              );
            }
          },
        },
      );
    },
    [updateQaMutation, recomputeStatus],
  );

  const flushAll = useCallback(() => {
    const ids = Array.from(pendingRef.current.keys());
    ids.forEach((id) => flushLead(id));
  }, [flushLead]);

  // Optimistic local update + debounced persist
  const patchQa = useCallback(
    (leadId: number, patch: Partial<LeadQa>) => {
      let nextQa: LeadQa | null = null;
      setLeads((prev) =>
        prev.map((l) => {
          if (l.id !== leadId) return l;
          nextQa = { ...l.qa, ...patch, lastUpdated: new Date().toISOString() };
          return { ...l, qa: nextQa };
        }),
      );
      if (sessionIdRef.current == null || !nextQa) return;
      const map = pendingRef.current;
      const existing = map.get(leadId);
      if (existing) {
        existing.qa = nextQa;
        existing.retries = 0;
        if (existing.timer) clearTimeout(existing.timer);
        if (!existing.inFlight) {
          existing.timer = setTimeout(() => flushLead(leadId), DEBOUNCE_MS);
        }
      } else {
        map.set(leadId, {
          qa: nextQa,
          timer: setTimeout(() => flushLead(leadId), DEBOUNCE_MS),
          inFlight: false,
          retries: 0,
        });
      }
      setSaveStatus("saving");
    },
    [flushLead],
  );

  // Flush pending edits when the tab/window goes away.
  useEffect(() => {
    const handler = () => flushAll();
    const onVis = () => {
      if (document.visibilityState === "hidden") flushAll();
    };
    window.addEventListener("beforeunload", handler);
    window.addEventListener("pagehide", handler);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("beforeunload", handler);
      window.removeEventListener("pagehide", handler);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [flushAll]);

  const refetch = useCallback(async () => {
    if (sessionIdRef.current == null) return;
    // Make sure local edits are pushed before we re-pull from the server.
    flushAll();
    return utils.leads.listLeads.invalidate({ sessionId: sessionIdRef.current });
  }, [utils, flushAll]);

  return {
    leads,
    fileName,
    headers,
    isLoading: query.isLoading && enabled,
    patchQa,
    refetch,
    setLeads,
    saveStatus,
    lastSavedAt,
    flushAll,
  };
}
