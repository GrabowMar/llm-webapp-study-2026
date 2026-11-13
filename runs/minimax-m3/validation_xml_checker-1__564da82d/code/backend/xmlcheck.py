"""XML well-formedness checking.

The checker only looks at the submitted text: no document, DTD or entity is
ever fetched from the network or from the file system.  It uses the expat
parser (the same engine ``xml.etree.ElementTree`` is built on) so that the
position of the *first* syntax error is reported precisely.
"""

from __future__ import annotations

from xml.parsers import expat
from typing import Any, Dict, List, Optional

__all__ = ["check_document"]


def _char_column(lines: List[str], line_number: int, byte_offset: int) -> int:
    """Convert an expat byte offset inside a line into a 1-based column."""
    if line_number < 1 or line_number > len(lines):
        return byte_offset + 1
    prefix = lines[line_number - 1].encode("utf-8")[:byte_offset]
    return len(prefix.decode("utf-8", "replace")) + 1


def _error_message(code: int) -> str:
    return expat.ErrorString(code) or "parse error"


def check_document(text: Optional[str]) -> Dict[str, Any]:
    """Return the well-formedness verdict for ``text``.

    The result always has the same shape::

        {"valid": bool, "error": str | None, "line": int | None,
         "column": int | None, "root_element": str | None}
    """
    result: Dict[str, Any] = {
        "valid": False,
        "error": None,
        "line": None,
        "column": None,
        "root_element": None,
    }

    if text is None:
        text = ""
    if not isinstance(text, str):
        text = str(text)

    lines = text.splitlines()
    parser = expat.ParserCreate(encoding="utf-8")
    parser.SetParamEntityParsing(expat.XML_PARAM_ENTITY_PARSING_NEVER)

    root: Dict[str, str] = {}

    def start_element(name: str, _attrs: Dict[str, str]) -> None:
        if "name" not in root:
            root["name"] = name

    parser.StartElementHandler = start_element

    try:
        parser.Parse(text.encode("utf-8"), True)
    except expat.ExpatError as exc:
        line = exc.lineno
        result["error"] = _error_message(exc.code)
        result["line"] = line
        result["column"] = _char_column(lines, line, exc.offset)
        return result

    result["valid"] = True
    result["root_element"] = root.get("name")
    return result
