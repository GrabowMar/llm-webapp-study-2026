import xml.etree.ElementTree as ET
import xml.parsers.expat as expat

print("expat:", expat.version_info, expat.EXPAT_VERSION)
tests = ["", "  ", "<a></a>", "<a><b></a>", "<a>", "not xml at all", "<a attr='1' attr='2'/>", "<a>&undefined;</a>", "<a/>junk", "<?xml version='1.0'?><a/>"]
for t in tests:
    try:
        root = ET.fromstring(t)
        print(repr(t[:32]), "-> OK", root.tag)
    except ET.ParseError as e:
        print(repr(t[:32]), "-> ET ParseError", e.code, e.position, repr(str(e)))


def check(text, encoding=None):
    p = expat.ParserCreate(encoding) if encoding else expat.ParserCreate()
    p.SetParamEntityParsing(expat.XML_PARAM_ENTITY_PARSING_NEVER)
    root = {"name": None}

    def se(name, attrs):
        if root["name"] is None:
            root["name"] = name

    p.StartElementHandler = se
    data = text.encode("utf-8")
    try:
        p.Parse(data, True)
        return ("OK", root["name"], None)
    except expat.ExpatError as e:
        return ("ERR", expat.ErrorString(e.code), (e.lineno, e.offset), e.code)


for t in ["", "   ", "<a></a>", "<a><b></a>", "<a>", "not xml at all", "<a/>junk",
          "<?xml version='1.0' encoding='ISO-8859-1'?><a/>",
          "<a>\n<b>\n</a>", "<a>\u00e9</a>"]:
    print(repr(t), check(t))
print("--- explicit utf-8 encoding ---")
for t in ["<?xml version='1.0' encoding='ISO-8859-1'?><a/>", "<?xml version='1.0' encoding='UTF-8'?><a/>"]:
    print(repr(t), check(t, "utf-8"))
