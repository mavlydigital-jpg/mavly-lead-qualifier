import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { FileSpreadsheet, Trash2, X, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function SessionPicker({
  open,
  onClose,
  currentSessionId,
  onSelect,
  onNew,
}: {
  open: boolean;
  onClose: () => void;
  currentSessionId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
}) {
  const utils = trpc.useUtils();
  const sessionsQuery = trpc.leads.listSessions.useQuery(undefined, { enabled: open });
  const deleteMutation = trpc.leads.deleteSession.useMutation({
    onSuccess: () => utils.leads.listSessions.invalidate(),
  });

  if (!open) return null;

  const sessions = sessionsQuery.data ?? [];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4 backdrop-blur-sm">
      <div className="glass-card w-full max-w-lg overflow-hidden rounded-[28px]">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <h2 className="text-base font-extrabold">Upload sessions</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-3">
          {sessionsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : !sessions.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No sessions yet. Upload a CSV to start.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3 transition",
                    s.id === currentSessionId
                      ? "border-[#3BA3FF]/35 bg-[#1E88FF]/14 shadow-[0_0_28px_rgba(30,136,255,0.14)]"
                      : "border-white/[0.08] bg-white/[0.05] hover:bg-white/[0.08]",
                  )}
                >
                  <button onClick={() => onSelect(s.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#1E88FF]/12 text-[#8bc5ff]">
                      <FileSpreadsheet className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{s.fileName || "Untitled upload"}</span>
                      <span className="block text-xs text-muted-foreground">
                        {s.leadCount} leads · {new Date(s.createdAt).toLocaleString()}
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Delete this session and all its leads?")) {
                        deleteMutation.mutate(
                          { sessionId: s.id },
                          { onSuccess: () => toast.success("Session deleted") },
                        );
                      }
                    }}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#ff8baa] hover:bg-[#FF2E63]/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-white/[0.08] p-3">
          <button
            onClick={onNew}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#1E88FF,#3BA3FF)] text-sm font-bold text-primary-foreground shadow-[0_16px_34px_rgba(30,136,255,0.24)] transition hover:brightness-110 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" /> New upload
          </button>
        </div>
      </div>
    </div>
  );
}
