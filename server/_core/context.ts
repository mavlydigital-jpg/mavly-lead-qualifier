import type { User } from "../../drizzle/schema";
import { ensureLocalUser } from "../db";

/**
 * tRPC context shape. In Next.js single-user mode we don't need to expose
 * the underlying Request/Response — we only carry the bootstrapped user.
 */
export type TrpcContext = {
  user: User | null;
};

export async function createContext(): Promise<TrpcContext> {
  let user: User | null = null;
  try {
    user = (await ensureLocalUser()) as User;
  } catch (error) {
    console.warn("[Auth] Failed to load local user:", error);
    user = null;
  }
  return { user };
}
