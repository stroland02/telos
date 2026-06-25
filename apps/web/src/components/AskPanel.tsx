/**
 * AskPanel — the Phase 3 "semantic brain" surface in the UI.
 *
 *   - "Ask" mode: a natural-language question ("where does X happen?") →
 *     api.ask() → ranked symbols. Each is clickable to open its node.
 *   - "Tour" mode: api.tour() → a dependency-ordered walkthrough of the
 *     codebase, each stop clickable.
 *
 * Modeled on ShortcutsOverlay: role="dialog" aria-modal, Esc + backdrop close,
 * focus moved to the input on open. Token-styled, no hard-coded hex.
 */

import { useRef, useState } from "react";
import { TelosApi } from "../api/client";
import { Answer, TourStop } from "../api/types";
import { Panel, Button } from "./ui";

interface Hit { id: string; primary: string; secondary: string | null }

export function AskPanel({
  open, api, onOpenNode, onClose,
}: { open: boolean; api: TelosApi; onOpenNode: (id: string) => void; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<"ask" | "tour">("ask");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const runAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setMode("ask"); setLoading(true); setSearched(true);
    api.ask(question.trim())
      .then((answers: Answer[]) => setHits(answers.map((a) => ({ id: a.id, primary: a.qualifiedName, secondary: a.summary ?? a.path }))))
      .catch(() => setHits([]))
      .finally(() => setLoading(false));
  };

  const runTour = () => {
    setMode("tour"); setLoading(true); setSearched(true);
    api.tour(20)
      .then((stops: TourStop[]) => setHits(stops.map((s) => ({ id: s.id, primary: `${s.order + 1}. ${s.qualifiedName}`, secondary: s.summary }))))
      .catch(() => setHits([]))
      .finally(() => setLoading(false));
  };

  const pick = (id: string) => { onOpenNode(id); onClose(); };

  return (
    <Panel open={open} onClose={onClose} ariaLabel="Ask the codebase" width={560} initialFocus={inputRef}>
        <form onSubmit={runAsk} style={{ display: "flex", gap: "var(--s-2)", padding: "var(--s-3)", borderBottom: "1px solid var(--border)" }}>
          <input
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Where does … happen?"
            aria-label="Question"
            style={{
              flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
              color: "var(--text)", padding: "var(--s-2)", fontFamily: "var(--font-ui)", fontSize: "var(--t-body-size, 14px)", outline: "none",
            }}
          />
          <Button type="submit" variant="primary">Ask</Button>
          <Button type="button" onClick={runTour} title="Dependency-ordered walkthrough">Tour</Button>
        </form>

        <div style={{ overflowY: "auto", padding: "var(--s-2)" }}>
          {loading && <Empty text="Searching…" />}
          {!loading && searched && hits.length === 0 && (
            <Empty text={mode === "ask" ? "No matching code found." : "No tour available — scan a repo first."} />
          )}
          {!loading && !searched && (
            <Empty text="Ask a question, or take a dependency-ordered tour of the codebase." />
          )}
          {!loading && hits.length > 0 && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    onClick={() => pick(h.id)}
                    style={{
                      width: "100%", textAlign: "left", display: "flex", flexDirection: "column", gap: 1,
                      background: "none", border: "1px solid transparent", borderRadius: "var(--r-sm)",
                      padding: "var(--s-2)", cursor: "pointer", color: "var(--text)", font: "inherit", outline: "none",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
                    onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; }}
                    onBlur={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "transparent"; }}
                  >
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--t-meta-size)", color: "var(--text)" }}>{h.primary}</span>
                    {h.secondary && <span style={{ fontSize: "11px", color: "var(--text-faint)" }}>{h.secondary}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
    </Panel>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ padding: "var(--s-3)", fontSize: "var(--t-meta-size)", color: "var(--text-faint)", fontStyle: "italic" }}>{text}</div>;
}
