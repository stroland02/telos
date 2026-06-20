# Telos Engine Core — Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `telos scan <repo>` — a CLI that parses any codebase into a universal architecture graph stored in SQLite, proven on TypeScript/JavaScript and Python.

**Architecture:** A language-agnostic pipeline — Walker (find files) → Parser (tree-sitter WASM → AST) → Extractor (per-language `.scm` query → universal nodes/edges) → Resolver (cross-file edges + heuristic layers) → Store (SQLite + FTS5). Stages 1, 2, 4, 5 never branch on language; only the Extractor's per-language data files are language-specific. Adding a language is a data change (one folder under `languages/`), not a code change.

**Tech Stack:** Node 20+, TypeScript (ESM), pnpm workspace, `web-tree-sitter` (WASM grammars), `tree-sitter-language-pack`-sourced `.wasm` files, `better-sqlite3` + FTS5, `fast-glob`, `ignore`, Vitest.

## Global Constraints

- **Language:** TypeScript, ESM modules (`"type": "module"`), Node ≥ 20.
- **Package manager:** pnpm workspace; this plan builds `packages/engine` and `packages/cli`.
- **No language branching in core:** stages Walker/Parser/Resolver/Store MUST NOT contain `if language === 'python'`-style logic. Language specifics live only in `languages/<lang>/`.
- **Universal schema is the only contract** between stages — defined once in `schema.ts`, imported everywhere.
- **TDD:** every task writes the failing test first. Vitest. Test files end in `.test.ts`.
- **Edges are honest:** when a target cannot be confidently resolved, set `resolved: false`. Never fabricate a target id.
- **Artifacts path:** the graph DB is written to `<repo>/.telos/graph.db`.
- **Frequent commits:** one commit per task, conventional-commit style.

---

### Task 1: Monorepo scaffold + universal schema

