from __future__ import annotations

import markdown
from pygments.formatters import HtmlFormatter


class Renderer:
    def __init__(self):
        self.md = markdown.Markdown(
            extensions=[
                "fenced_code",
                "tables",
                "toc",
                "codehilite",
                "sane_lists",
            ],
            extension_configs={
                "codehilite": {
                    "css_class": "highlight",
                },
                "toc": {
                    "permalink": True,
                },
            },
        )

    def render(self, content: str) -> str:
        self.md.reset()
        return self.md.convert(content)

    @staticmethod
    def extract_title(content: str) -> str:
        for line in content.splitlines():
            line = line.strip()
            if line.startswith("# ") or line.startswith("#\t"):
                return line.lstrip("# \t")
        return ""

    @staticmethod
    def get_pygments_css() -> str:
        return HtmlFormatter().get_style_defs(".highlight")
