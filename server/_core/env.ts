export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "local-dev-secret",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "local-user",
  ownerName: process.env.OWNER_NAME ?? "Local User",
  isProduction: process.env.NODE_ENV === "production",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  apifyToken: process.env.APIFY_TOKEN ?? "",
};
