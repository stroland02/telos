import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// A language is one folder under languages/<id>/ described by a lang.json
// manifest. The registry auto-discovers these, so adding a language is a data
// change (a folder), not a code change.
export interface LangManifest {
  id: string;
  extensions: string[];
  grammar: string; // wasm filename under packages/engine/grammars/
  aliasOf?: string; // reuse another language's extract.scm / layer-hints.json
}

const LANGS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "languages");

/** Read every languages/*\/lang.json under `dir`. A folder without a manifest is
 *  skipped (lets a scaffold create the folder before the manifest is final). A
 *  present-but-malformed manifest throws with its path — never silently dropped. */
export function discoverLanguages(dir: string = LANGS_DIR): LangManifest[] {
  if (!existsSync(dir)) return [];
  const out: LangManifest[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(dir, entry.name, "lang.json");
    if (!existsSync(manifestPath)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Malformed lang.json at ${manifestPath}: ${msg}`);
    }
    const m = parsed as Partial<LangManifest>;
    if (!m.id || !Array.isArray(m.extensions) || typeof m.grammar !== "string") {
      throw new Error(`Invalid lang.json at ${manifestPath}: needs id, extensions[], grammar`);
    }
    out.push({ id: m.id, extensions: m.extensions, grammar: m.grammar, aliasOf: m.aliasOf });
  }
  return out;
}

const MANIFESTS = discoverLanguages();

// id -> manifest
export const LANGUAGE_MANIFESTS: Record<string, LangManifest> = Object.fromEntries(
  MANIFESTS.map((m) => [m.id, m]),
);

// Extension -> language id. Single source of truth for detection.
export const EXTENSION_LANGUAGE: Record<string, string> = Object.fromEntries(
  MANIFESTS.flatMap((m) => m.extensions.map((ext) => [ext, m.id])),
);

export const SUPPORTED_EXTENSIONS = Object.keys(EXTENSION_LANGUAGE);

// Language id -> grammar wasm filename (under packages/engine/grammars/).
export const LANGUAGE_GRAMMAR: Record<string, string> = Object.fromEntries(
  MANIFESTS.map((m) => [m.id, m.grammar]),
);

export function extractQueryPath(language: string): string {
  // aliasOf languages (e.g. javascript) read the aliased language's query.
  const dir = LANGUAGE_MANIFESTS[language]?.aliasOf ?? language;
  return join(LANGS_DIR, dir, "extract.scm");
}
