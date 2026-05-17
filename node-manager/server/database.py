import sqlite3
import json
from datetime import datetime, timezone
from pathlib import Path

UTC = timezone.utc


class Database:
    def __init__(self, db_path: str):
        path = Path(db_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._create_tables()

    def _create_tables(self):
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS nodes (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                token TEXT UNIQUE NOT NULL,
                status TEXT DEFAULT 'offline',
                last_seen TIMESTAMP,
                os_info TEXT DEFAULT '{}',
                registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                node_id TEXT NOT NULL,
                ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                cpu_pct REAL,
                memory_pct REAL,
                memory_used_mb REAL,
                disk_pct REAL,
                disk_used_gb REAL,
                net_rx_bytes INTEGER,
                net_tx_bytes INTEGER,
                load_1m REAL,
                load_5m REAL,
                load_15m REAL
            );

            CREATE TABLE IF NOT EXISTS commands (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                node_id TEXT NOT NULL,
                cmd_type TEXT NOT NULL,
                cmd_content TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                result TEXT,
                exit_code INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                executed_at TIMESTAMP
            );
        """)
        self.conn.commit()
        self._migrate()

    def _migrate(self):
        existing = [r[1] for r in self.conn.execute("PRAGMA table_info(metrics)").fetchall()]
        for col in ("net_rx_bytes", "net_tx_bytes"):
            if col not in existing:
                self.conn.execute(f"ALTER TABLE metrics ADD COLUMN {col} INTEGER")

    def register_node(self, node_id: str, name: str, token: str):
        self.conn.execute(
            "INSERT OR REPLACE INTO nodes (id, name, token, status, last_seen) VALUES (?, ?, ?, 'offline', NULL)",
            (node_id, name, token),
        )
        self.conn.commit()

    def verify_node(self, node_id: str, token: str) -> bool:
        row = self.conn.execute(
            "SELECT token FROM nodes WHERE id = ?", (node_id,)
        ).fetchone()
        return row is not None and row["token"] == token

    def set_node_online(self, node_id: str):
        self.conn.execute(
            "UPDATE nodes SET status = 'online', last_seen = ? WHERE id = ?",
            (datetime.now(UTC).isoformat(), node_id),
        )
        self.conn.commit()

    def set_node_offline(self, node_id: str):
        self.conn.execute(
            "UPDATE nodes SET status = 'offline' WHERE id = ?", (node_id,)
        )
        self.conn.commit()

    def save_metrics(self, node_id: str, data: dict):
        self.conn.execute(
            """INSERT INTO metrics
               (node_id, cpu_pct, memory_pct, memory_used_mb, disk_pct, disk_used_gb,
                net_rx_bytes, net_tx_bytes, load_1m, load_5m, load_15m)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                node_id,
                data.get("cpu_pct"),
                data.get("memory_pct"),
                data.get("memory_used_mb"),
                data.get("disk_pct"),
                data.get("disk_used_gb"),
                data.get("net_rx_bytes"),
                data.get("net_tx_bytes"),
                data.get("load_1m"),
                data.get("load_5m"),
                data.get("load_15m"),
            ),
        )
        self.conn.commit()

    def get_nodes(self) -> list:
        rows = self.conn.execute(
            "SELECT * FROM nodes ORDER BY registered_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]

    def get_node(self, node_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM nodes WHERE id = ?", (node_id,)
        ).fetchone()
        return dict(row) if row else None

    def get_latest_metrics(self, node_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM metrics WHERE node_id = ? ORDER BY ts DESC LIMIT 1",
            (node_id,),
        ).fetchone()
        return dict(row) if row else None

    def get_metrics_history(self, node_id: str, limit: int = 60) -> list:
        rows = self.conn.execute(
            "SELECT * FROM metrics WHERE node_id = ? ORDER BY ts DESC LIMIT ?",
            (node_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]

    def save_command(self, node_id: str, cmd_type: str, content: str) -> int:
        cur = self.conn.execute(
            "INSERT INTO commands (node_id, cmd_type, cmd_content) VALUES (?, ?, ?)",
            (node_id, cmd_type, content),
        )
        self.conn.commit()
        return cur.lastrowid

    def get_pending_commands(self, node_id: str) -> list:
        rows = self.conn.execute(
            "SELECT * FROM commands WHERE node_id = ? AND status = 'pending' ORDER BY created_at ASC",
            (node_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    def update_command_result(self, cmd_id: int, result: str, exit_code: int):
        self.conn.execute(
            "UPDATE commands SET status = 'executed', result = ?, exit_code = ?, executed_at = ? WHERE id = ?",
            (result, exit_code, datetime.now(UTC).isoformat(), cmd_id),
        )
        self.conn.commit()

    def get_node_commands(self, node_id: str, limit: int = 50) -> list:
        rows = self.conn.execute(
            "SELECT * FROM commands WHERE node_id = ? ORDER BY created_at DESC LIMIT ?",
            (node_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]

    def get_command(self, cmd_id: int) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM commands WHERE id = ?", (cmd_id,)
        ).fetchone()
        return dict(row) if row else None

    def delete_node(self, node_id: str):
        self.conn.execute("DELETE FROM metrics WHERE node_id = ?", (node_id,))
        self.conn.execute("DELETE FROM commands WHERE node_id = ?", (node_id,))
        self.conn.execute("DELETE FROM nodes WHERE id = ?", (node_id,))
        self.conn.commit()

    def update_token(self, node_id: str, new_token: str):
        self.conn.execute(
            "UPDATE nodes SET token = ? WHERE id = ?", (new_token, node_id)
        )
        self.conn.commit()
