import sqlite3
from datetime import datetime, timezone
from pathlib import Path


class Database:
    def __init__(self, db_path: str):
        path = Path(db_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._create_tables()

    def _create_tables(self):
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS services (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                path_prefix TEXT NOT NULL UNIQUE,
                target_host TEXT DEFAULT 'localhost',
                target_port INTEGER NOT NULL,
                enabled BOOLEAN DEFAULT TRUE,
                auto_detected BOOLEAN DEFAULT FALSE,
                protected_paths TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        self.conn.commit()
        self._migrate()

    def _migrate(self):
        existing = [r[1] for r in self.conn.execute("PRAGMA table_info(services)").fetchall()]
        if "protected_paths" not in existing:
            self.conn.execute("ALTER TABLE services ADD COLUMN protected_paths TEXT DEFAULT ''")
            self.conn.commit()

    def list_services(self) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM services ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]

    def get_service(self, service_id: int) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM services WHERE id = ?", (service_id,)
        ).fetchone()
        return dict(row) if row else None

    def add_service(self, name: str, path_prefix: str, target_port: int,
                    target_host: str = "localhost", auto_detected: bool = False,
                    protected_paths: str = "") -> int:
        cur = self.conn.execute(
            """INSERT INTO services (name, path_prefix, target_host, target_port, auto_detected, protected_paths)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (name, path_prefix, target_host, target_port, auto_detected, protected_paths),
        )
        self.conn.commit()
        return cur.lastrowid

    def update_service(self, service_id: int, name: str = None, path_prefix: str = None,
                       target_host: str = None, target_port: int = None,
                       enabled: bool = None, protected_paths: str = None) -> bool:
        fields = []
        values = []
        if name is not None:
            fields.append("name = ?")
            values.append(name)
        if path_prefix is not None:
            fields.append("path_prefix = ?")
            values.append(path_prefix)
        if target_host is not None:
            fields.append("target_host = ?")
            values.append(target_host)
        if target_port is not None:
            fields.append("target_port = ?")
            values.append(target_port)
        if enabled is not None:
            fields.append("enabled = ?")
            values.append(int(enabled))
        if protected_paths is not None:
            fields.append("protected_paths = ?")
            values.append(protected_paths)
        if not fields:
            return False
        fields.append("updated_at = ?")
        values.append(datetime.now(timezone.utc).isoformat())
        values.append(service_id)
        self.conn.execute(
            f"UPDATE services SET {', '.join(fields)} WHERE id = ?", values
        )
        self.conn.commit()
        return True

    def delete_service(self, service_id: int):
        self.conn.execute("DELETE FROM services WHERE id = ?", (service_id,))
        self.conn.commit()

    def get_enabled_services(self) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM services WHERE enabled = TRUE ORDER BY path_prefix ASC"
        ).fetchall()
        return [dict(r) for r in rows]
