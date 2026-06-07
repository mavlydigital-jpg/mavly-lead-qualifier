import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../../../../server/routers";
import { createContext } from "../../../../server/_core/context";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
    onError({ error, path }) {
      console.error(`[tRPC] ${path} failed:`, error.message);
    },
  });

export { handler as GET, handler as POST };
