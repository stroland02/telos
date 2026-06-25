import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface AddLanguageOptions {
  id: string;
  extensions: string[];
  grammar?: string;
  aliasOf?: string;
  dir: string; // target languages/ directory
}

export interface AddLanguageResult {
  folder: string;
  created: string[];
}

const SCM_STUB = `; extract.scm for <id>
; Map this language's tree-sitter AST nodes onto Telos's universal kinds.
; Tag captures Telos understands: @definition.class, @definition.function,
; @definition.method, @definition.interface, @reference.call, @reference.import.
; Example (pseudo — adapt the node types to this grammar):
;   (function_definition name: (identifier) @name) @definition.function
`;

/** Scaffold a complete, auto-discoverable language folder under \`dir\`. Writes a
 *  lang.json manifest plus (unless aliasOf) an extract.scm stub and an empty
 *  layer-hints.json. Refuses to overwrite an existing folder. */
export function addLanguage(opts: AddLanguageOptions): AddLanguageResult {
  const { id, extensions, aliasOf, dir } = opts;
  const grammar = opts.grammar ?? `tree-sitter-${id}.wasm`;
  const folder = join(dir, id);
  if (existsSync(folder)) {
    throw new Error(`Language folder already exists: ${folder} (refusing to overwrite)`);
  }
  mkdirSync(folder, { recursive: true });
  const created: string[] = [];

  const manifest: Record<string, unknown> = { id, extensions, grammar };
  if (aliasOf) manifest.aliasOf = aliasOf;
  const manifestPath = join(folder, "lang.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  created.push(manifestPath);

  // aliasOf languages reuse the aliased language's query + layer hints.
  if (!aliasOf) {
    const scmPath = join(folder, "extract.scm");
    writeFileSync(scmPath, SCM_STUB.replace(/<id>/g, id));
    created.push(scmPath);
    const hintsPath = join(folder, "layer-hints.json");
    writeFileSync(hintsPath, "{}\n");
    created.push(hintsPath);
  }
  return { folder, created };
}
