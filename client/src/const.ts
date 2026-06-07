export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// No-op in local single-user mode. Kept for compatibility with any caller
// that still references it; returning "#" prevents accidental navigation.
export const getLoginUrl = () => "#";
