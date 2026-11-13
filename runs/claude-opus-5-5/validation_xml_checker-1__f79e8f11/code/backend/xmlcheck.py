"""XML well-formedness checking built on expat.

Only the submitted text is parsed: no DTDs, external entities or other
resources are ever fetched or resolved.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from xml.parsers import expat


@dataclass
class CheckResult:
    valid: bool
    error: str | None = None
    line: int | None = None
    column: int | None = None
    root_element: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


def _position_of_offset(text: str, offset: int) -> tuple[int, int]:
    before = text[:offset]
    line = before.count("\n") + 1
    column = offset - (before.rfind("\n") + 1) + 1
    return line, column


def _refuse_external(*_args) -> int:
    return 1


def check_xml(text: str) -> CheckResult:
    try:
        data = text.encode("utf-8")
    except UnicodeEncodeError as exc:
        line, column = _position_of_offset(text, exc.start)
        return CheckResult(
            valid=False,
            error="not well-formed (invalid token)",
            line=line,
            column=column,
        )

    parser = expat.ParserCreate(encoding="UTF-8")
    parser.SetParamEntityParsing(expat.XML_PARAM_ENTITY_PARSING_NEVER)
    parser.UseForeignDTD(False)
    parser.ExternalEntityRefHandler = _refuse_external

    root: list[str] = []

    def start_element(name, _attrs):
        if not root:
            root.append(name)

    parser.StartElementHandler = start_element

    try:
        parser.Parse(data, True)
    except expat.ExpatError as exc:
        return CheckResult(
            valid=False,
            error=expat.ErrorString(exc.code),
            line=exc.lineno,
            column=exc.offset + 1,
        )
    except RecursionError:
        return CheckResult(
            valid=False,
            error="document is nested too deeply",
            line=parser.CurrentLineNumber,
            column=parser.CurrentColumnNumber + 1,
        )

    return CheckResult(valid=True, root_element=root[0] if root else None)
