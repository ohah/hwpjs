"""Independent header XML font metadata; no product snapshots or type defaults."""
import json
import sys
import zipfile
import xml.etree.ElementTree as ET
import pathlib

HEAD = "{http://www.hancom.co.kr/hwpml/2011/head}"
LANGUAGES = ("hangul", "latin", "hanja", "japanese", "other", "symbol", "user")
FONT = ("face", "type", "isEmbedded", "binaryItemIDRef")
TYPE_INFO = ("familyType", "weight", "proportion", "contrast", "strokeVariation", "armStyle", "letterform", "midline", "xHeight")


def read(path):
    with zipfile.ZipFile(path) as archive:
        entry = archive.getinfo("Contents/header.xml")
        if entry.file_size > 32 * 1024 * 1024:
            raise ValueError("HeaderLimit")
        root = ET.fromstring(archive.read(entry))
    if root.tag != HEAD + "head":
        raise ValueError("NotHeader")
    rows = []
    for group in root.findall(HEAD + "refList/" + HEAD + "fontfaces/" + HEAD + "fontface"):
        language = group.attrib["lang"].lower()
        if language not in LANGUAGES:
            raise ValueError("InvalidLanguage")
        for font in group.findall(HEAD + "font"):
            sub = font.findall(HEAD + "substFont")
            info = font.findall(HEAD + "typeInfo")
            if len(sub) > 1 or len(info) > 1:
                raise ValueError("DuplicateFontMetadataElement")
            rows.append(dict(format="hwpx", language=language, id=int(font.attrib["id"]),
                             font={key: font.get(key) for key in FONT},
                             substitute={key: sub[0].get(key) for key in FONT} if sub else None,
                             typeInfo={key: info[0].get(key) for key in TYPE_INFO} if info else None))
    rows.sort(key=lambda row: (LANGUAGES.index(row["language"]), row["id"]))
    if len({(row["language"], row["id"]) for row in rows}) != len(rows):
        raise ValueError("DuplicateFontId")
    return rows


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--corpus":
        result = []
        for path in sorted(pathlib.Path(sys.argv[2]).rglob("*")):
            if not path.is_file() or path.suffix.lower() not in (".hwp", ".hwpx"):
                continue
            with path.open("rb") as stream:
                if stream.read(4) != b"PK\x03\x04":
                    continue
            row = {"path": str(path)}
            try:
                row["fonts"] = read(path)
            except Exception as error:
                row["error"] = str(error)
            result.append(row)
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(json.dumps(read(sys.argv[1]), ensure_ascii=False))
