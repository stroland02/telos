import tseslint from "typescript-eslint";

// Flat config. Non-type-checked typescript-eslint preset: fast, no project
// wiring, good enough to catch real mistakes without gating on a type-aware
// pass. Tighten to the type-checked preset later if the gate proves too loose.
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.telos/**",
      "**/*.wasm",
      "**/grammars/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Young codebase: keep these visible as warnings (CI fails only on errors)
      // rather than blocking every merge on cleanup that isn't a correctness bug.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
