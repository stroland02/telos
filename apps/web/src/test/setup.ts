import "@testing-library/jest-dom/vitest";

// jsdom does not implement ResizeObserver; React Flow requires it
globalThis.ResizeObserver = globalThis.ResizeObserver ?? class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
