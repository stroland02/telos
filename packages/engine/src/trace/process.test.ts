import { describe, it, expect } from "vitest";
import { ProcessBuffer, tagProcesses, ProcessSample } from "./process.js";

function proc(p: Partial<ProcessSample> & { pid: number }): ProcessSample {
  return { name: "p", cpu: 0, memMb: 0, ...p };
}

const fileNodes = [
  { id: "f1", path: "src/api/server.ts" },
  { id: "f2", path: "src/api" },
];

describe("tagProcesses", () => {
  it("tags a process to the longest matching file path in its cmd", () => {
    const tagged = tagProcesses([
      proc({ pid: 1, cmd: "node src/api/server.ts --watch" }),
      proc({ pid: 2, cmd: "node src/api/other.ts" }),
      proc({ pid: 3, cmd: "chrome.exe" }),
      proc({ pid: 4 }), // no cmd
    ], fileNodes);
    expect(tagged.find((p) => p.pid === 1)!.nodeId).toBe("f1"); // longest match
    expect(tagged.find((p) => p.pid === 2)!.nodeId).toBe("f2"); // only the dir matches
    expect(tagged.find((p) => p.pid === 3)!.nodeId).toBeNull();
    expect(tagged.find((p) => p.pid === 4)!.nodeId).toBeNull();
  });

  it("normalizes backslashes in the command line", () => {
    const tagged = tagProcesses([proc({ pid: 1, cmd: "node src\\api\\server.ts" })], fileNodes);
    expect(tagged[0].nodeId).toBe("f1");
  });
});

describe("ProcessBuffer", () => {
  it("returns the latest snapshot CPU-descending and replaces on set", () => {
    const buf = new ProcessBuffer();
    buf.set([proc({ pid: 1, cpu: 5, memMb: 10 }), proc({ pid: 2, cpu: 20, memMb: 5 })]);
    expect(buf.latest().map((p) => p.pid)).toEqual([2, 1]);
    expect(buf.count()).toBe(2);

    buf.set([proc({ pid: 3, cpu: 1 })]);
    expect(buf.latest().map((p) => p.pid)).toEqual([3]); // replaced, not appended
  });

  it("honors a limit", () => {
    const buf = new ProcessBuffer();
    buf.set([proc({ pid: 1, cpu: 5 }), proc({ pid: 2, cpu: 9 }), proc({ pid: 3, cpu: 1 })]);
    expect(buf.latest(2).map((p) => p.pid)).toEqual([2, 1]);
  });
});
