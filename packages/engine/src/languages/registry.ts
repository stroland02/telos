// Extension → language id. Single source of truth for detection.
export const EXTENSION_LANGUAGE: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript",
  ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
  ".py": "python",
};

export const SUPPORTED_EXTENSIONS = Object.keys(EXTENSION_LANGUAGE);
