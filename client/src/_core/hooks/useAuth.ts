import { trpc } from "@/lib/trpc";
import { useCallback, useMemo } from "react";

/**
 * Local single-user mode. `auth.me` always returns the bootstrapped local user,
 * so `isAuthenticated` is true as soon as the server responds.
 */
export function useAuth() {
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation();

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(
    () => ({
      user: meQuery.data ?? null,
      loading: meQuery.isLoading,
      error: meQuery.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    }),
    [meQuery.data, meQuery.error, meQuery.isLoading],
  );

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
