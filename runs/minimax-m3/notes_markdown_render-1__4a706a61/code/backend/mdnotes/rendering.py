"""Markdown to HTML rendering.

The same renderer backs the preview endpoint, the note HTML endpoint and the
public HTML endpoint, so every surface shows identical output.
"""

from markdown_it import MarkdownIt

_MARKDOWN = MarkdownIt("default", {"html": False, "linkify": True, "typographer": False})


def render_markdown(source: str | None) -> str:
    return _MARKDOWN.render(source or "")
