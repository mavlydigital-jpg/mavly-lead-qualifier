"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (!res.ok || !data.ok) {
        setError(data.error || "Login failed.");
        return;
      }
      const from = new URLSearchParams(window.location.search).get("from");
      window.location.href = from && from.startsWith("/") ? from : "/";
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="glass-card w-full max-w-sm rounded-[28px] p-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.svg"
          alt="Mavly"
          className="mx-auto mb-5 h-16 w-16 rounded-2xl shadow-[0_18px_42px_rgba(30,136,255,0.28)]"
        />
        <h1 className="text-2xl font-black tracking-tight">Mavly Lead Qualifier</h1>
        <p className="mt-2 text-sm text-muted-foreground">Enter the team password to continue.</p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="h-11 w-full rounded-2xl border border-white/[0.1] bg-[#0A142D]/70 px-4 text-sm text-[#EAF0FF] outline-none placeholder:text-muted-foreground/70 focus:border-[#3BA3FF]/60 focus:ring-2 focus:ring-[#1E88FF]/20"
          />
          {error && <p className="text-xs font-semibold text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#1E88FF,#3BA3FF)] text-sm font-bold text-primary-foreground shadow-[0_16px_34px_rgba(30,136,255,0.28)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
          >
            {loading ? "Checking…" : "Log in"}
          </button>
        </form>
      </div>
    </div>
  );
}
