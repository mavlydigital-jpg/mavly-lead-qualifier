import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  InsertUser,
  users,
  sessions,
  leads,
  type InsertSession,
  type InsertLead,
  type LeadQa,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const client = postgres(process.env.DATABASE_URL, {
        prepare: false,
        max: 5,
      });
      _db = drizzle(client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db
      .insert(users)
      .values(values)
      .onConflictDoUpdate({
        target: users.openId,
        set: updateSet,
      });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ---------- Sessions ----------
export async function createSession(input: InsertSession) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [res] = await db.insert(sessions).values(input).returning({ id: sessions.id });
  return res.id;
}

export async function listSessions(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sessions)
    .where(eq(sessions.ownerOpenId, ownerOpenId))
    .orderBy(desc(sessions.createdAt));
}

export async function getSession(ownerOpenId: string, sessionId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.ownerOpenId, ownerOpenId)))
    .limit(1);
  return rows[0];
}

export async function deleteSession(ownerOpenId: string, sessionId: number) {
  const db = await getDb();
  if (!db) return;
  const owned = await getSession(ownerOpenId, sessionId);
  if (!owned) return;
  await db.delete(leads).where(eq(leads.sessionId, sessionId));
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function updateSessionCount(sessionId: number, count: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(sessions).set({ leadCount: count }).where(eq(sessions.id, sessionId));
}

// ---------- Leads ----------
export async function bulkInsertLeads(rows: InsertLead[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(leads).values(rows.slice(i, i + CHUNK));
  }
}

export async function listLeadsBySession(sessionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(leads).where(eq(leads.sessionId, sessionId)).orderBy(leads.position);
}

export async function updateLeadQa(leadId: number, qa: LeadQa) {
  const db = await getDb();
  if (!db) return;
  await db.update(leads).set({ qa }).where(eq(leads.id, leadId));
}

export async function getLead(leadId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  return rows[0];
}

// ---------- Local single-user bootstrap (no OAuth) ----------
const LOCAL_OPEN_ID = "local-user";

type LocalUser = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: "user" | "admin";
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

// In-memory cache so we don't hit the DB on every tRPC request.
let _localUserCache: LocalUser | null = null;

export async function ensureLocalUser(): Promise<LocalUser> {
  if (_localUserCache) return _localUserCache;

  const fallback: LocalUser = {
    id: 1,
    openId: LOCAL_OPEN_ID,
    name: ENV.ownerName || "Local User",
    email: null,
    loginMethod: "local",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  const db = await getDb();
  if (!db) {
    _localUserCache = fallback;
    return fallback;
  }
  try {
    await db
      .insert(users)
      .values({
        openId: LOCAL_OPEN_ID,
        name: fallback.name,
        loginMethod: "local",
        role: "admin",
        lastSignedIn: new Date(),
      })
      .onConflictDoUpdate({
        target: users.openId,
        set: { lastSignedIn: new Date() },
      });
    const existing = await getUserByOpenId(LOCAL_OPEN_ID);
    _localUserCache = (existing as LocalUser) ?? fallback;
    return _localUserCache;
  } catch (err) {
    console.warn("[Database] ensureLocalUser failed, using in-memory fallback:", err);
    _localUserCache = fallback;
    return fallback;
  }
}
