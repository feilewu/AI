import secrets
import sys
from pathlib import Path

from database import Database
from config import load_config


def main():
    config = load_config()
    db = Database(config.db_path)
    nodes = [
        ("node-1", "Web Server"),
        ("node-2", "Database"),
        ("node-3", "Dev Server"),
    ]
    for nid, name in nodes:
        token = secrets.token_hex(16)
        db.register_node(nid, name, token)
        print(f"Node: {nid} ({name})")
        print(f"  Token: {token}")
        print()


if __name__ == "__main__":
    main()
