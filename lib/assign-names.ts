import { getOverrides, saveOverrides } from "./overrides";
import { NORDIC_POOL, NORDIC_POOL_SIZE } from "./nordic-names";

export type SessionRef = { id: string; agent?: string | null; parent_id?: string | null };

// FNV-1a 32-bit — deterministik antar restart, tanpa dependensi.
export function hashSessionId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Assign nama display unik:
// - alias user selalu menang (utama maupun sub-agent)
// - sub-agent (parent_id NOT NULL) tanpa alias -> nama dewa
// - sesi utama (parent_id NULL/unknown) tanpa alias -> TIDAK di-assign (pakai agent asli)
// Input di-sort by id agar hasil stabil tak peduli urutan polling.
export function assignDisplayNames(
  sessions: SessionRef[],
  existingAliases: Record<string, string> = {},
): Record<string, string> {
  const used = new Set(Object.values(existingAliases));
  const assigned: Record<string, string> = {};
  const sorted = [...sessions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const s of sorted) {
    if (existingAliases[s.id]) continue; // user alias menang, tak perlu auto-name
    if (assigned[s.id]) continue;
    if (!s.parent_id) continue; // utama/unknown -> agent asli, tanpa dewa
    const idx = hashSessionId(s.id) % NORDIC_POOL_SIZE;
    for (let probe = 0; probe < NORDIC_POOL_SIZE; probe++) {
      const candidate = NORDIC_POOL[(idx + probe) % NORDIC_POOL_SIZE]!;
      if (!used.has(candidate)) {
        assigned[s.id] = candidate;
        used.add(candidate);
        break;
      }
    }
  }
  return assigned;
}

// Nama display final: alias user > dewa (sub-agent saja) > fallback agent/id.
// parent_id wajib untuk klaim dewa; sesi utama (null/unknown) -> agent asli.
export function displayNameFor(
  id: string,
  agent: string | null | undefined,
  aliases: Record<string, string>,
  parent_id?: string | null,
): string {
  const manual = aliases[id];
  if (manual) return manual;
  if (!parent_id) return agent ?? id.slice(0, 8);
  return NORDIC_POOL[hashSessionId(id) % NORDIC_POOL_SIZE] ?? agent ?? id.slice(0, 8);
}

// Persist: isi alias kosong untuk sesi baru ke data/web-overrides.json.
// Mengembalikan full aliases map (existing + auto). Hanya menulis bila ada tambahan.
export function ensurePersistedAliases(sessions: SessionRef[]): Record<string, string> {
  const current = getOverrides();
  const added = assignDisplayNames(sessions, current.aliases);
  if (Object.keys(added).length === 0) return current.aliases;
  const next = saveOverrides({
    aliases: { ...current.aliases, ...added },
    hidden: current.hidden,
  });
  return next.aliases;
}
