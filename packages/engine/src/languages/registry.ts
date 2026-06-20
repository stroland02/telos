import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Extension → language id. Single source of truth for detection.
export const EXTENSION_LANGUAGE: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript",
  ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
  ".py": "python",
};

export const SUPPORTED_EXTENSIONS = Object.keys(EXTENSION_LANGUAGE);

// Language id → grammar wasm filename (under packages/engine/grammars/).
export const LANGUAGE_GRAMMAR: Record<string, string> = {
  typescript: "tree-sitter-typescript.wasm",
  javascript: "tree-sitter-typescript.wasm", // TS grammar parses JS
  python: "tree-sitter-python.wasm",
};

const LANGS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "languages");

export function extractQueryPath(language: string): string {
  // javascript reuses the typescript query
  const dir = language === "javascript" ? "typescript" : language;
  return join(LANGS_DIR, dir, "extract.scm");
}
