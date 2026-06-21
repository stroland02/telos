import { useState, useCallback, useRef, KeyboardEvent } from "react";

// ─── Tree data model ─────────────────────────────────────────────────────────

interface FileNode {
  type: "file";
  name: string;
  path: string; // repo-relative path
}

interface FolderNode {
  type: "folder";
  name: string;
  children: TreeNode[];
}

type TreeNode = FileNode | FolderNode;

/** Build a virtual directory tree from a flat list of repo-relative file paths. */
function buildTree(paths: string[]): TreeNode[] {
  if (!Array.isArray(paths) || paths.length === 0) return [];
  const root: FolderNode = { type: "folder", name: "", children: [] };

  for (const path of paths) {
    const parts = path.split("/");
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (isLast) {
        cur.children.push({ type: "file", name: part, path });
      } else {
        let folder = cur.children.find(
          (c): c is FolderNode => c.type === "folder" && c.name === part,
        );
        if (!folder) {
          folder = { type: "folder", name: part, children: [] };
          cur.children.push(folder);
        }
        cur = folder;
      }
    }
  }

  // Sort: folders before files, then alphabetically
  function sortChildren(node: FolderNode): void {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const child of node.children) {
      if (child.type === "folder") sortChildren(child);
    }
  }
  sortChildren(root);

  return root.children;
}

// ─── Tree row components ──────────────────────────────────────────────────────

interface RowProps {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  onSelect: (path: string) => void;
  folderKey: string;
}

function TreeRow({ node, depth, selectedPath, expanded, onToggle, onSelect, folderKey }: RowProps) {
  const indent = depth * 14;

  if (node.type === "file") {
    const isSelected = node.path === selectedPath;
    const rowRef = useRef<HTMLDivElement>(null);

    return (
      <div
        ref={rowRef}
        role="treeitem"
        aria-selected={isSelected}
        tabIndex={0}
        onClick={() => onSelect(node.path)}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(node.path); }
        }}
        onFocus={(e) => { (e.currentTarget as HTMLElement).style.outline = "2px solid var(--accent)"; (e.currentTarget as HTMLElement).style.outlineOffset = "-2px"; }}
        onBlur={(e) => { (e.currentTarget as HTMLElement).style.outline = "none"; }}
        onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
        onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
        title={node.path}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--s-1)",
          paddingLeft: indent + 20, // 20px for icon + gap after chevron space
          paddingRight: "var(--s-2)",
          height: 24,
          cursor: "pointer",
          background: isSelected ? "var(--accent-soft)" : "transparent",
          borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
          userSelect: "none",
          overflow: "hidden",
          flexShrink: 0,
          outline: "none",
        }}
      >
        {/* File icon */}
        <span aria-hidden="true" style={{ color: "var(--text-faint)", fontSize: 11, flexShrink: 0 }}>📄</span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--t-meta-size)",
            color: isSelected ? "var(--accent)" : "var(--text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {node.name}
        </span>
      </div>
    );
  }

  // Folder
  const key = `${folderKey}/${node.name}`;
  const isOpen = expanded.has(key);

  return (
    <div role="treeitem" aria-expanded={isOpen}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onToggle(key)}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            onToggle(key);
          }
        }}
        onFocus={(e) => { (e.currentTarget as HTMLElement).style.outline = "2px solid var(--accent)"; (e.currentTarget as HTMLElement).style.outlineOffset = "-2px"; }}
        onBlur={(e) => { (e.currentTarget as HTMLElement).style.outline = "none"; }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
        aria-label={`${isOpen ? "Collapse" : "Expand"} folder ${node.name}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--s-1)",
          paddingLeft: indent,
          paddingRight: "var(--s-2)",
          height: 24,
          cursor: "pointer",
          background: "transparent",
          userSelect: "none",
          flexShrink: 0,
          outline: "none",
        }}
      >
        {/* Chevron */}
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: 14,
            textAlign: "center",
            color: "var(--text-faint)",
            fontSize: 10,
            transition: "transform 100ms ease",
            transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
            flexShrink: 0,
          }}
        >
          ▶
        </span>
        {/* Folder icon */}
        <span aria-hidden="true" style={{ color: "var(--layer-infra)", fontSize: 11, flexShrink: 0 }}>📁</span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--t-meta-size)",
            color: "var(--text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: 500,
          }}
        >
          {node.name}
        </span>
      </div>
      {isOpen && (
        <div role="group">
          {node.children.map((child) => (
            <TreeRow
              key={child.name}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              folderKey={key}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── FileTree ─────────────────────────────────────────────────────────────────

export interface FileTreeProps {
  paths: string[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}

export function FileTree({ paths, selectedPath, onSelectFile }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const tree = buildTree(paths);

  if (paths.length === 0) {
    return (
      <div
        style={{
          padding: "var(--s-4)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--t-meta-size)",
          color: "var(--text-faint)",
          fontStyle: "italic",
        }}
      >
        No files indexed
      </div>
    );
  }

  return (
    <div
      role="tree"
      aria-label="File explorer"
      style={{ overflowY: "auto", overflowX: "hidden", flex: 1 }}
    >
      {tree.map((node) => (
        <TreeRow
          key={node.name}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          expanded={expanded}
          onToggle={toggle}
          onSelect={onSelectFile}
          folderKey=""
        />
      ))}
    </div>
  );
}
