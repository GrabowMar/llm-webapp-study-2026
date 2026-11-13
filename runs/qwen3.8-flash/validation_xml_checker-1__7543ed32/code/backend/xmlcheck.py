"""Well-formedness checking via expat.

Syntax only: no DTD or external entities are ever fetched or resolved, and
no schema validation is performed.
"""

import xml.parsers.expat as expat


def check_xml(text: str) -> dict:
    """Return {valid, error, line, column, root_element} for *text*.

    Lines are 1-based, columns are 0-based offsets into the offending line
    (expat convention), matching what a browser/`ErrorLineNumber` reports.
    """
    data = text.encode("utf-8", errors="surrogatepass")
    parser = expat.ParserCreate()
    root: dict[str, str] = {}

    def start_element(name: str, _attrs) -> None:
        root.setdefault("name", name)

    def external_entity_ref_handler(*_args) -> int:
        # Never resolve anything outside the submitted document.
        return 0

    parser.StartElementHandler = start_element
    parser.ExternalEntityRefHandler = external_entity_ref_handler

    result = {
        "valid": False,
        "error": None,
        "line": None,
        "column": None,
        "root_element": None,
    }
    try:
        parser.Parse(data, True)
    except expat.ExpatError as exc:
        result["error"] = expat.ErrorString(exc.code)
        result["line"] = parser.ErrorLineNumber
        result["column"] = parser.ErrorColumnNumber
        result["root_element"] = root.get("name")
        return result
    except Exception:
        result["error"] = "not well-formed (invalid token)"
        return result

    result["valid"] = True
    result["root_element"] = root.get("name")
    return result
