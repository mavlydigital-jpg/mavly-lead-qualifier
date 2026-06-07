// One-off: strip HTML tags/entities from stored lead.raw values.
// Usage: node clean-em.mjs           (dry run, shows what would change)
//        node clean-em.mjs --apply   (writes the cleaned values back)
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const ROOT = "/sessions/eloquent-laughing-volta/mnt/mavly-lead-qualifier";

// Load DATABASE_URL from .env
const env = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
const url = env.split("\n").find((l) => l.startsWith("DATABASE_URL="))?.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
if (!url) { console.error("No DATABASE_URL in .env"); process.exit(1); }

const HTML_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
function stripHtml(value) {
  if (typeof value !== "string") return value;
  if (!value || (value.indexOf("<") === -1 && value.indexOf("&") === -1)) return value;
  return value
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body) => {
      if (body[0] === "#") {
        const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      const named = HTML_ENTITIES[body.toLowerCase()];
      return named !== undefined ? named : m;
    })
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const apply = process.argv.includes("--apply");
const sql = postgres(url, { prepare: false, max: 3 });

const rows = await sql`SELECT id, raw FROM leads`;
let changed = 0;
const samples = [];
for (const row of rows) {
  const raw = row.raw || {};
  const next = {};
  let dirty = false;
  for (const [k, v] of Object.entries(raw)) {
    const cleaned = stripHtml(v);
    next[k] = cleaned;
    if (cleaned !== v) { dirty = true; if (samples.length < 15) samples.push(`#${row.id} [${k}] "${v}" -> "${cleaned}"`); }
  }
  if (dirty) {
    changed++;
    if (apply) await sql`UPDATE leads SET raw = ${sql.json(next)} WHERE id = ${row.id}`;
  }
}

console.log(`Scanned ${rows.length} leads. ${changed} contain HTML.`);
console.log(samples.join("\n"));
console.log(apply ? "\nAPPLIED: rows updated." : "\nDRY RUN — re-run with --apply to write changes.");
await sql.end();
