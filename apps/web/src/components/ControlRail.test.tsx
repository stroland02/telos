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
  filePaths: [] as string[],
  selectedFile: null,
  onSelectFile: vi.fn(),
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
