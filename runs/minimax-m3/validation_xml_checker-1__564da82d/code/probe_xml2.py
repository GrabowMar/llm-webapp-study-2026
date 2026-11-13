import xml.parsers.expat as expat


def check(text, encoding=None):
    p = expat.ParserCreate(encoding) if encoding else expat.ParserCreate()
    p.SetParamEntityParsing(expat.XML_PARAM_ENTITY_PARSING_NEVER)
    data = text.encode("utf-8")
    try:
        p.Parse(data, True)
        return ("OK", None)
    except expat.ExpatError as e:
        return ("ERR", expat.ErrorString(e.code), (e.lineno, e.offset), e.code)


cases = [
    "<a>\u00e9</a>",                                  # valid, multibyte content
    "<a>\u00e9<b></a>",                              # error after multibyte char
    "<?xml version='1.0' encoding='ISO-8859-1'?><a>\u00e9</a>",
    "<?xml version='1.0' encoding='UTF-16'?><a/>",
    "<a b='1' b='2'/>",
    "<a>&amp;</a>",
    "<!DOCTYPE a [<!ENTITY e 'x'>]><a>&e;</a>",
    "<!DOCTYPE a SYSTEM 'http://example.com/a.dtd'><a/>",
    "<!-- comment --><a/>",
    "<a><![CDATA[x]]></a>",
    "<?xml version='1.0'?><!DOCTYPE a [<!ENTITY % p SYSTEM 'http://x/e.dtd'> %p;]><a/>",
]
for t in cases:
    print(repr(t[:60]))
    print("   default:", check(t))
    print("   utf-8  :", check(t, "utf-8"))
