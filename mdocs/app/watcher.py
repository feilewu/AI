from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Callable, Awaitable

from watchfiles import Change, awatch


class Watcher:
    def __init__(
        self,
        root: str,
        on_change: Callable[[str], Awaitable[None]],
        on_delete: Callable[[str], Awaitable[None]],
    ):
        self.root = Path(root).resolve()
        self.on_change = on_change
        self.on_delete = on_delete

    async def start(self) -> None:
        try:
            async for changes in awatch(self.root):
                for change_type, change_path in changes:
                    path = Path(change_path)
                    if path.suffix.lower() not in {".md", ".markdown"}:
                        continue
                    rel_path = str(path.relative_to(self.root))
                    try:
                        if change_type == Change.deleted:
                            await self.on_delete(rel_path)
                        else:
                            await self.on_change(rel_path)
                    except Exception as e:
                        print(f"Watcher error for {rel_path}: {e}")
        except Exception as e:
            print(f"Watcher failed: {e}")
