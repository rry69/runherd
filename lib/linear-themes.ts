// Palet dari https://linear.style (repo alii/linear-style, src/themes.json).
// Format asli: 6 hex comma-delimited dari Linear settings page:
// [bg, fg, surface, surfaceFg, accent, accentFg].
// Contoh Midnight: #0F0F10,#EEEFF1,#151516,#EEEFF1,#D25E65,#FFFFFF.

export interface LinearTheme {
  name: string;
  bg: string;
  fg: string;
  surface: string;
  surfaceFg: string;
  accent: string;
  accentFg: string;
}

function t(
  name: string,
  bg: string,
  fg: string,
  surface: string,
  surfaceFg: string,
  accent: string,
  accentFg: string,
): LinearTheme {
  const fix = (c: string) => (c.startsWith("#") ? c : `#${c}`);
  return { name, bg: fix(bg), fg: fix(fg), surface: fix(surface), surfaceFg: fix(surfaceFg), accent: fix(accent), accentFg: fix(accentFg) };
}

export const LINEAR_THEMES: LinearTheme[] = [
  t("AOSP Extended", "#242038", "#FFFFFF", "#332D4F", "#C3BDE1", "#22EF8B", "#092012"),
  t("Aji-sai", "#F3F1F8", "#2A2734", "#C2D4E9", "#553C67", "#7FB069", "#FBF9F2"),
  t("Ash", "#FFFFFF", "#44494D", "#EDEEF3", "#44494D", "#475BA1", "#FFFFFF"),
  t("Ayu Mirage", "#1A1F29", "#CCC29C", "#1F2430", "#CCC29C", "#FFCC66", "#CCC29C"),
  t("Barbie Dreamhouse", "#E2DAF1", "#593E74", "#FCDEEE", "#593E74", "#B8FAFA", "#8B6BC7"),
  t("Bark", "#191816", "#7C7B78", "#1B1A17", "#5B5A56", "#5B5A56", "#F6F7EA"),
  t("Blackpink", "#0A0009", "#CCCCCC", "#0A0009", "#888888", "#BA00A8", "#FFFFFF"),
  t("Bubblegum", "#F08080", "#693636", "#7968E3", "#FFFFFF", "#6E79D6", "#FFFFFF"),
  t("Campfire", "#000000", "#FFFFFF", "#000000", "#777770", "#FFAE80", "#27272B"),
  t("Catppuccin Latte", "#EFF1F5", "#4C4F69", "#E6E9EF", "#5C5F77", "#7287FD", "#DCE0E8"),
  t("Catppuccin Frappé", "#303446", "#c6d0f5", "#292c3c", "#b5bfe2", "#babbf1", "#232634"),
  t("Catppuccin Macchiato", "#24273A", "#CAD3F5", "#1E2030", "#B8C0E0", "#B7BDF8", "#181926"),
  t("Catppuccin Mocha", "#1E1E2E", "#CDD6F4", "#181825", "#BAC2DE", "#B4BEFE", "#11111B"),
  t("Cobalt2", "#193549", "#FFFFFF", "#15232D", "#AAAAAA", "#0088FF", "#FFFFFF"),
  t("Composer", "#0F0F10", "#EEEFF1", "#1c372a", "#EEEFF1", "#f6609f", "#030303"),
  t("Crew", "#f9fbfd", "#333333", "#1d1f31", "#8E8F99", "#688aff", "#ffffff"),
  t("Dawn", "#2A222E", "#EEEFF1", "#382A3C", "#EEEFF1", "#A84376", "#FFFFFF"),
  t("Discord", "#37393E", "#DCDDDE", "#2F3136", "#DCDDDE", "#768AD4", "#FFFFFF"),
  t("Dracula", "#282A36", "#F8F8F2", "#44475A", "#F8F8F2", "#FF5555", "#FFFFFF"),
  t("Dwellberry", "#1A1A27", "#F7F7F7", "#13131E", "#C3C2D4", "#5973FE", "#FFFFFF"),
  t("Dwellcherry", "#1A1A27", "#F7F7F7", "#13131E", "#C3C2D4", "#DE3163", "#FFFFFF"),
  t("Edge", "#F6F6F6", "#000000", "#000000", "#8E8E8E", "#405CD2", "#FFFFFF"),
  t("Everforest Dark", "#2D353B", "#D3C6AA", "#2D353B", "#D3C6AA", "#A7C080", "#2D353B"),
  t("Everforest Light", "#FDF6E3", "#5C6A72", "#FDF6E3", "#5C6A72", "#8DA101", "#FDF6E3"),
  t("Finland", "#FAFAFF", "#000000", "#003281", "#FFFFFF", "#003281", "#FFFFFF"),
  t("Flatly", "#FFFFFF", "#212529", "#ECF0F1", "#212529", "#2C3E4F", "#FFFFFF"),
  t("Fuse", "#16151B", "#969696", "#0F0E12", "#D7D8DB", "#FD6C53", "#FFFFFF"),
  t("GMK Samurai", "#020202", "#FFFFFF", "#6B2929", "#FFFFFF", "#B29961", "#020202"),
  t("Gamelib Amethyst", "#190f2a", "#9EABB8", "#2e1e47", "#FFFFFF", "#7E51C7", "#17161F"),
  t("Gamelib Dark", "#111016", "#9EABB8", "#1f1f20", "#FFFFFF", "#C7AA51", "#17161F"),
  t("Giggl", "#191D1F", "#D7D8DB", "#1F2023", "#D7D8DB", "#fe0099", "#e7d3ed"),
  t("Giggl (Legacy)", "#191D1F", "#D7D8DB", "#1F2023", "#D7D8DB", "#543FD7", "#DBD3ED"),
  t("GitHub", "#F5F7F9", "#24292E", "#FFFFFF", "#24292E", "#0366D6", "#ffffff"),
  t("GitHub Desktop", "#222528", "#FFFFFF", "#1C1E21", "#FFFFFF", "#0366D6", "#FFFFFF"),
  t("Github Dark", "#06090f", "#f0f6fc", "#0d1117", "#c9d1d9", "#238636", "#ffffff"),
  t("Gruvbox Dark", "#282828", "#ebdbb2", "#3c3836", "#d5c4a1", "#98971a", "#282828"),
  t("Gruvbox Light", "#F9F5D7", "#3C3836", "#F2E5Bc", "#282828", "#CC241D", "#F9F5D7"),
  t("Hokkaido", "#F8F8F8", "#000000", "#B3C2F2", "#000000", "#A366FF", "#FFFFFF"),
  t("High Contrast Dark", "#000000", "#FFFFFF", "#050505", "#FFFF00", "#0000FF", "#FFFFFF"),
  t("High Contrast Light", "#FFFFFF", "#000000", "#FFFFFF", "#000000", "#0000FF", "#FFFFFF"),
  t("Hot Dog Stand", "#FFFF00", "#000000", "#FF0000", "#FFFF00", "#000000", "#FFFFFF"),
  t("Hyst", "#000A02", "#CCCCCC", "#000A02", "#888888", "#039917", "#FFFFFF"),
  t("iA Dark", "#232223", "#CCCCCC", "#141414", "#9D9D9D", "#4FAFF9", "#FFFFFF"),
  t("iA Light", "#F7F7F7", "#1A1A1A", "#FCFCFC", "#232323", "4FAFF9", "#FFFFFF"),
  t("Meter", "#1E202E", "#FAFAFC", "#343647", "#FAFAFC", "#5461C8", "#FFFFFF"),
  t("Midnight", "#0F0F10", "#EEEFF1", "#151516", "#EEEFF1", "#D25E65", "#FFFFFF"),
  t("Midnight Blue", "#1E2A38", "#B0BED4", "#1B2735", "#B0BED4", "#BB6384", "#FFFFFF"),
  t("Molokai", "#1B1D1E", "#F8F8F0", "#293739", "#F8F8F0", "#F92672", "#F8F8F0"),
  t("Moonlight", "#222436", "#c8d3f5", "#1e2030", "#c8d3f5", "#65bcff", "#191a2a"),
  t("Night Owl", "#011627", "#e6e6e6", "#011627", "#89A4BB", "#0166DA", "#FFFFFF"),
  t("Nightrad", "#000d21", "#e6e6e6", "#000d21", "#ebdefa", "#9747ff", "#FFFFFF"),
  t("Noctis Uva", "#292640", "#A09CB7", "#232136", "#A09CB7", "#44CA96", "#292640"),
  t("Nord", "#2E3440", "#ECEFF4", "#3B4252", "#ECEFF4", "#88C0D0", "#2E3440"),
  t("Notion Dark", "#2F3437", "#EAEBEB", "#373C3F", "#9a9ea1", "#7E8183", "#FFFFFF"),
  t("Notion Light", "#FFFFFF", "#37352F", "#F7F6F3", "#85837E", "#E8E7E3", "#000000"),
  t("PINE Dark", "#1A1A1C", "#D7D8DB", "#13354D", "#C5E4F9", "#0083E0", "#FFFFFF"),
  t("PINE Light", "#F5F5F5", "#1A1A1C", "#D7E7F1", "#0F4974", "#0083E0", "#FFFFFF"),
  t("Pale", "#292D3E", "#EEEFF1", "#292D3E", "#EEEFF1", "#7D57C1", "#FFFFFF"),
  t("Peach", "#27272B", "#FFFFFF", "#2C2C31", "#BABAC1", "#F9A28E", "#27272B"),
  t("Phoenix", "#0B1E3A", "#FAF3E0", "#FBAE72", "#3B3B3B", "#FF5733", "#FFD700"),
  t("Pinky Boo", "#FEFBFF", "#593E74", "#FDF2FD", "#593E74", "#ED71BE", "#FFFFFF"),
  t("Poimandres", "#1B1E28", "#A6ACCD", "#1B1E28", "#A6ACCD", "#ADD7FF", "#1B1E28"),
  t("Popdog Dark", "#0D1113", "#FFFFFF", "#2D3133", "#FFFFFF", "#F84443", "#C0C5C8"),
  t("Popdog Light", "#FFFFFF", "#0D1113", "#EBF1F5", "#5B5D5E", "#F84443", "#FFFFFF"),
  t("Produx App", "#000000", "#1A985C", "#1B1C1F", "#FFFFFF", "#21BF73", "#FFFFFF"),
  t("Ramp", "#1B1B18", "#FCFBFA", "#2E2E27", "#FCFBFA", "#F5FF78", "#000000"),
  t("Rose Pine", "#1F1D2E", "#908CAA", "#191724", "#E0DEF4", "#C4A7E7", "#524F67"),
  t("Rose Pine Moon", "#2A273F", "#908CAA", "#232136", "#E0DEF4", "#C4A7E7", "#2A283E"),
  t("Rose Pine Dawn", "#FFFAF3", "#797593", "#FAF4ED", "#575279", "#286983", "#F4EDE8"),
  t("Sabrena Khadija", "#F5B64C", "#292D3E", "#F5B64C", "#292D3E", "#eb4746", "#FAE1AE"),
  t("Scout", "#141616", "#FAFAFA", "#1C1E1F", "#F4F5F7", "#003EFF", "#FFFFFF"),
  t("Shades of Purple", "#2D2B55", "#FFFFFF", "#222244", "#A599E9", "#FAD000", "#2D2B55"),
  t("Simple Blue", "#143342", "#EEEFF1", "#1B4769", "#EEEFF1", "#4692D4", "#FFFFFF"),
  t("Simple Green", "#144215", "#EEEFF1", "#1F691B", "#EEEFF1", "#46D448", "#FFFFFF"),
  t("Simple Orange", "#422D14", "#EEEFF1", "#694A1B", "#EEEFF1", "#D48B46", "#FFFFFF"),
  t("Simple Purple", "#2D154A", "#EEEFF1", "#3D1D63", "#EEEFF1", "#7D57C1", "#FFFFFF"),
  t("Simple Red", "#451515", "#EEEFF1", "#691B1B", "#EEEFF1", "#D44646", "#FFFFFF"),
  t("Simple Yellow", "#423E14", "#EEEFF1", "#69681B", "#EEEFF1", "#D4CD46", "#FFFFFF"),
  t("Slack Light", "#FFFFFF", "#616061", "#400E40", "#CFC2CF", "#400E40", "#FFFFFF"),
  t("Solarized Dark", "#073642", "#FDF6E3", "#002B36", "#FDF6E3", "#CB4B16", "#FDF6E3"),
  t("Solarized Light", "#FDF6E3", "#073642", "#EEE8D5", "#073642", "#D33682", "#FDF6E3"),
  t("Spotify", "#181818", "#DCDDDE", "#121212", "#DCDDDE", "#1CB954", "#FFFFFF"),
  t("StarCraft", "#191919", "#D8D8D8", "#121212", "#D8D8D8", "#4946DB", "#FFFFFF"),
  t("Subso", "#553FE8", "#644FEC", "#725EEF", "#7B69F0", "#D4CEFB", "#FFFFFF"),
  t("Sunset", "#C94E4E", "#FFFFFF", "#582233", "#D7D8DB", "#430D27", "#FFFFFF"),
  t("Surf", "#F9F9F9", "#1E2052", "#FFFFFF", "#828282", "#4A53D7", "#FFFFFF"),
  t("Swat.io", "#ffffff", "#132540", "#dbeaff", "#081d2c", "#4d92fd", "#ffffff"),
  t("Sweet Treat", "#FFFFFF", "#4D1A4C", "#FFEEED", "#6D3961", "#3FBC8E", "#FFFFFF"),
  t("Toasted Marshmallow", "#333033", "#D7D8DB", "#2E2C2E", "#D7D8DB", "#E6B479", "#FFFFFF"),
  t("Tokyo Night", "#17161F", "#CCCCCC", "#1A1A27", "#5C5C87", "#61D0FF", "#17161F"),
  t("Twitch Dark", "#0E0E10", "#EFEFF1", "#1F1F23", "#EFEFF1", "#9147FF", "#FFFFFF"),
  t("Vercel", "#000000", "#CCCCCC", "#111111", "#888888", "#3290FF", "#FFFFFF"),
  t("Vesper", "#101010", "#FFFFFF", "#101010", "#CCCCCC", "#F7C9A0", "#1E1E1E"),
  t("YouTube Dark", "#181818", "#FFFFFF", "#212121", "#AAAAAA", "#FF0000", "#FFFFFF"),
  t("Zyndicate", "#181818", "#DCDDDE", "#121212", "#DCDDDE", "#3854FC", "#FFFFFF"),
  t("Radix Green", "#0C1F17", "#FBFEFC", "#0D1912", "#FBFEFC", "#4CC38A", "#FFFFFF"),
  t("GMK Oblivion", "#474747", "#A898C5", "#393939", "#93C349", "#EB4223", "#FFAD01"),
  t("Atom One Dark (Blue Accent)", "#282C32", "#E4E7E4", "#353A44", "#AAB2BE", "61AFEF", "#0B1522"),
  t("Sage", "#EDECE7", "#2A3230", "#8AA39E", "#1C2423", "#333B39", "#C49A6C"),
  t("Woodland", "#EEF0EB", "#2B3133", "#A38F6D", "#1E2325", "#343A3C", "#C9B79C"),
];

