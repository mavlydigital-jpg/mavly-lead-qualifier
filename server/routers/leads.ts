import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createSession,
  listSessions,
  getSession,
  deleteSession,
  updateSessionCount,
  bulkInsertLeads,
  listLeadsBySession,
  updateLeadQa,
  getLead,
} from "../db";
import {
  defaultQa,
  migrateQa,
  detectDuplicates,
  e164Phone,
  mapTwilioLineType,
  channelPatchForPhoneType,
  leadPhone,
  type LeadRecord,
  type LeadQa,
} from "@shared/qualify";
import { twilioLookup, twilioConfigured, normalizePhone } from "../_core/twilio";
import {
  apifyConfigured,
  startBbbRun,
  getRun,
  getDatasetItems,
  mapBbbItemToRow,
  matchesNiche,
  BBB_HEADERS,
} from "../_core/apify";

// Tolerant enum: accepts "" / null / undefined and maps to the chosen default.
// Several UI toggles emit "" when the user deselects an option. Without this,
// a single deselect would reject the entire qa payload and silently kill
// autosave for the lead.
function tolerantEnum<T extends [string, ...string[]]>(values: T, fallback: T[number]) {
  return z
    .union([z.enum(values), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v && (values as readonly string[]).includes(v) ? v : fallback)) as unknown as z.ZodType<T[number]>;
}

const leadQaSchema = z
  .object({
    status: tolerantEnum(["Pending", "Review", "Qualified", "Removed"], "Pending"),
    removed: z.boolean(),
    removeReason: z.string(),
    duplicateGroup: z.string(),
    phoneType: tolerantEnum(["Mobile", "Landline", "VoIP", "Toll-free", "Unknown"], "Unknown"),
    phoneValid: tolerantEnum(["Yes", "No", "Unknown"], "Unknown"),
    twilioLineType: z.string(),
    twilioCarrier: z.string(),
    twilioEvidence: z.string(),
    runningAds: tolerantEnum(["Yes", "No", "Unknown"], "Unknown"),
    googleActiveAdCount: z.string(),
    googleAdFormats: z.string(),
    googleAdsNotes: z.string(),
    metaAds: tolerantEnum(["Yes", "No", "Unknown"], "Unknown"),
    metaActiveAdCount: z.string(),
    metaOfferAngle: z.string(),
    metaNotes: z.string(),
    gbpScore: z.number(),
    googleRating: z.string(),
    reviewCount: z.string(),
    gbpNotes: z.string(),
    fitRating: tolerantEnum(["Hot", "Warm", "Cold", "Unrated"], "Unrated"),
    nextStep: z.string(),
    notes: z.string(),
    smsTag: z.boolean(),
    callTag: z.boolean(),
    lastUpdated: z.string(),
  })
  .partial()
  .passthrough();

function ensureOwned<T extends { ownerOpenId: string } | undefined>(
  session: T,
): asserts session is NonNullable<T> {
  if (!session) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
  }
}

function toLeadRecord(row: {
  id: number;
  sessionId: number;
  position: number;
  raw: Record<string, string> | null;
  qa: LeadQa | null;
}): LeadRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    position: row.position,
    raw: row.raw || {},
    qa: migrateQa(row.qa),
  };
}

