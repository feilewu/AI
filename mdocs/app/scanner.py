from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class DocNode:
    name: str
    path: str
    is_dir: bool
    children: list[DocNode] = field(default_factory=list)


class Scanner:
    def __init__(self, root: str):
        self.root = Path(root).resolve()
        self._tree: DocNode | None = None

    def scan(self) -> DocNode:
        if not self.root.exists():
            raise FileNotFoundError(f"Directory does not exist: {self.root}")
        if not self.root.is_dir():
            raise NotADirectoryError(f"Not a directory: {self.root}")
        self._tree = self._build_tree(self.root)
        return self._tree

    def get_tree(self) -> DocNode | None:
        return self._tree

    def _build_tree(self, directory: Path) -> DocNode:
        node = DocNode(name=directory.name, path=".", is_dir=True)
        try:
            entries = sorted(directory.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
        except PermissionError:
            return node
        for entry in entries:
            if entry.is_symlink():
                continue
            rel_path = str(entry.relative_to(self.root))
            if entry.is_dir():
                child = self._build_tree(entry)
                child.path = rel_path
                node.children.append(child)
            elif entry.suffix.lower() in {".md", ".markdown"}:
                node.children.append(DocNode(name=entry.name, path=rel_path, is_dir=False))
        return node

    def get_file_list(self) -> list[str]:
        result = []
        if self._tree is None:
            return result
        stack = [self._tree]
        while stack:
            node = stack.pop()
            if not node.is_dir:
                result.append(node.path)
            stack.extend(node.children)
        return result
