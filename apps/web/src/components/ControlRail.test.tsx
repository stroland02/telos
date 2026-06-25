import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ControlRail, RailActive, RailHandlers } from "./ControlRail";
import type { TelosStatus } from "../api/types";

const noop = () => {};
function handlers(over: Partial<RailHandlers> = {}): RailHandlers {
  return {
    toggleLive: vi.fn(), replay: vi.fn(), toggleHot: vi.fn(), openProcs: vi.fn(),
    openAsk: vi.fn(), openHarness: vi.fn(), openContext: vi.fn(), ...over,
  };
}
const active: RailActive = { live: false, hot: false, procs: false, ask: false, harness: false, context: false };

const extra = {
  api: { search: vi.fn().mockResolvedValue([]) } as unknown as import("../api/client").TelosApi,
  onOpenNode: noop,
  density: "learn",
  onDensity: vi.fn(),
  theme: "dark",
  onToggleTheme: vi.fn(),
  explorerOpen: true,
  onToggleExplorer: vi.fn(),
  onShortcuts: vi.fn(),
  onTour: vi.fn(),
  tourActive: false,
  onExport: vi.fn(),
  showSymbols: false,
  onShowSymbols: vi.fn(),
  granularityApplicable: true,
  engaged: false,
  onActivate: vi.fn(),
  onResolve: vi.fn(),
  resolveCount: 0,
};

const fullStatus: TelosStatus = {
  graph: { nodes: 551, edges: 939, files: 166, languages: ["javascript", "python", "typescript"], enriched: 12 },
  harness: { caps: 8, drift: "ok" },
  live: { calls: 42 },
  procs: 261,
  forge: null,
};

describe("ControlRail", () => {
  it("renders feature entries and status badges", () => {
    render(<ControlRail status={fullStatus} active={active} on={handlers()} collapsed={false} onCollapsedChange={noop} {...extra} />);
    expect(screen.getByText("Map")).toBeTruthy();
    expect(screen.getByText("Harness")).toBeTruthy();
    expect(screen.getByText("Context")).toBeTruthy();
    expect(screen.getByText("8 caps · ok")).toBeTruthy();
    expect(screen.getByText("551 nodes · 939 edges")).toBeTruthy();
  });

  it("orders the rail groups View → Agent → Build → Live signals → Display", () => {
    render(<ControlRail status={fullStatus} active={active} on={handlers()} collapsed={false} onCollapsedChange={noop} {...extra} />);
    const order = ["View", "Agent", "Build", "Live signals", "Display"].map((label) => screen.getByText(label));
    for (let i = 1; i < order.length; i++) {
      // Each group label must appear after the previous one in document order.
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("clicking an entry calls its handler", () => {
    const on = handlers();
    render(<ControlRail status={fullStatus} active={active} on={on} collapsed={false} onCollapsedChange={noop} {...extra} />);
    fireEvent.click(screen.getByText("Live"));
    expect(on.toggleLive).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Context"));
    expect(on.openContext).toHaveBeenCalled();
  });

  it("renders — for missing status fields", () => {
    const empty: TelosStatus = { graph: null, harness: null, live: null, procs: null, forge: null };
    render(<ControlRail status={empty} active={active} on={handlers()} collapsed={false} onCollapsedChange={noop} {...extra} />);
    expect(screen.getByText("— nodes")).toBeTruthy();
  });

  it("collapse button toggles", () => {
    const onCollapsedChange = vi.fn();
    render(<ControlRail status={fullStatus} active={active} on={handlers()} collapsed={false} onCollapsedChange={onCollapsedChange} {...extra} />);
    fireEvent.click(screen.getByLabelText("Collapse control rail"));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });
});
