from __future__ import annotations

import re
import sqlite3
from pathlib import Path
from typing import Any

from app.renderer import Renderer

CJK_RE = re.compile(r"([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff])")


def _space_cjk(text: str) -> str:
    return CJK_RE.sub(r" \1 ", text)


class SearchEngine:
    def __init__(self, db_path: str = ":memory:"):
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self._init_db()

    def _init_db(self) -> None:
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS docs (
                id INTEGER PRIMARY KEY,
                path TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT ''
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
                title_search, content_search
            );
        """)
        self.conn.commit()

    def index_file(self, path: str, title: str, content: str) -> None:
        title_search = _space_cjk(title)
        content_search = _space_cjk(content)
        cursor = self.conn.execute(
            "INSERT OR REPLACE INTO docs (path, title, content) VALUES (?, ?, ?) RETURNING id",
            (path, title, content),
        )
        row_id = cursor.fetchone()["id"]
        self.conn.execute(
            "INSERT OR REPLACE INTO docs_fts(rowid, title_search, content_search) VALUES (?, ?, ?)",
            (row_id, title_search, content_search),
        )
        self.conn.commit()

    def remove_file(self, path: str) -> None:
        cursor = self.conn.execute("SELECT id FROM docs WHERE path = ?", (path,))
        row = cursor.fetchone()
        if row is not None:
            self.conn.execute("DELETE FROM docs_fts WHERE rowid = ?", (row["id"],))
            self.conn.execute("DELETE FROM docs WHERE id = ?", (row["id"],))
            self.conn.commit()

    def search(self, query: str, limit: int = 50) -> list[dict[str, Any]]:
        try:
            fts_query = _space_cjk(query)
            rows = self.conn.execute(
                """
                SELECT docs.path, docs.title, snippet(docs_fts, 1, '<b>', '</b>', '...', 32) AS snippet
                FROM docs_fts
                JOIN docs ON docs_fts.rowid = docs.id
                WHERE docs_fts MATCH ?
                ORDER BY rank
                LIMIT ?
                """,
                (fts_query, limit),
            ).fetchall()
            return [dict(r) for r in rows]
        except sqlite3.OperationalError:
            return []

    def rebuild_index(self, docs_root: str) -> None:
        self.conn.executescript("DELETE FROM docs; DELETE FROM docs_fts;")
        root = Path(docs_root)
        for md_file in root.rglob("*"):
            if md_file.suffix.lower() not in {".md", ".markdown"}:
                continue
            try:
                rel_path = str(md_file.relative_to(root))
                content = md_file.read_text(encoding="utf-8", errors="replace")
                title = Renderer.extract_title(content) or md_file.stem
                self.index_file(rel_path, title, content)
            except (PermissionError, OSError) as e:
                print(f"Warning: skipping unreadable file {md_file}: {e}")

    def close(self) -> None:
        self.conn.close()
