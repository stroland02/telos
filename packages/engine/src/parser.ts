import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { LANGUAGE_GRAMMAR } from "./languages/registry.js";

const GRAMMARS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "grammars");

// web-tree-sitter is a CJS module. Use createRequire for reliable interop
// across both native Node ESM and Vitest's transform environments.
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TreeSitter: any = require("web-tree-sitter");

export type TSTree = ReturnType<InstanceType<typeof TreeSitter>["parse"]>;

export class Parser {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private constructor(
    private readonly parser: any,
    private readonly languages: Map<string, unknown>,
  ) {}

  static async create(): Promise<Parser> {
    await TreeSitter.init({
      locateFile: () => join(GRAMMARS_DIR, "tree-sitter.wasm"),
    });
    const parser = new TreeSitter();
    const languages = new Map<string, unknown>();
    // Deduplicate by wasm filename so each grammar is only loaded once
    const loaded = new Map<string, unknown>();
    for (const [id, wasm] of Object.entries(LANGUAGE_GRAMMAR)) {
      if (!loaded.has(wasm)) {
        loaded.set(wasm, await TreeSitter.Language.load(join(GRAMMARS_DIR, wasm)));
      }
      languages.set(id, loaded.get(wasm));
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