**Files:**
- Create: `package.json` (workspace root)
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `packages/engine/package.json`
- Create: `packages/engine/tsconfig.json`
- Create: `packages/engine/vitest.config.ts`
- Create: `packages/engine/src/schema.ts`
- Test: `packages/engine/src/schema.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the universal types every later task imports —
  `NodeKind`, `Layer`, `EdgeKind`, `TelosNode`, `TelosEdge`, `TelosGraph`,
  and `createNodeId(path: string, qualifiedName: string): string`.

- [ ] **Step 1: Create the workspace root files**

`pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
```

`package.json` (root):
```json
{
  "name": "telos",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 2: Create the engine package files**

`packages/engine/package.json`:
```json
{
  "name": "@telos/engine",
  "version": "0.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "fast-glob": "^3.3.0",
    "ignore": "^5.3.0",
    "web-tree-sitter": "^0.22.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

`packages/engine/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

`packages/engine/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { globals: false, environment: "node" } });
```

- [ ] **Step 3: Write the failing test for the schema**

`packages/engine/src/schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createNodeId } from "./schema.js";

describe("createNodeId", () => {
  it("is deterministic for the same inputs", () => {
    expect(createNodeId("src/a.ts", "foo")).toBe(createNodeId("src/a.ts", "foo"));
  });
  it("differs when path or qualified name differs", () => {
    expect(createNodeId("src/a.ts", "foo")).not.toBe(createNodeId("src/b.ts", "foo"));
    expect(createNodeId("src/a.ts", "foo")).not.toBe(createNodeId("src/a.ts", "bar"));
  });
  it("returns a 40-char hex sha1", () => {
    expect(createNodeId("src/a.ts", "foo")).toMatch(/^[0-9a-f]{40}$/);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd packages/engine && pnpm install && pnpm vitest run src/schema.test.ts`
Expected: FAIL — cannot resolve `./schema.js` / `createNodeId is not a function`.

- [ ] **Step 5: Write the schema**

`packages/engine/src/schema.ts`:
```ts
import { createHash } from "node:crypto";

export type NodeKind =
  | "module" | "file" | "class" | "function" | "method" | "interface" | "variable";

export type Layer = "api" | "service" | "data" | "ui" | "infra" | "util" | "unknown";

export type EdgeKind =
  | "calls" | "imports" | "inherits" | "implements" | "contains" | "references";

export interface TelosNode {
  id: string;
  kind: NodeKind;
  name: string;
  qualifiedName: string;
  language: string;
  path: string;
  lineStart: number;
  lineEnd: number;
  layer: Layer;
  fanIn: number;
  fanOut: number;
  lines: number;
  complexity: number;
  summary: string | null; // reserved for Phase 3 LLM enrichment
}

export interface TelosEdge {
  sourceId: string;
  targetId: string;
  kind: EdgeKind;
  resolved: boolean;
}

export interface TelosGraph {
  nodes: TelosNode[];
  edges: TelosEdge[];
}

export function createNodeId(path: string, qualifiedName: string): string {
  return createHash("sha1").update(`${path}::${qualifiedName}`).digest("hex");
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd packages/engine && pnpm vitest run src/schema.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json packages/engine
git commit -m "feat(engine): scaffold workspace and universal graph schema"
```

---

### Task 2: Walker — discover source files, respect .gitignore, detect language

**Files:**
- Create: `packages/engine/src/languages/registry.ts`
- Create: `packages/engine/src/walker.ts`
- Test: `packages/engine/src/walker.test.ts`
- Test fixtures: `packages/engine/fixtures/walker-sample/` (a few files)

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces:
  - `detectLanguage(filePath: string): string | null` (extension → language id, else null).
  - `walk(root: string): Promise<DiscoveredFile[]>` where
    `interface DiscoveredFile { path: string; language: string }` (absolute `path`).

- [ ] **Step 1: Create the language→extension registry**

`packages/engine/src/languages/registry.ts`:
```ts
// Extension → language id. Single source of truth for detection.
export const EXTENSION_LANGUAGE: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript",
  ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
  ".py": "python",
};

export const SUPPORTED_EXTENSIONS = Object.keys(EXTENSION_LANGUAGE);
```

- [ ] **Step 2: Write the failing test**

Create fixtures: `packages/engine/fixtures/walker-sample/a.ts` (`export const a = 1;`),
`packages/engine/fixtures/walker-sample/b.py` (`x = 1`),
`packages/engine/fixtures/walker-sample/ignore_me.log` (`noise`),
`packages/engine/fixtures/walker-sample/.gitignore` (`*.log`).

`packages/engine/src/walker.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { detectLanguage, walk } from "./walker.js";

const here = dirname(fileURLToPath(import.meta.url));
const sample = resolve(here, "../fixtures/walker-sample");

describe("detectLanguage", () => {
  it("maps known extensions", () => {
    expect(detectLanguage("x.ts")).toBe("typescript");
    expect(detectLanguage("x.py")).toBe("python");
  });
  it("returns null for unknown extensions", () => {
    expect(detectLanguage("x.log")).toBeNull();
  });
});

describe("walk", () => {
  it("finds source files and honors .gitignore", async () => {
    const files = await walk(sample);
    const names = files.map((f) => f.path.replace(/\\/g, "/").split("/").pop()).sort();
    expect(names).toEqual(["a.ts", "b.py"]);
    expect(files.find((f) => f.path.endsWith("a.ts"))?.language).toBe("typescript");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/engine && pnpm vitest run src/walker.test.ts`
Expected: FAIL — `walk` / `detectLanguage` not defined.

- [ ] **Step 4: Implement the walker**

`packages/engine/src/walker.ts`:
```ts
import { extname, join, relative } from "node:path";
import { readFile, stat } from "node:fs/promises";
import fg from "fast-glob";
import ignore from "ignore";
import { EXTENSION_LANGUAGE } from "./languages/registry.js";

export interface DiscoveredFile { path: string; language: string }

const ALWAYS_IGNORE = ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/.telos/**"];
const MAX_BYTES = 1_000_000;

export function detectLanguage(filePath: string): string | null {
  return EXTENSION_LANGUAGE[extname(filePath).toLowerCase()] ?? null;
}

async function loadGitignore(root: string) {
  const ig = ignore();
  try { ig.add(await readFile(join(root, ".gitignore"), "utf8")); } catch { /* none */ }
  return ig;
}

export async function walk(root: string): Promise<DiscoveredFile[]> {
  const ig = await loadGitignore(root);
  const all = await fg("**/*", { cwd: root, absolute: true, dot: false, ignore: ALWAYS_IGNORE, onlyFiles: true });
  const out: DiscoveredFile[] = [];
  for (const abs of all) {
    const rel = relative(root, abs).replace(/\\/g, "/");
    if (ig.ignores(rel)) continue;
    const language = detectLanguage(abs);
    if (!language) continue;
    if ((await stat(abs)).size > MAX_BYTES) continue;
    out.push({ path: abs, language });
  }
  return out;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/engine && pnpm vitest run src/walker.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/walker.ts packages/engine/src/languages/registry.ts packages/engine/src/walker.test.ts packages/engine/fixtures/walker-sample
git commit -m "feat(engine): walker discovers source files and honors .gitignore"
```

---

### Task 3: Parser — load tree-sitter WASM grammar and parse to AST

**Files:**
- Create: `packages/engine/src/parser.ts`
- Modify: `packages/engine/src/languages/registry.ts` (add grammar wasm paths)
- Test: `packages/engine/src/parser.test.ts`
- Asset: `packages/engine/grammars/tree-sitter-typescript.wasm`, `tree-sitter-python.wasm`, and the core `tree-sitter.wasm`

**Interfaces:**
- Consumes: `detectLanguage` / language ids from Task 2.
- Produces:
  - `class Parser { static create(): Promise<Parser>; parse(source: string, language: string): TSTree }`
    where `TSTree` is `web-tree-sitter`'s `Tree`. Throws if the language has no grammar.

- [ ] **Step 1: Obtain grammar WASM files**

Run (downloads prebuilt grammars; pin versions to match `web-tree-sitter`):
```bash
cd packages/engine && mkdir -p grammars
node -e "const fs=require('fs');const p=require.resolve('web-tree-sitter');fs.copyFileSync(p.replace(/tree-sitter\.js$/,'tree-sitter.wasm'),'grammars/tree-sitter.wasm')"
# Download language grammars (pin the tag in real use):
curl -L -o grammars/tree-sitter-typescript.wasm https://github.com/tree-sitter/tree-sitter-typescript/releases/latest/download/tree-sitter-typescript.wasm
curl -L -o grammars/tree-sitter-python.wasm https://github.com/tree-sitter/tree-sitter-python/releases/latest/download/tree-sitter-python.wasm
```
If a release asset is unavailable, generate with `npx tree-sitter build --wasm` against the grammar repo. Commit the `.wasm` files into `grammars/`.

- [ ] **Step 2: Add grammar paths to the registry**

Append to `packages/engine/src/languages/registry.ts`:
```ts
// Language id → grammar wasm filename (under packages/engine/grammars/).
export const LANGUAGE_GRAMMAR: Record<string, string> = {
  typescript: "tree-sitter-typescript.wasm",
  javascript: "tree-sitter-typescript.wasm", // TS grammar parses JS
  python: "tree-sitter-python.wasm",
};
```

- [ ] **Step 3: Write the failing test**

`packages/engine/src/parser.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { Parser } from "./parser.js";

let parser: Parser;
beforeAll(async () => { parser = await Parser.create(); });

describe("Parser", () => {
  it("parses TypeScript into a syntax tree", () => {
    const tree = parser.parse("function foo() { return 1; }", "typescript");
    expect(tree.rootNode.type).toBe("program");
    expect(tree.rootNode.descendantsOfType("function_declaration").length).toBe(1);
  });
  it("parses Python", () => {
    const tree = parser.parse("def foo():\n    return 1\n", "python");
    expect(tree.rootNode.descendantsOfType("function_definition").length).toBe(1);
  });
  it("throws on an unknown language", () => {
    expect(() => parser.parse("x", "cobol")).toThrow(/no grammar/i);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd packages/engine && pnpm vitest run src/parser.test.ts`
Expected: FAIL — `Parser` not defined.

- [ ] **Step 5: Implement the parser**

`packages/engine/src/parser.ts`:
```ts
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import TreeSitter from "web-tree-sitter";
import { LANGUAGE_GRAMMAR } from "./languages/registry.js";

const GRAMMARS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "grammars");
type TSTree = TreeSitter.Tree;

export class Parser {
  private constructor(
    private readonly parser: TreeSitter,
    private readonly languages: Map<string, TreeSitter.Language>,
  ) {}

  static async create(): Promise<Parser> {
    await TreeSitter.init({
      locateFile: () => join(GRAMMARS_DIR, "tree-sitter.wasm"),
    });
    const parser = new TreeSitter();
    const languages = new Map<string, TreeSitter.Language>();
    for (const [id, wasm] of Object.entries(LANGUAGE_GRAMMAR)) {
      if (!languages.has(id)) {
        languages.set(id, await TreeSitter.Language.load(join(GRAMMARS_DIR, wasm)));
      }
    }
    return new Parser(parser, languages);
  }

  parse(source: string, language: string): TSTree {
    const lang = this.languages.get(language);
    if (!lang) throw new Error(`no grammar for language: ${language}`);
    this.parser.setLanguage(lang);
    return this.parser.parse(source);
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd packages/engine && pnpm vitest run src/parser.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/parser.ts packages/engine/src/languages/registry.ts packages/engine/src/parser.test.ts packages/engine/grammars
git commit -m "feat(engine): tree-sitter WASM parser for TS/JS and Python"
```

---

### Task 4: Extractor — map AST to universal nodes/edges via per-language `.scm` queries

**Files:**
- Create: `packages/engine/languages/typescript/extract.scm`
- Create: `packages/engine/languages/python/extract.scm`
- Create: `packages/engine/src/extractor.ts`
- Modify: `packages/engine/src/languages/registry.ts` (resolve `.scm` path by language)
- Test: `packages/engine/src/extractor.test.ts`

**Interfaces:**
- Consumes: `Parser.parse` (Task 3); `TelosNode`, `TelosEdge`, `createNodeId` (Task 1).
- Produces:
  - `extractFile(args: { tree: TSTree; source: string; relPath: string; language: string }): { nodes: TelosNode[]; edges: TelosEdge[] }`
    Nodes for the file itself (`kind:"file"`) plus each captured definition; edges are
    `contains` (file→symbol) and intra/inter-file `calls` (left `resolved:false`, target id
    is a placeholder name-id resolved later in Task 5).

- [ ] **Step 1: Write the TypeScript query**

`packages/engine/languages/typescript/extract.scm`:
```scheme
(function_declaration name: (identifier) @function.name) @function.def
(class_declaration name: (type_identifier) @class.name) @class.def
(method_definition name: (property_identifier) @method.name) @method.def
(interface_declaration name: (type_identifier) @interface.name) @interface.def
(call_expression function: (identifier) @call.name) @call.site
(import_statement source: (string) @import.source) @import.site
```

- [ ] **Step 2: Write the Python query**

`packages/engine/languages/python/extract.scm`:
```scheme
(function_definition name: (identifier) @function.name) @function.def
(class_definition name: (identifier) @class.name) @class.def
(call (identifier) @call.name) @call.site
(import_from_statement module_name: (dotted_name) @import.source) @import.site
(import_statement name: (dotted_name) @import.source) @import.site
```

- [ ] **Step 3: Add `.scm` resolution to the registry**

Append to `packages/engine/src/languages/registry.ts`:
```ts
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const LANGS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "languages");
export function extractQueryPath(language: string): string {
  // javascript reuses the typescript query
  const dir = language === "javascript" ? "typescript" : language;
  return join(LANGS_DIR, dir, "extract.scm");
}
```

- [ ] **Step 4: Write the failing test**

`packages/engine/src/extractor.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { Parser } from "./parser.js";
import { extractFile } from "./extractor.js";

let parser: Parser;
beforeAll(async () => { parser = await Parser.create(); });

describe("extractFile (TypeScript)", () => {
  it("extracts a file node, a function node, and a contains edge", () => {
    const source = "function foo() { bar(); }";
    const tree = parser.parse(source, "typescript");
    const { nodes, edges } = extractFile({ tree, source, relPath: "src/a.ts", language: "typescript" });
    const kinds = nodes.map((n) => n.kind).sort();
    expect(kinds).toContain("file");
    expect(kinds).toContain("function");
    expect(nodes.find((n) => n.kind === "function")?.name).toBe("foo");
    expect(edges.some((e) => e.kind === "contains")).toBe(true);
    // intra-file call recorded but not yet resolved
    expect(edges.some((e) => e.kind === "calls" && e.resolved === false)).toBe(true);
  });
});

describe("extractFile (Python)", () => {
  it("extracts a python function node", () => {
    const source = "def foo():\n    bar()\n";
    const tree = parser.parse(source, "python");
    const { nodes } = extractFile({ tree, source, relPath: "src/a.py", language: "python" });
    expect(nodes.find((n) => n.kind === "function")?.name).toBe("foo");
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `cd packages/engine && pnpm vitest run src/extractor.test.ts`
Expected: FAIL — `extractFile` not defined.

- [ ] **Step 6: Implement the extractor**

`packages/engine/src/extractor.ts`:
```ts
import { readFileSync } from "node:fs";
import type TreeSitter from "web-tree-sitter";
import { TelosNode, TelosEdge, NodeKind, createNodeId } from "./schema.js";
import { extractQueryPath } from "./languages/registry.js";

type TSTree = TreeSitter.Tree;
const queryCache = new Map<string, string>();
function querySource(language: string): string {
  if (!queryCache.has(language)) queryCache.set(language, readFileSync(extractQueryPath(language), "utf8"));
  return queryCache.get(language)!;
}

const CAPTURE_KIND: Record<string, NodeKind> = {
  "function.name": "function", "class.name": "class",
  "method.name": "method", "interface.name": "interface",
};

function baseNode(kind: NodeKind, name: string, relPath: string, language: string,
                  node: TreeSitter.SyntaxNode): TelosNode {
  const qualifiedName = kind === "file" ? relPath : `${relPath}:${name}`;
  return {
    id: createNodeId(relPath, qualifiedName),
    kind, name, qualifiedName, language, path: relPath,
    lineStart: node.startPosition.row + 1, lineEnd: node.endPosition.row + 1,
    layer: "unknown", fanIn: 0, fanOut: 0,
    lines: node.endPosition.row - node.startPosition.row + 1,
    complexity: 0, summary: null,
  };
}

export function extractFile(args: {
  tree: TSTree; source: string; relPath: string; language: string;
}): { nodes: TelosNode[]; edges: TelosEdge[] } {
  const { tree, relPath, language } = args;
  const root = tree.rootNode;
  const fileNode = baseNode("file", relPath, relPath, language, root);
  const nodes: TelosNode[] = [fileNode];
  const edges: TelosEdge[] = [];

  const lang = (tree as any).getLanguage() as TreeSitter.Language;
  const query = lang.query(querySource(language));
  for (const m of query.matches(root)) {
    for (const cap of m.captures) {
      const kind = CAPTURE_KIND[cap.name];
      if (kind) {
        const symbol = baseNode(kind, cap.node.text, relPath, language, cap.node);
        nodes.push(symbol);
        edges.push({ sourceId: fileNode.id, targetId: symbol.id, kind: "contains", resolved: true });
      } else if (cap.name === "call.name") {
        // Unresolved intra/inter-file call; Resolver (Task 5) binds target by name.
        edges.push({
          sourceId: fileNode.id,
          targetId: createNodeId("?", cap.node.text), // placeholder name-id
          kind: "calls", resolved: false,
        });
      }
    }
  }
  return { nodes, edges };
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd packages/engine && pnpm vitest run src/extractor.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/languages packages/engine/src/extractor.ts packages/engine/src/languages/registry.ts packages/engine/src/extractor.test.ts
git commit -m "feat(engine): universal extractor with TS and Python .scm mappings"
```

---

### Task 5: Resolver — bind call edges and assign heuristic layers

**Files:**
- Create: `packages/engine/languages/typescript/layer-hints.json`
- Create: `packages/engine/languages/python/layer-hints.json`
- Create: `packages/engine/src/resolver.ts`
- Test: `packages/engine/src/resolver.test.ts`

**Interfaces:**
- Consumes: `TelosGraph`, `TelosNode`, `TelosEdge`, `createNodeId` (Task 1); raw nodes/edges from Task 4.
- Produces:
  - `resolveGraph(graph: TelosGraph): TelosGraph` — binds unresolved `calls` edges to a
    definition node when exactly one symbol of that name exists (else drops the edge);
    assigns `layer` per node from path/name hints; recomputes `fanIn`/`fanOut`.

- [ ] **Step 1: Write the layer hint files**

`packages/engine/languages/typescript/layer-hints.json`:
```json
{
  "rules": [
    { "match": "/(controllers|routes|api)/", "layer": "api" },
    { "match": "Service$", "layer": "service" },
    { "match": "/(models|repositories|entities)/", "layer": "data" },
    { "match": "\\.tsx$|/components/", "layer": "ui" },
    { "match": "/(utils|helpers|lib)/", "layer": "util" }
  ]
}
```

`packages/engine/languages/python/layer-hints.json`:
```json
{
  "rules": [
    { "match": "/(views|api|routers)/|views\\.py$", "layer": "api" },
    { "match": "service", "layer": "service" },
    { "match": "/(models|repositories)/|models\\.py$", "layer": "data" },
    { "match": "/(utils|helpers)/", "layer": "util" }
  ]
}
```

- [ ] **Step 2: Write the failing test**

`packages/engine/src/resolver.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolveGraph } from "./resolver.js";
import { TelosGraph, createNodeId } from "./schema.js";

function fn(path: string, name: string) {
  const q = `${path}:${name}`;
  return { id: createNodeId(path, q), kind: "function" as const, name, qualifiedName: q,
    language: "typescript", path, lineStart: 1, lineEnd: 2, layer: "unknown" as const,
    fanIn: 0, fanOut: 0, lines: 2, complexity: 0, summary: null };
}

describe("resolveGraph", () => {
  it("binds a call edge to a unique definition and counts fan-in/out", () => {
    const foo = fn("src/a.ts", "foo");
    const bar = fn("src/b.ts", "bar");
    const graph: TelosGraph = {
      nodes: [foo, bar],
      edges: [{ sourceId: foo.id, targetId: createNodeId("?", "bar"), kind: "calls", resolved: false }],
    };
    const out = resolveGraph(graph);
    const edge = out.edges.find((e) => e.kind === "calls")!;
    expect(edge.resolved).toBe(true);
    expect(edge.targetId).toBe(bar.id);
    expect(out.nodes.find((n) => n.id === bar.id)?.fanIn).toBe(1);
    expect(out.nodes.find((n) => n.id === foo.id)?.fanOut).toBe(1);
  });

  it("assigns layers from path hints", () => {
    const ctrl = fn("src/controllers/user.ts", "list");
    const out = resolveGraph({ nodes: [ctrl], edges: [] });
    expect(out.nodes[0].layer).toBe("api");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/engine && pnpm vitest run src/resolver.test.ts`
Expected: FAIL — `resolveGraph` not defined.

- [ ] **Step 4: Implement the resolver**

`packages/engine/src/resolver.ts`:
```ts
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Layer, TelosEdge, TelosGraph, TelosNode, createNodeId } from "./schema.js";
import { extractQueryPath } from "./languages/registry.js";

interface LayerRule { match: string; layer: Layer }
const hintCache = new Map<string, LayerRule[]>();
function layerRules(language: string): LayerRule[] {
  if (!hintCache.has(language)) {
    const p = join(dirname(extractQueryPath(language)), "layer-hints.json");
    hintCache.set(language, existsSync(p) ? JSON.parse(readFileSync(p, "utf8")).rules : []);
  }
  return hintCache.get(language)!;
}

function assignLayer(node: TelosNode): Layer {
  for (const r of layerRules(node.language)) {
    if (new RegExp(r.match).test(node.path) || new RegExp(r.match).test(node.name)) return r.layer;
  }
  return "unknown";
}

const DEF_KINDS = new Set(["function", "method", "class"]);

export function resolveGraph(graph: TelosGraph): TelosGraph {
  const nodes = graph.nodes.map((n) => ({ ...n, layer: assignLayer(n), fanIn: 0, fanOut: 0 }));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // name → definition ids (only defs participate in call binding)
  const byName = new Map<string, string[]>();
  // placeholder name-id → name (to recover the call target name)
  const nameIdToName = new Map<string, string>();
  for (const n of nodes) {
    if (DEF_KINDS.has(n.kind)) {
      if (!byName.has(n.name)) byName.set(n.name, []);
      byName.get(n.name)!.push(n.id);
      nameIdToName.set(createNodeId("?", n.name), n.name);
    }
  }

  const edges: TelosEdge[] = [];
  for (const e of graph.edges) {
    if (e.kind === "calls" && !e.resolved) {
      const name = nameIdToName.get(e.targetId);
      const candidates = name ? byName.get(name) ?? [] : [];
      if (candidates.length === 1) edges.push({ ...e, targetId: candidates[0], resolved: true });
      continue; // drop unresolved/ambiguous calls
    }
    edges.push(e);
  }

  for (const e of edges) {
    const s = byId.get(e.sourceId); const t = byId.get(e.targetId);
    if (s) s.fanOut++;
    if (t) t.fanIn++;
  }
  return { nodes, edges };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/engine && pnpm vitest run src/resolver.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/languages packages/engine/src/resolver.ts packages/engine/src/resolver.test.ts
git commit -m "feat(engine): resolver binds calls and assigns heuristic layers"
```

---

### Task 6: Graph store — persist to SQLite with FTS5

**Files:**
- Create: `packages/engine/src/store.ts`
- Test: `packages/engine/src/store.test.ts`

**Interfaces:**
- Consumes: `TelosGraph`, `TelosNode` (Task 1).
- Produces:
  - `class GraphStore { static open(dbPath: string): GraphStore; save(graph: TelosGraph): void; loadGraph(): TelosGraph; search(term: string): TelosNode[]; close(): void }`.

- [ ] **Step 1: Write the failing test**

`packages/engine/src/store.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { GraphStore } from "./store.js";
import { TelosGraph, createNodeId } from "./schema.js";

function sampleGraph(): TelosGraph {
  const a = createNodeId("a.ts", "a.ts:foo");
  return {
    nodes: [{ id: a, kind: "function", name: "foo", qualifiedName: "a.ts:foo",
      language: "typescript", path: "a.ts", lineStart: 1, lineEnd: 2, layer: "service",
      fanIn: 0, fanOut: 0, lines: 2, complexity: 0, summary: null }],
    edges: [],
  };
}

describe("GraphStore", () => {
  it("round-trips a graph and supports FTS search", () => {
    const db = join(tmpdir(), `telos-${randomUUID()}.db`);
    const store = GraphStore.open(db);
    store.save(sampleGraph());
    expect(store.loadGraph().nodes).toHaveLength(1);
    expect(store.search("foo")[0].name).toBe("foo");
    store.close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/engine && pnpm vitest run src/store.test.ts`
Expected: FAIL — `GraphStore` not defined.

- [ ] **Step 3: Implement the store**

`packages/engine/src/store.ts`:
```ts
import Database from "better-sqlite3";
import { TelosGraph, TelosNode, TelosEdge, NodeKind, Layer, EdgeKind } from "./schema.js";

export class GraphStore {
  private constructor(private readonly db: Database.Database) {}

  static open(dbPath: string): GraphStore {
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY, kind TEXT, name TEXT, qualified_name TEXT, language TEXT,
        path TEXT, line_start INTEGER, line_end INTEGER, layer TEXT,
        fan_in INTEGER, fan_out INTEGER, lines INTEGER, complexity INTEGER, summary TEXT
      );
      CREATE TABLE IF NOT EXISTS edges (
        source_id TEXT, target_id TEXT, kind TEXT, resolved INTEGER
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(id UNINDEXED, name, qualified_name);
    `);
    return new GraphStore(db);
  }

  save(graph: TelosGraph): void {
    const tx = this.db.transaction((g: TelosGraph) => {
      this.db.prepare("DELETE FROM nodes").run();
      this.db.prepare("DELETE FROM edges").run();
      this.db.prepare("DELETE FROM nodes_fts").run();
      const ins = this.db.prepare(`INSERT INTO nodes VALUES
        (@id,@kind,@name,@qualifiedName,@language,@path,@lineStart,@lineEnd,@layer,@fanIn,@fanOut,@lines,@complexity,@summary)`);
      const fts = this.db.prepare("INSERT INTO nodes_fts (id,name,qualified_name) VALUES (?,?,?)");
      for (const n of g.nodes) { ins.run(n); fts.run(n.id, n.name, n.qualifiedName); }
      const ie = this.db.prepare("INSERT INTO edges VALUES (?,?,?,?)");
      for (const e of g.edges) ie.run(e.sourceId, e.targetId, e.kind, e.resolved ? 1 : 0);
    });
    tx(graph);
  }

  loadGraph(): TelosGraph {
    const nodes = (this.db.prepare("SELECT * FROM nodes").all() as any[]).map(rowToNode);
    const edges = (this.db.prepare("SELECT * FROM edges").all() as any[]).map((r): TelosEdge => ({
      sourceId: r.source_id, targetId: r.target_id, kind: r.kind as EdgeKind, resolved: !!r.resolved,
    }));
    return { nodes, edges };
  }

  search(term: string): TelosNode[] {
    const ids = (this.db.prepare("SELECT id FROM nodes_fts WHERE nodes_fts MATCH ?").all(`${term}*`) as any[])
      .map((r) => r.id);
    if (ids.length === 0) return [];
    const ph = ids.map(() => "?").join(",");
    return (this.db.prepare(`SELECT * FROM nodes WHERE id IN (${ph})`).all(...ids) as any[]).map(rowToNode);
  }

  close(): void { this.db.close(); }
}

function rowToNode(r: any): TelosNode {
  return {
    id: r.id, kind: r.kind as NodeKind, name: r.name, qualifiedName: r.qualified_name,
    language: r.language, path: r.path, lineStart: r.line_start, lineEnd: r.line_end,
    layer: r.layer as Layer, fanIn: r.fan_in, fanOut: r.fan_out, lines: r.lines,
    complexity: r.complexity, summary: r.summary,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/engine && pnpm vitest run src/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/store.ts packages/engine/src/store.test.ts
git commit -m "feat(engine): SQLite graph store with FTS5 search"
```

---

### Task 7: Pipeline orchestrator + `scan` entry point

**Files:**
- Create: `packages/engine/src/pipeline.ts`
- Create: `packages/engine/src/index.ts` (public exports)
- Test: `packages/engine/src/pipeline.test.ts`
- Test fixture: `packages/engine/fixtures/scan-sample/` (a 2-file TS+Py mini repo)

**Interfaces:**
- Consumes: `walk` (T2), `Parser` (T3), `extractFile` (T4), `resolveGraph` (T5), `GraphStore` (T6).
- Produces:
  - `scan(repoRoot: string): Promise<{ dbPath: string; graph: TelosGraph }>` — runs the full
    pipeline and writes `<repoRoot>/.telos/graph.db`.
  - `index.ts` re-exports `scan`, `GraphStore`, and all schema types.

- [ ] **Step 1: Create the scan fixture**

`packages/engine/fixtures/scan-sample/src/service/orderService.ts`:
```ts
export function processOrder() { saveOrder(); }
export function saveOrder() {}
```
`packages/engine/fixtures/scan-sample/app.py`:
```python
def main():
    helper()

def helper():
    pass
```

- [ ] **Step 2: Write the failing test**

`packages/engine/src/pipeline.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { rmSync } from "node:fs";
import { scan } from "./pipeline.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../fixtures/scan-sample");

describe("scan", () => {
  it("builds a graph with nodes from both languages and a resolved call", async () => {
    rmSync(resolve(repo, ".telos"), { recursive: true, force: true });
    const { graph } = await scan(repo);
    const langs = new Set(graph.nodes.map((n) => n.language));
    expect(langs.has("typescript")).toBe(true);
    expect(langs.has("python")).toBe(true);
    expect(graph.nodes.some((n) => n.name === "processOrder" && n.layer === "service")).toBe(true);
    expect(graph.edges.some((e) => e.kind === "calls" && e.resolved)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/engine && pnpm vitest run src/pipeline.test.ts`
Expected: FAIL — `scan` not defined.

- [ ] **Step 4: Implement the pipeline and index**

`packages/engine/src/pipeline.ts`:
```ts
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { walk } from "./walker.js";
import { Parser } from "./parser.js";
import { extractFile } from "./extractor.js";
import { resolveGraph } from "./resolver.js";
import { GraphStore } from "./store.js";
import { TelosGraph, TelosNode, TelosEdge } from "./schema.js";

export async function scan(repoRoot: string): Promise<{ dbPath: string; graph: TelosGraph }> {
  const files = await walk(repoRoot);
  const parser = await Parser.create();
  const nodes: TelosNode[] = []; const edges: TelosEdge[] = [];

  for (const f of files) {
    const source = await readFile(f.path, "utf8");
    const tree = parser.parse(source, f.language);
    const relPath = relative(repoRoot, f.path).replace(/\\/g, "/");
    const r = extractFile({ tree, source, relPath, language: f.language });
    nodes.push(...r.nodes); edges.push(...r.edges);
  }

  const graph = resolveGraph({ nodes, edges });
  const telosDir = join(repoRoot, ".telos");
  mkdirSync(telosDir, { recursive: true });
  const dbPath = join(telosDir, "graph.db");
  const store = GraphStore.open(dbPath);
  store.save(graph); store.close();
  return { dbPath, graph };
}
```

`packages/engine/src/index.ts`:
```ts
export { scan } from "./pipeline.js";
export { GraphStore } from "./store.js";
export * from "./schema.js";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/engine && pnpm vitest run src/pipeline.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `cd packages/engine && pnpm vitest run`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/pipeline.ts packages/engine/src/index.ts packages/engine/src/pipeline.test.ts packages/engine/fixtures/scan-sample
git commit -m "feat(engine): end-to-end scan pipeline writing graph.db"
```

---

### Task 8: Golden-file test harness (proves universal adaptivity)

**Files:**
- Create: `packages/engine/src/golden.test.ts`
- Create: `packages/engine/fixtures/golden/typescript/` and `.../python/` mini repos
- Create (generated on first run): `packages/engine/fixtures/golden/typescript.expected.json`, `python.expected.json`

**Interfaces:**
- Consumes: `scan` (Task 7).
- Produces: regression coverage; no new exports.

- [ ] **Step 1: Create per-language golden fixtures**

`packages/engine/fixtures/golden/typescript/index.ts`:
```ts
export class UserService { create() { return 1; } }
```
`packages/engine/fixtures/golden/python/mod.py`:
```python
class UserRepository:
    def get(self):
        return 1
```

- [ ] **Step 2: Write the golden test (snapshot of normalized node summary)**

`packages/engine/src/golden.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { scan } from "./pipeline.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../fixtures/golden");

function summarize(nodes: { kind: string; name: string; language: string }[]) {
  return nodes.map((n) => `${n.language}:${n.kind}:${n.name}`).sort();
}

for (const lang of ["typescript", "python"]) {
  describe(`golden: ${lang}`, () => {
    it("matches the checked-in node summary", async () => {
      const repo = resolve(root, lang);
      rmSync(resolve(repo, ".telos"), { recursive: true, force: true });
      const { graph } = await scan(repo);
      const actual = summarize(graph.nodes);
      const expectedPath = resolve(root, `${lang}.expected.json`);
      if (!existsSync(expectedPath)) writeFileSync(expectedPath, JSON.stringify(actual, null, 2));
      expect(actual).toEqual(JSON.parse(readFileSync(expectedPath, "utf8")));
    });
  });
}
```

- [ ] **Step 3: Generate then verify the golden files**

Run: `cd packages/engine && pnpm vitest run src/golden.test.ts` (first run writes the expected JSON).
Inspect each `*.expected.json` — confirm it lists the file node plus `UserService`/`create`
(TS) and `UserRepository`/`get` (Python). Run again:
Run: `cd packages/engine && pnpm vitest run src/golden.test.ts`
Expected: PASS against the committed snapshots.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/golden.test.ts packages/engine/fixtures/golden
git commit -m "test(engine): golden-file fixtures prove per-language extraction"
```

---

### Task 9: CLI `telos scan`

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/main.ts`
- Test: `packages/cli/src/main.test.ts`

**Interfaces:**
- Consumes: `scan` from `@telos/engine` (Task 7).
- Produces: a `telos` bin with `scan <path>` that prints node/edge counts and the db path.

- [ ] **Step 1: Create the CLI package**

`packages/cli/package.json`:
```json
{
  "name": "@telos/cli",
  "version": "0.0.0",
  "type": "module",
  "bin": { "telos": "dist/main.js" },
  "scripts": { "build": "tsc -p tsconfig.json", "test": "vitest run" },
  "dependencies": { "@telos/engine": "workspace:*", "commander": "^12.0.0" },
  "devDependencies": { "@types/node": "^20.0.0", "typescript": "^5.4.0", "vitest": "^1.6.0" }
}
```
`packages/cli/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" }, "include": ["src"] }
```

- [ ] **Step 2: Write the failing test**

`packages/cli/src/main.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { runScan } from "./main.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../engine/fixtures/scan-sample");

describe("runScan", () => {
  it("returns a summary with positive node count", async () => {
    const summary = await runScan(repo);
    expect(summary.nodeCount).toBeGreaterThan(0);
    expect(summary.dbPath).toMatch(/graph\.db$/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/cli && pnpm install && pnpm vitest run`
Expected: FAIL — `runScan` not defined.

- [ ] **Step 4: Implement the CLI**

`packages/cli/src/main.ts`:
```ts
import { Command } from "commander";
import { resolve } from "node:path";
import { scan } from "@telos/engine";

export async function runScan(path: string): Promise<{ nodeCount: number; edgeCount: number; dbPath: string }> {
  const { dbPath, graph } = await scan(resolve(path));
  return { nodeCount: graph.nodes.length, edgeCount: graph.edges.length, dbPath };
}

export function buildProgram(): Command {
  const program = new Command();
  program.name("telos").description("Telos, the Code Sentinel");
  program.command("scan <path>").description("Scan a codebase into a graph")
    .action(async (path: string) => {
      const s = await runScan(path);
      console.log(`Telos: ${s.nodeCount} nodes, ${s.edgeCount} edges -> ${s.dbPath}`);
    });
  return program;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildProgram().parseAsync(process.argv);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/cli && pnpm vitest run`
Expected: PASS.

- [ ] **Step 6: Build and smoke-test the real CLI**

Run:
```bash
cd packages/engine && pnpm build && cd ../cli && pnpm build
node dist/main.js scan ../engine/fixtures/scan-sample
```
Expected: prints `Telos: N nodes, M edges -> .../.telos/graph.db` with N > 0.

- [ ] **Step 7: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): telos scan command over the engine pipeline"
```

---

## Self-Review Notes

- **Spec coverage:** Walker/Parser/Extractor/Resolver/Store/CLI (spec §3 stages 1–5 and 8-partial entry) ✅; universal schema (spec §4) ✅; extensibility contract — `languages/<lang>/{extract.scm,layer-hints.json}` auto-discovered (spec §6) ✅; golden-file tests (spec §7) ✅; heuristic layers (spec §4) ✅. **Deferred to Plan 2/3:** Aggregator (§3 stage 6), API server (stage 7), Web UI (stage 8), file watcher/incremental re-index (§3) — these are the next plans and are explicitly out of scope here.
- **Resolution honesty:** ambiguous/unknown calls are dropped rather than mis-bound; `resolved` flag preserved (spec global constraint) ✅.
- **Type consistency:** `scan`, `resolveGraph`, `extractFile`, `GraphStore`, `createNodeId`, `TelosNode/Edge/Graph` names and signatures match across all tasks ✅.
- **Known simplification:** the placeholder call-target encoding (`createNodeId("?", name)`) + name-id reverse map is intentionally simple for v1 (resolves only unambiguous global names). Plan 2 upgrades to import-scope-aware resolution. Flagged, not hidden.
- **web-tree-sitter API note:** if the installed `web-tree-sitter` major version renames `getLanguage()`/`Language.load`, adjust Task 3/4 to the version's API; the test in Task 3 will catch a mismatch immediately.
