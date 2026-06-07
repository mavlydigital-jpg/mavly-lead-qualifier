# Mavly Lead Qualifier — TODO

## Database & Backend
- [x] Schema: sessions table (id, fileName, headers JSON, createdAt)
- [x] Schema: leads table (id, sessionId, raw JSON, qa fields, createdAt, updatedAt)
- [x] Generate migration and apply via webdev_execute_sql
- [x] db.ts helpers: createSession, getSessions, getSessionLeads, bulkInsertLeads, updateLeadQa, deleteSession
- [x] routers: sessions.list, sessions.create, sessions.get, sessions.delete
- [x] routers: leads.listBySession, leads.bulkCreate, leads.updateQa, leads.dedup
- [x] routers: twilio.lookup (single), twilio.bulkLookup
- [x] Twilio secrets (account_sid, auth_token) via webdev_request_secrets

## Frontend (Dark UI)
- [x] Dark theme tokens in index.css
- [x] Sidebar: lead list, stats (total/reviewed/good/removed), search bar, filter chips (All/Pending/Qualified/Removed)
- [x] CSV upload drag-and-drop dropzone, client-side parse, persist to DB
- [x] Qualification panel: phone type, Google Ads, Meta Ads, GBP score (1-5 stars), Google rating, review count, fit rating, next step, notes
- [x] Automatic scoring (0-100) and grading (Hot/Warm/Review/Remove/Removed)
- [x] Checklist tracker (Phone/GBP/Google Ads/Meta Ads/Final decision) with completion %
- [x] Single-lead Twilio lookup button
- [x] Bulk Twilio check across unchecked leads
- [x] Duplicate cleanup (phone or company+city key, keep highest completion, mark "Duplicate")
- [x] Exports: GHL SMS, GHL Call, Hot/Warm, Good, Bad/Removed, All (all CSV)
- [x] Keyboard shortcuts: J/← prev, K/→ next, Q qualify, X toggle remove

## Constraints (exact strings)
- [x] Filter chips: All, Pending, Qualified, Removed
- [x] Grades: Hot, Warm, Review, Remove, Removed
- [x] Fit: Hot, Warm, Cold
- [x] Phone type: Mobile, Landline, VoIP, Toll-free, Unknown
- [x] Duplicate reason: "Duplicate"

## Tests
- [x] Vitest for scoring/grading logic
- [x] Vitest for dedup logic
- [x] Vitest for export row builders