export const LINEAR_STORAGE_KEY = "dashboard-linear-theme";

export function isDarkHex(hex: string): boolean {
  const [r, g, b] = hexRgb(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function relLum(hex: string): number {
  const [r, g, b] = hexRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Campuran dua hex (porsi a) — cerminkan `color-mix(in srgb, a p%, b)`. */
function mixHex(a: string, b: string, p: number): string {
  const A = hexRgb(a);
  const B = hexRgb(b);
  return `#${A.map((v, i) => Math.round(v * p + B[i] * (1 - p)).toString(16).padStart(2, "0")).join("")}`;
}
/** Rasio kontras WCAG 1–21. Dipakai sebagai guardrail pasangan teks/background. */
export function contrastRatio(a: string, b: string): number {
  const x = relLum(a);
  const y = relLum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Hitam/putih — mana yang lebih terbaca di atas bg. */
function bestOn(bg: string): string {
  return contrastRatio("#000000", bg) >= contrastRatio("#ffffff", bg) ? "#000000" : "#ffffff";
}

/**
 * Guardrail: pakai warna tema apa adanya bila kontrasnya cukup (>= min),
 * kalau tidak (data sumber rusak, mis. Subso fg≈bg atau Ayu Mirage
 * accentFg≈accent) fallback ke hitam/putih. Tema sehat tidak tersentuh.
 */
function ensureText(preferred: string, bg: string, min = 3): string {
  try {
    if (contrastRatio(preferred, bg) >= min) return preferred;
  } catch {
    /* hex tak valid → fallback */
  }
  return bestOn(bg);
}

/** Terapkan tema ke <html> via inline CSS vars + persist. Global, bukan overview saja.
 *
 * Semantik yang benar (jangan samakan semua ke surface):
 * - bg/fg = page background + foreground.
 * - card/popover = elevated bg (campuran fg di atas bg), agar kartu tetap
 *   satu keluarga dengan background — bukan blok warna solid menabrak.
 * - muted/secondary/accent = fill + teks subtle yang terbaca DI ATAS
 *   background maupun card (diturunkan dari bg/fg, bukan surfaceFg).
 * - primary/ring = accent Linear. Sidebar = surface (panel brand, mis.
 *   Finland biru tua di atas page terang — memang disengaja di sana).
 */
export function applyLinearTheme(theme: LinearTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const set = (k: string, v: string) => root.style.setProperty(k, v);
  const darkBg = isDarkHex(theme.bg);
  // Kartu: dark → bg diangkat dikit; light → putih agar kontras di atas bg terang.
  const card = darkBg
    ? `color-mix(in srgb, ${theme.fg} 7%, ${theme.bg})`
    : "#ffffff";
  // Teks body di atas card: fg tema bila cukup kontras, kalau tidak (sumber
  // rusak seperti Subso) fallback hitam/putih. Dicek vs card DAN bg.
  const cardFg = ensureText(theme.fg, darkBg ? theme.bg : "#ffffff", 3);
  const muted = `color-mix(in srgb, ${theme.fg} 8%, ${theme.bg})`;
  // Teks subtle: campuran 75% (dekat fg, tidak terlalu redup). Empat tema
  // (Bubblegum, GMK Oblivion, Rose Pine Dawn, Bark) campurannya <3:1 di atas
  // bg → fallback ke fg (di semua kasus itu >=3:1), terakhir hitam/putih.
  let mutedFg = `color-mix(in srgb, ${theme.fg} 75%, ${theme.bg})`;
  try {
    if (contrastRatio(mixHex(theme.fg, theme.bg, 0.75), theme.bg) < 3) {
      mutedFg = ensureText(theme.fg, theme.bg, 3);
    }
  } catch {
    mutedFg = ensureText(theme.fg, theme.bg, 3);
  }
  const secondary = `color-mix(in srgb, ${theme.fg} 11%, ${theme.bg})`;
  const accentFill = `color-mix(in srgb, ${theme.fg} 10%, ${theme.bg})`;
  // Border harus terlihat di atas background DAN card putih.
  const edge = `color-mix(in srgb, ${theme.fg} 15%, ${theme.bg})`;
  const sidebarEdge = `color-mix(in srgb, ${theme.surfaceFg} 18%, ${theme.surface})`;
  // Guardrail runtime untuk ~15 tema yang accentFg≈accent (Ayu Mirage 1.2:1,
  // Simple Yellow/Green, dsb) + muted lemah: pilih hitam/putih.
  const primaryFg = ensureText(theme.accentFg, theme.accent, 3);
  const sidebarFg = ensureText(theme.surfaceFg, theme.surface, 3);
  set("--background", theme.bg);
  set("--foreground", theme.fg);
  set("--card", card);
  set("--card-foreground", cardFg);
  set("--popover", card);
  set("--popover-foreground", cardFg);
  set("--secondary", secondary);
  set("--secondary-foreground", cardFg);
  set("--muted", muted);
  set("--muted-foreground", mutedFg);
  set("--accent", accentFill);
  set("--accent-foreground", cardFg);
  set("--primary", theme.accent);
  set("--primary-foreground", primaryFg);
  set("--ring", theme.accent);
  set("--border", edge);
  set("--input", edge);
  // Sidebar = panel brand → memang pakai surface (Finland: biru tua).
  set("--sidebar", theme.surface);
  set("--sidebar-foreground", sidebarFg);
  set("--sidebar-primary", theme.accent);
  set("--sidebar-primary-foreground", primaryFg);
  set("--sidebar-accent", `color-mix(in srgb, ${theme.surfaceFg} 12%, ${theme.surface})`);
  set("--sidebar-accent-foreground", sidebarFg);
  set("--sidebar-border", sidebarEdge);
  set("--sidebar-ring", theme.accent);
  root.style.colorScheme = isDarkHex(theme.bg) ? "dark" : "light";
  root.dataset.linearTheme = theme.name;
  try {
    localStorage.setItem(LINEAR_STORAGE_KEY, theme.name);
  } catch {
    /* abaikan: storage penuh / private mode */
  }
}

export function getStoredLinearTheme(): LinearTheme | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const name = localStorage.getItem(LINEAR_STORAGE_KEY);
    if (!name) return null;
    return LINEAR_THEMES.find((t) => t.name === name) ?? null;
  } catch {
    return null;
  }
}

/** Dipanggil saat mount untuk pulihkan pilihan tersimpan. */
export function applyStoredLinearTheme(): LinearTheme | null {
  const theme = getStoredLinearTheme();
  if (theme) applyLinearTheme(theme);
  return theme;
}

export function resetLinearTheme(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  [
    "--background", "--foreground", "--card", "--card-foreground", "--popover",
    "--popover-foreground", "--secondary", "--secondary-foreground", "--muted",
    "--muted-foreground", "--accent", "--accent-foreground", "--primary",
    "--primary-foreground", "--ring", "--border", "--input", "--sidebar",
    "--sidebar-foreground", "--sidebar-primary", "--sidebar-primary-foreground",
    "--sidebar-accent", "--sidebar-accent-foreground", "--sidebar-border", "--sidebar-ring",
  ].forEach((k) => root.style.removeProperty(k));
  root.style.removeProperty("color-scheme");
  delete root.dataset.linearTheme;
  try {
    localStorage.removeItem(LINEAR_STORAGE_KEY);
  } catch {
    /* abaikan */
  }
}
