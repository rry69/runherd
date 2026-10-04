// Reset sesi Hermes: backup + archive sesi (tanpa DELETE baris).
// - Default: hanya sesi yang sudah selesai (ended_at NOT NULL) → disembunyikan
//   dari dashboard (query dashboard filter archived=0). Sesi terbuka aman.
// - Arg "all": archive SEMUA sesi termasuk yang terbuka.
// - Backup otomatis: state.db.bak-YYYYMMDD-HHmmss (restore = timpa balik).
// - Tutup aplikasi Hermes dulu bila error "database is locked".
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const HOME = process.env.HERMES_HOME || String.raw`C:\Users\Hrry\AppData\Local\hermes`;
const DB = path.join(HOME, "state.db");
const includeOpen = process.argv[2] === "all";

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

if (!fs.existsSync(DB)) {
  console.error("DB tidak ditemukan: " + DB);
  process.exit(1);
}

const bak = `${DB}.bak-${stamp()}`;
fs.copyFileSync(DB, bak);
console.log("Backup: " + bak);

let db;
try {
  db = new Database(DB, { timeout: 10000 });
} catch (e) {
  console.error("Gagal buka DB (tutup aplikasi Hermes dulu?): " + e.message);
  process.exit(1);
}

const before = db.prepare("SELECT COUNT(*) c, COALESCE(SUM(archived),0) a FROM sessions").get();
const open = db.prepare("SELECT COUNT(*) c FROM sessions WHERE ended_at IS NULL").get().c;
console.log(`Sebelum: ${before.c} sesi (${before.a} archived, ${open} terbuka)`);

const res = includeOpen
  ? db.prepare("UPDATE sessions SET archived = 1 WHERE COALESCE(archived,0) = 0").run()
  : db.prepare("UPDATE sessions SET archived = 1 WHERE ended_at IS NOT NULL AND COALESCE(archived,0) = 0").run();
console.log(`Archived: ${res.changes} sesi${includeOpen ? " (SEMUA)" : " (yang selesai saja)"}`);

// Rampingkan ukuran: hapus messages milik sesi archived (126MB+,
// termasuk index FTS yang ikut bersih via trigger), lalu VACUUM.
let t0 = Date.now();
const del = db
  .prepare("DELETE FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE COALESCE(archived,0) = 1)")
  .run();
console.log(`Hapus messages sesi archived: ${del.changes} baris (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
t0 = Date.now();
db.exec("VACUUM");
console.log(`VACUUM selesai (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
const after = db.prepare("SELECT COUNT(*) c, COALESCE(SUM(archived),0) a FROM sessions").get();
const size = (fs.statSync(DB).size / 1048576).toFixed(1);
console.log(`Sesudah: ${after.c} sesi (${after.a} archived), ukuran DB ${size} MB`);
db.close();
console.log("Selesai.");
