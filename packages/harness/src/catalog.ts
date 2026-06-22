import { TelosNode } from "@telos/engine";
import { Capability } from "./capability.js";
import { recommendFor } from "./recommend.js";

export const DEFAULT_CATALOG: Capability[] = [
  { id: "ecc:react-reviewer", kind: "agent", source: "ecc", title: "React/JSX review", match: { pathIncludes: [".tsx", ".jsx"] } },
  { id: "ecc:typescript-reviewer", kind: "agent", source: "ecc", title: "TypeScript review", match: { languages: ["typescript", "javascript"] } },
  { id: "ecc:python-reviewer", kind: "agent", source: "ecc", title: "Python review", match: { languages: ["python"] } },
  { id: "ecc:django-reviewer", kind: "agent", source: "ecc", title: "Django review", match: { languages: ["python"], pathIncludes: ["models", "views", "urls", "migrations"] } },
  { id: "ecc:go-reviewer", kind: "agent", source: "ecc", title: "Go review", match: { languages: ["go"] } },
  { id: "ecc:rust-reviewer", kind: "agent", source: "ecc", title: "Rust review", match: { languages: ["rust"] } },
  { id: "ecc:database-reviewer", kind: "agent", source: "ecc", title: "Database/SQL review", match: { layers: ["data"] } },
  { id: "ecc:security-reviewer", kind: "agent", source: "ecc", title: "Security review", match: { nameIncludes: ["auth", "login", "password", "token", "crypto", "secret"] } },
];

export function recommend(node: TelosNode): Capability[] {
  return recommendFor(node, DEFAULT_CATALOG);
}
