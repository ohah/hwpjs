"""Independent ZIP and whole XML comparison for an exterior prefix edit."""
import base64
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as ET

P = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"

def verify(request):
    paragraph = request["paragraph"]
    start, deleted = request.get("start", 0), request.get("deleted", 0)
    text_index = request.get("textIndex", 0)
    if type(text_index) is not int or text_index < 0:
        raise ValueError("Invalid exterior text index")
    if type(paragraph) is not int or paragraph < 1 or not isinstance(request["prefix"], str) or type(start) is not int or type(deleted) is not int or start < 0 or deleted < 0:
        raise ValueError("Invalid exterior expectation")
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(request["before"]))) as source, zipfile.ZipFile(io.BytesIO(base64.b64decode(request["after"]))) as saved:
        if source.namelist() != saved.namelist() or source.comment != saved.comment or source.testzip() is not None or saved.testzip() is not None:
            raise ValueError("ZIP inventory or integrity changed")
        edited = False
        for name in source.namelist():
            before, after = source.read(name), saved.read(name)
            if name != request["part"]:
                if before != after:
                    raise ValueError("Non-target ZIP payload changed")
                continue
            parse = lambda data: ET.fromstring(data, parser=ET.XMLParser(target=ET.TreeBuilder(insert_comments=True, insert_pis=True)))
            expected, actual = parse(before), parse(after)
            paragraphs = list(expected.iter(P + "p"))
            if paragraph > len(paragraphs):
                raise ValueError("Unknown paragraph")
            texts = paragraphs[paragraph - 1].findall(P + "run/" + P + "t")
            if text_index >= len(texts) or len(texts[text_index]) != 0:
                raise ValueError("Missing plain exterior text")
            encoded = (texts[text_index].text or "").encode("utf-16-le")
            if (start + deleted) * 2 > len(encoded):
                raise ValueError("Exterior expectation exceeds text")
            texts[text_index].text = encoded[:start * 2].decode("utf-16-le") + request["prefix"] + encoded[(start + deleted) * 2:].decode("utf-16-le")
            if ET.tostring(expected) != ET.tostring(actual):
                raise ValueError("XML differs outside expected prefix")
            edited = True
        if not edited:
            raise ValueError("Missing target ZIP part")

if __name__ == "__main__":
    verify(json.load(sys.stdin))
    print("verified")
