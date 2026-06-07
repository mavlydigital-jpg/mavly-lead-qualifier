import {
  integer,
  serial,
  pgTable,
  pgEnum,
  text,
  timestamp,
  varchar,
  jsonb,
} from "drizzle-orm/pg-core";

/**
 * Postgres enums used by the user/role machinery.
 */
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

/**
 * Core user table backing the (now-local) auth flow.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  /** Local identifier. Defaults to "local-user" in single-user mode. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * An upload session — one CSV file upload by a user.
 */
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  fileName: varchar("fileName", { length: 512 }).notNull().default(""),
  headers: jsonb("headers").$type<string[]>().notNull(),
  leadCount: integer("leadCount").notNull().default(0),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type Session = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;

/**
 * QA fields stored as a structured object per lead.
 */
export type LeadQa = {
  status: "Pending" | "Review" | "Qualified" | "Removed";
  removed: boolean;
  removeReason: string;
  duplicateGroup: string;
  phoneType: "Mobile" | "Landline" | "VoIP" | "Toll-free" | "Unknown";
  phoneValid: "Yes" | "No" | "Unknown";
  twilioLineType: string;
  twilioCarrier: string;
  twilioEvidence: string;
  runningAds: "Yes" | "No" | "Unknown";
  googleActiveAdCount: string;
  googleAdFormats: string;
  googleAdsNotes: string;
  metaAds: "Yes" | "No" | "Unknown";
  metaActiveAdCount: string;
  metaOfferAngle: string;
  metaNotes: string;
  gbpScore: number;
  googleRating: string;
  reviewCount: string;
  gbpNotes: string;
  fitRating: "Hot" | "Warm" | "Cold" | "Unrated";
  nextStep: string;
  notes: string;
  smsTag: boolean;
  callTag: boolean;
  lastUpdated: string;
};

/**
 * A single lead row, tied to a session.
 */
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  sessionId: integer("sessionId").notNull(),
  position: integer("position").notNull().default(0),
  raw: jsonb("raw").$type<Record<string, string>>().notNull(),
  qa: jsonb("qa").$type<LeadQa>().notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;
