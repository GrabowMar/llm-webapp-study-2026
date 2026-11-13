from xml.parsers import expat


def _position(data: bytes, index: int) -> tuple[int, int]:
    head = data[:index].decode("utf-8", "replace")
    line = 1
    col = 1
    i = 0
    n = len(head)
    while i < n:
        ch = head[i]
        if ch == "\r":
            if i + 1 < n and head[i + 1] == "\n":
                i += 1
            line += 1
            col = 1
        elif ch == "\n":
            line += 1
            col = 1
        else:
            col += 1
        i += 1
    return line, col


def check_xml(text: str) -> dict:
    parser = expat.ParserCreate("utf-8")
    parser.buffer_text = True
    root = []

    def start(name, attrs):
        if not root:
            root.append(name)

    parser.StartElementHandler = start
    data = text.encode("utf-8", "surrogatepass")
    try:
        parser.Parse(data, True)
    except expat.ExpatError as exc:
        message = expat.errors.messages.get(exc.code, str(exc))
        line, column = _position(data, parser.ErrorByteIndex)
        return {
            "valid": False,
            "error": message,
            "line": line,
            "column": column,
            "root_element": None,
        }
    except (ValueError, RecursionError, MemoryError) as exc:
        return {
            "valid": False,
            "error": f"Document could not be parsed: {exc}",
            "line": 1,
            "column": 1,
            "root_element": None,
        }
    return {
        "valid": True,
        "error": None,
        "line": None,
        "column": None,
        "root_element": root[0] if root else None,
    }
