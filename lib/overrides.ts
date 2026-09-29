import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export type WebOverrides = {
  aliases: Record<string, string>;
  hidden: string[];
};

const FILE = path.join(process.cwd(), "data", "web-overrides.json");

const DEFAULTS: WebOverrides = { aliases: {}, hidden: [] };

function normalize(raw: unknown): WebOverrides {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULTS, aliases: { ...DEFAULTS.aliases }, hidden: [...DEFAULTS.hidden] };
  const r = raw as Record<string, unknown>;
  const aliases: Record<string, string> =
    typeof r.aliases === "object" && r.aliases !== null && !Array.isArray(r.aliases)
      ? Object.fromEntries(
          Object.entries(r.aliases as Record<string, unknown>).filter(
            (e): e is [string, string] => typeof e[0] === "string" && typeof e[1] === "string",
          ),
        )
      : {};
  const hidden: string[] = Array.isArray(r.hidden) ? r.hidden.filter((x): x is string => typeof x === "string") : [];
  return { aliases, hidden };
}

export function getOverrides(): WebOverrides {
  if (!existsSync(FILE)) return { aliases: {}, hidden: [] };
  try {
    return normalize(JSON.parse(readFileSync(FILE, "utf8")));
  } catch {
    return { aliases: {}, hidden: [] };
  }
}

export function saveOverrides(next: WebOverrides): WebOverrides {
  const clean = normalize(next);
  mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(clean, null, 2) + "\n", "utf8");
  renameSync(tmp, FILE);
  return clean;
}
