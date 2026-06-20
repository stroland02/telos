import Database from "better-sqlite3";
import { TelosGraph, TelosNode, TelosEdge, NodeKind, Layer, EdgeKind } from "./schema.js";

export class GraphStore {
  private constructor(private readonly db: Database.Database) {}

  static open(dbPath: string): GraphStore {
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY, kind TEXT, name TEXT, qualified_name TEXT, language TEXT,
        path TEXT, line_start INTEGER, line_end INTEGER, layer TEXT,
        fan_in INTEGER, fan_out INTEGER, lines INTEGER, complexity INTEGER, summary TEXT
      );
      CREATE TABLE IF NOT EXISTS edges (
        source_id TEXT, target_id TEXT, kind TEXT, resolved INTEGER
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(id UNINDEXED, name, qualified_name);
    `);
    return new GraphStore(db);
  }

  save(graph: TelosGraph): void {
    const tx = this.db.transaction((g: TelosGraph) => {
      this.db.prepare("DELETE FROM nodes").run();
      this.db.prepare("DELETE FROM edges").run();
      this.db.prepare("DELETE FROM nodes_fts").run();
      const ins = this.db.prepare(`INSERT INTO nodes VALUES
        (@id,@kind,@name,@qualifiedName,@language,@path,@lineStart,@lineEnd,@layer,@fanIn,@fanOut,@lines,@complexity,@summary)`);
      const fts = this.db.prepare("INSERT INTO nodes_fts (id,name,qualified_name) VALUES (?,?,?)");
      for (const n of g.nodes) { ins.run(n); fts.run(n.id, n.name, n.qualifiedName); }
      const ie = this.db.prepare("INSERT INTO edges VALUES (?,?,?,?)");
      for (const e of g.edges) ie.run(e.sourceId, e.targetId, e.kind, e.resolved ? 1 : 0);
    });
    tx(graph);
  }

  loadGraph(): TelosGraph {
    const nodes = (this.db.prepare("SELECT * FROM nodes").all() as any[]).map(rowToNode);
    const edges = (this.db.prepare("SELECT * FROM edges").all() as any[]).map((r): TelosEdge => ({
      sourceId: r.source_id, targetId: r.target_id, kind: r.kind as EdgeKind, resolved: !!r.resolved,
    }));
    return { nodes, edges };
  }

  search(term: string): TelosNode[] {
    const ids = (this.db.prepare("SELECT id FROM nodes_fts WHERE nodes_fts MATCH ?").all(`${term}*`) as any[])
      .map((r) => r.id);
    if (ids.length === 0) return [];
    const ph = ids.map(() => "?").join(",");
    return (this.db.prepare(`SELECT * FROM nodes WHERE id IN (${ph})`).all(...ids) as any[]).map(rowToNode);
  }

  close(): void { this.db.close(); }
}

function rowToNode(r: any): TelosNode {
  return {
    id: r.id, kind: r.kind as NodeKind, name: r.name, qualifiedName: r.qualified_name,
    language: r.language, path: r.path, lineStart: r.line_start, lineEnd: r.line_end,
    layer: r.layer as Layer, fanIn: r.fan_in, fanOut: r.fan_out, lines: r.lines,
    complexity: r.complexity, summary: r.summary,
  };
}