export const leadsRouter = router({
  twilioStatus: protectedProcedure.query(() => ({
    configured: twilioConfigured(),
  })),

  scrapeStatus: protectedProcedure.query(() => ({
    configured: apifyConfigured(),
  })),

  // Kick off a BBB scrape. Returns a run reference the client polls. We start
  // async (not run-sync) because a scrape can outlast the serverless timeout.
  scrapeBbbStart: protectedProcedure
    .input(
      z.object({
        search: z.string().trim().min(1).max(120),
        location: z.string().trim().min(1).max(120),
        distance: z.number().int().min(1).max(100).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      if (!apifyConfigured()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Apify is not configured." });
      }
      try {
        const run = await startBbbRun(input);
        return { runId: run.runId, datasetId: run.datasetId, status: run.status };
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_GATEWAY", message: e?.message || "Scrape failed to start." });
      }
    }),

  // Poll a running scrape. Returns the Apify run status string.
  scrapeBbbPoll: protectedProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .query(async ({ input }) => {
      if (!apifyConfigured()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Apify is not configured." });
      }
      const run = await getRun(input.runId);
      return { status: run.status, datasetId: run.datasetId };
    }),

  // Pull results from a finished scrape and import them as a new session,
  // capped at `max` rows. Mirrors the CSV upload path so downstream tooling
  // (dedup, Twilio, export) works unchanged.
  scrapeBbbImport: protectedProcedure
    .input(
      z.object({
        datasetId: z.string().min(1),
        max: z.number().int().min(1).max(1000),
        fileName: z.string().max(512),
        // When true, keep only foundation/waterproofing/crawl-space businesses
        // and drop general contractors, home builders, painters, etc.
        nicheOnly: z.boolean().optional().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!apifyConfigured()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Apify is not configured." });
      }
      // Pull extra items when filtering so we can still hit `max` keepers.
      const fetchCount = input.nicheOnly ? Math.min(1000, input.max * 5) : input.max;
      const items = await getDatasetItems(input.datasetId, fetchCount);
      // The actor occasionally finishes "successfully" with an empty dataset
      // (BBB anti-bot / transient). Don't create an empty session — tell the
      // user to re-run.
      if (items.length === 0) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "BBB returned no results this run (the scraper is sometimes flaky). Tap Run again.",
        });
      }
      const kept = input.nicheOnly ? items.filter(matchesNiche) : items;
      const dropped = items.length - kept.length;
      const rows = kept
        .slice(0, input.max)
        .map(mapBbbItemToRow)
        .filter((r) => r["Company Name"] || r.Phone);
      // Got businesses, but none in-niche after filtering.
      if (rows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: input.nicheOnly
            ? `Found ${items.length} businesses but none were foundation / waterproofing / crawl space. Try another keyword, or uncheck the niche filter.`
            : "No usable leads in this scrape.",
        });
      }
      const sessionId = await createSession({
        ownerOpenId: ctx.user.openId,
        fileName: input.fileName,
        headers: [...BBB_HEADERS],
        leadCount: rows.length,
      });
      if (rows.length) {
        await bulkInsertLeads(
          rows.map((raw, idx) => ({ sessionId, position: idx, raw, qa: defaultQa() })),
        );
      }
      return { sessionId, imported: rows.length, dropped };
    }),

  listSessions: protectedProcedure.query(async ({ ctx }) => {
    return listSessions(ctx.user.openId);
  }),

  createSession: protectedProcedure
    .input(
      z.object({
        fileName: z.string().max(512),
        headers: z.array(z.string()),
        rows: z.array(z.record(z.string(), z.string())),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sessionId = await createSession({
        ownerOpenId: ctx.user.openId,
        fileName: input.fileName,
        headers: input.headers,
        leadCount: input.rows.length,
      });
      if (input.rows.length) {
        await bulkInsertLeads(
          input.rows.map((raw, idx) => ({
            sessionId,
            position: idx,
            raw,
            qa: defaultQa(),
          })),
        );
      }
      return { sessionId };
    }),

  deleteSession: protectedProcedure
    .input(z.object({ sessionId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await deleteSession(ctx.user.openId, input.sessionId);
      return { success: true } as const;
    }),

  listLeads: protectedProcedure
    .input(z.object({ sessionId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const session = await getSession(ctx.user.openId, input.sessionId);
      if (!session) return { session: null, leads: [] };
      const rows = await listLeadsBySession(input.sessionId);
      return { session, leads: rows };
    }),

  updateQa: protectedProcedure
    .input(
      z.object({
        sessionId: z.number().int(),
        leadId: z.number().int(),
        qa: leadQaSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await getSession(ctx.user.openId, input.sessionId);
      ensureOwned(session);
      const existing = await getLead(input.leadId);
      if (!existing || existing.sessionId !== input.sessionId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
      }
      const merged: LeadQa = {
        ...migrateQa(existing.qa),
        ...(input.qa as Partial<LeadQa>),
        lastUpdated: new Date().toISOString(),
      };
      await updateLeadQa(input.leadId, merged);
      return { success: true } as const;
    }),

  twilioLookup: protectedProcedure
    .input(z.object({ sessionId: z.number().int(), leadId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      if (!twilioConfigured()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Twilio is not configured." });
      }
      const session = await getSession(ctx.user.openId, input.sessionId);
      ensureOwned(session);
      const existing = await getLead(input.leadId);
      if (!existing || existing.sessionId !== input.sessionId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found" });
      }
      const record = toLeadRecord(existing);
      const phone = leadPhone(record);
      if (!phone) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Lead has no phone number." });
      }
      const result = await twilioLookup(phone);
      if (!result.ok) {
        throw new TRPCError({ code: "BAD_GATEWAY", message: result.error || "Twilio lookup failed." });
      }
      // Return only the Twilio-derived patch. The client applies it via the
      // autosave queue so unsaved local edits aren't blown away.
      const phoneType = mapTwilioLineType(result.line_type);
      const patch: Partial<LeadQa> = {
        phoneType,
        phoneValid: result.valid === false ? "No" : result.valid === true ? "Yes" : "Unknown",
        twilioLineType: result.line_type || "",
        twilioCarrier: result.carrier || "",
        twilioEvidence: [
          result.national_format || result.phone_number || normalizePhone(phone),
          result.line_type ? `type=${result.line_type}` : "",
          result.carrier ? `carrier=${result.carrier}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        // VoIP → route to calling (texts unreliable on VoIP).
        ...channelPatchForPhoneType(phoneType),
      };
      return { patch };
    }),

  twilioBulkLookup: protectedProcedure
    .input(z.object({ sessionId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      if (!twilioConfigured()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Twilio is not configured." });
      }
      const session = await getSession(ctx.user.openId, input.sessionId);
      ensureOwned(session);
      const rows = await listLeadsBySession(input.sessionId);
      const pending = rows
        .map(toLeadRecord)
        .filter((l) => !l.qa.removed && !l.qa.twilioEvidence && Boolean(leadPhone(l)));

      // Run lookups only — never write qa server-side. Client receives the
      // patches and applies them through the autosave queue so unsaved local
      // edits on other fields aren't clobbered.
      let failed = 0;
      const patches: { leadId: number; patch: Partial<LeadQa> }[] = [];
      const BATCH = 8;
      for (let i = 0; i < pending.length; i += BATCH) {
        const slice = pending.slice(i, i + BATCH);
        const results = await Promise.all(
          slice.map(async (lead) => {
            const phone = leadPhone(lead);
            const result = await twilioLookup(phone);
            if (!result.ok) {
              failed++;
              return null;
            }
            const phoneType = mapTwilioLineType(result.line_type);
            const patch: Partial<LeadQa> = {
              phoneType,
              phoneValid:
                result.valid === false ? "No" : result.valid === true ? "Yes" : "Unknown",
              twilioLineType: result.line_type || "",
              twilioCarrier: result.carrier || "",
              twilioEvidence: [
                result.national_format || result.phone_number || e164Phone(phone),
                result.line_type ? `type=${result.line_type}` : "",
                result.carrier ? `carrier=${result.carrier}` : "",
              ]
                .filter(Boolean)
                .join(" · "),
              // VoIP → route to calling (texts unreliable on VoIP).
              ...channelPatchForPhoneType(phoneType),
            };
            return { leadId: lead.id, patch };
          }),
        );
        for (const r of results) if (r) patches.push(r);
      }
      return { total: pending.length, checked: patches.length, failed, patches };
    }),

  dedup: protectedProcedure
    .input(z.object({ sessionId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const session = await getSession(ctx.user.openId, input.sessionId);
      ensureOwned(session);
      const rows = await listLeadsBySession(input.sessionId);
      const records = rows.map(toLeadRecord);
      const { removedIds, updates } = detectDuplicates(records);
      for (const id of removedIds) {
        const lead = records.find((l) => l.id === id);
        const patch = updates.get(id);
        if (!lead || !patch) continue;
        const nextQa: LeadQa = {
          ...lead.qa,
          removed: true,
          status: "Removed",
          removeReason: patch.reason,
          duplicateGroup: patch.group,
          notes: patch.note,
          lastUpdated: new Date().toISOString(),
        };
        await updateLeadQa(id, nextQa);
      }
      const keptCount = records.length - removedIds.length;
      await updateSessionCount(input.sessionId, keptCount);
      return { removed: removedIds.length, kept: keptCount };
    }),
});
