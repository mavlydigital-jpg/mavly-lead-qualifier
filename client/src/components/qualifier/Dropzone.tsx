"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { UploadCloud, FileText, Loader2, Sparkles, ShieldCheck, Zap } from "lucide-react";

export function Dropzone({
  onFile,
  busy,
}: {
  onFile: (file: File) => void;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  return (
    <div className="relative grid min-h-[calc(100vh-140px)] items-center justify-items-start overflow-x-hidden px-4 py-12 sm:justify-items-center">
      <div className="relative min-w-0 w-full max-w-[358px] sm:max-w-3xl">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white shadow-sm backdrop-blur">
            <Sparkles className="h-3 w-3" />
            Mavly Lead Qualifier
          </span>
        </div>

        <div className="relative min-w-0 max-w-full overflow-hidden rounded-[28px] border border-white/15 bg-card/80 p-6 shadow-2xl shadow-black/25 backdrop-blur-2xl sm:p-14">
          <div className="relative text-center">
            <div
              className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-3xl bg-primary text-white shadow-sm sm:h-20 sm:w-20"
            >
              <UploadCloud className="h-8 w-8 sm:h-9 sm:w-9" />
            </div>

            <h2 className="mx-auto max-w-[300px] text-2xl font-black leading-tight tracking-tight sm:max-w-lg sm:text-5xl">
              Drop your leads,
              <br /> close more deals.
            </h2>
            <p className="mx-auto mt-4 max-w-[280px] text-sm leading-relaxed text-muted-foreground sm:max-w-md sm:text-[15px]">
              Drop a CSV. We auto-check phone type with Twilio and split your
              list into SMS (mobile) and Call (landline) — ready to export.
            </p>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                handleFiles(e.dataTransfer.files);
              }}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "group relative mt-9 min-w-0 cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed p-6 transition-all duration-300 sm:p-10",
                drag
                  ? "scale-[1.02] border-primary bg-primary/15 shadow-lg shadow-primary/20"
                  : "border-white/16 bg-white/8 hover:border-primary/50 hover:bg-white/12 hover:shadow-lg hover:shadow-black/10",
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              {busy ? (
                <div className="flex flex-col items-center justify-center gap-2 text-sm font-bold text-primary">
                  <Loader2 className="h-7 w-7 animate-spin" />
                  Importing + Twilio-checking…
                </div>
              ) : (
                <>
                  <FileText className="mx-auto mb-3 h-9 w-9 text-primary transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110" />
                  <p className="text-base font-bold tracking-tight">
                    Drop CSV here
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    or click anywhere in this box to choose a file
                  </p>
                </>
              )}
            </div>

            <div className="mt-8 grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
              <Hint
                icon={<ShieldCheck className="h-4 w-4" />}
                title="Auto-check"
                body="Twilio runs on every row on upload."
              />
              <Hint
                icon={<Zap className="h-4 w-4" />}
                title="Auto-split"
                body="Mobile → SMS list, Landline → Call list."
              />
              <Hint
                icon={<Sparkles className="h-4 w-4" />}
                title="Export"
                body="Hand the list to GHL and start dialing."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hint({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="group rounded-2xl border border-white/12 bg-white/8 p-4 transition hover:bg-white/12 hover:shadow-sm">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-primary">
          {icon}
        </span>
        <div className="text-sm font-extrabold tracking-tight">{title}</div>
      </div>
      <p className="text-[12px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
