import { publicProcedure, router } from "./_core/trpc";
import { leadsRouter } from "./routers/leads";

/**
 * Local single-user mode: `auth.me` returns the bootstrapped local user
 * (from createContext), and `auth.logout` is a no-op since there's no session.
 */
export const appRouter = router({
  leads: leadsRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(() => ({ success: true } as const)),
  }),
});

export type AppRouter = typeof appRouter;
