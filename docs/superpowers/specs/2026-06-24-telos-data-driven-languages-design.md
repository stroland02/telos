# Data-Driven Language Registry + `telos add-language` — Design Spec

**Date:** 2026-06-24
**Status:** Approved (design confirmed by user)
**Author:** Sebastian Roland + Claude

---

## 1. Summary

Make adding a language a **data change, not a code change** — the original v1
invariant (§6 of the v1 spec) that the current implementation only partly meets.
Today `packages/engine/src/languages/registry.ts` hand-codes three maps
(`EXTENSION_LANGUAGE`, `LANGUAGE_GRAMMAR`, and a JS→TS special case in
`extractQueryPath`). This spec replaces those hand-edits with **per-folder
`lang.json` manifests the registry auto-discovers**, and adds a
`telos add-language` command that scaffolds a complete, discoverable language
folder.

## 2. Goals / Non-Goals

**Goals**
- A new language is added by dropping a `languages/<id>/` folder (manifest +
  query + grammar) — no edits to `registry.ts` or any other code.
- `telos add-language <id>` scaffolds that folder so the on-ramp is one command.
- **Behavior-preserving** for the 3 shipped languages: all existing engine tests
  (walker, parser, extractor, resolver, golden, scan) stay green unchanged.

**Non-Goals**
- Bundling real grammars / authoring `extract.scm` for new languages (per-language
  follow-up work).
- Async/dynamic language loading — discovery is a one-time sync read at module load.
- Changing the universal schema, resolver, or any stage downstream of extraction.

## 3. The manifest

Each `packages/engine/languages/<id>/` folder gains `lang.json`:

```jsonc
{
  "id": "typescript",              // language id (label)
  "extensions": [".ts", ".tsx"],   // file extensions that map to this language
  "grammar": "tree-sitter-typescript.wasm", // wasm under packages/engine/grammars/
  "aliasOf": "python"              // OPTIONAL — reuse another language's extract.scm
}
```

`aliasOf` generalizes the current `javascript → typescript` special case: an
aliased language loads its own grammar (by `grammar`) but reads the *aliased*
language's `extract.scm` and `layer-hints.json`.

### Manifests shipped by this change

```jsonc
// languages/typescript/lang.json
{ "id": "typescript", "extensions": [".ts", ".tsx"], "grammar": "tree-sitter-typescript.wasm" }

// languages/javascript/lang.json   (NEW folder; aliases typescript)
{ "id": "javascript", "extensions": [".js", ".jsx", ".mjs", ".cjs"],
  "grammar": "tree-sitter-typescript.wasm", "aliasOf": "typescript" }

// languages/python/lang.json
{ "id": "python", "extensions": [".py"], "grammar": "tree-sitter-python.wasm" }
```

The new `languages/javascript/` folder contains **only** `lang.json` (no
`extract.scm` / `layer-hints.json` — it aliases typescript for those).

## 4. Discovery (`registry.ts` rewrite)

New internal type + function; the **public exports keep their exact current
shapes** so the 4 consumers (`walker.ts`, `parser.ts`, `resolver.ts`,
`extractor.ts`) need no changes:

```ts
export interface LangManifest {
  id: string;
  extensions: string[];
  grammar: string;
  aliasOf?: string;
}

// Reads every languages/*/lang.json once (sync). Skips folders without a
// manifest. Throws a clear error on malformed JSON or missing required fields.
export function discoverLanguages(): LangManifest[];

// Built from the manifests at module load — same types as today:
export const LANGUAGE_MANIFESTS: Record<string, LangManifest>; // id -> manifest
export const EXTENSION_LANGUAGE: Record<string, string>;       // ext -> id
export const LANGUAGE_GRAMMAR: Record<string, string>;         // id -> wasm
export const SUPPORTED_EXTENSIONS: string[];

// Resolves aliasOf: returns languages/<aliasOf ?? id>/extract.scm
export function extractQueryPath(language: string): string;
```

`resolver.ts` already derives `layer-hints.json` from
`dirname(extractQueryPath(language))`, so alias resolution flows through for
free.

**Error handling:** a folder with no `lang.json` is silently skipped (lets
`add-language` create the folder before the manifest is finalized without
breaking discovery). A *present but malformed* `lang.json` throws with the
offending path — never silently dropped (no fabricated/partial registry).

## 5. `telos add-language`

```
telos add-language <id> --ext .foo[,.bar] [--grammar tree-sitter-foo.wasm] [--alias-of <id>]
```

- Creates `packages/engine/languages/<id>/` with:
  - `lang.json` (from the flags; `grammar` defaults to `tree-sitter-<id>.wasm`),
  - `extract.scm` — a commented stub explaining the universal kinds to map
    (skipped when `--alias-of` is given, since the alias supplies the query),
  - `layer-hints.json` — `{}` (skipped when `--alias-of` is given).
- **Refuses** if the folder already exists (exit non-zero, clear message) — never
  clobbers an authored language.
- Prints the remaining manual steps: drop `<grammar>` into
  `packages/engine/grammars/`, fill in `extract.scm`, re-scan.

The command writes into the **engine package's** `languages/` dir (resolved
relative to the engine, not cwd) so it works the same in-repo and when Telos is
installed. A `--dir` override keeps it testable against a temp dir.

## 6. Testing

- **Manifest discovery:** `discoverLanguages()` returns the 3 shipped languages;
  malformed `lang.json` throws with the path; a folder without a manifest is
  skipped.
- **Built maps:** `EXTENSION_LANGUAGE[".tsx"] === "typescript"`,
  `[".js"] === "javascript"`, `[".py"] === "python"`; `extractQueryPath("javascript")`
  ends with `languages/typescript/extract.scm`.
- **Behavior-preserving:** the existing walker/parser/extractor/resolver/golden/
  scan suites pass unchanged (the real regression guard).
- **Scaffold:** `add-language` against a temp `--dir` creates the folder +
  `lang.json` + stub; refuses on a second call; `--alias-of` omits the `.scm`.

## 7. File structure

- Create: `packages/engine/languages/{typescript,javascript,python}/lang.json`
- Modify: `packages/engine/src/languages/registry.ts` (discovery rewrite)
- Create: `packages/engine/src/languages/registry.test.ts`
- Create: `packages/cli/src/add-language.ts` (scaffold logic) + test
- Modify: `packages/cli/src/main.ts` (register `add-language` command)
- Modify: `packages/engine/src/index.ts` (export `discoverLanguages`,
  `LangManifest`, `LANGUAGE_MANIFESTS` for the CLI/scaffold)
