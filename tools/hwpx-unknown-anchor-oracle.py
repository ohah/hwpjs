"""Pinned unknown drawing fixture inventory and independent prefix mutation controls."""
import base64
import copy
import hashlib
import io
import json
from pathlib import Path
import runpy
import sys
import xml.etree.ElementTree as ET
import zipfile


def require(condition, detail):
    if not condition:
        raise ValueError(detail)


request = json.load(sys.stdin)
require(sys.argv[1:] in ([], ["--self-test"]), "UnexpectedOracleArguments")
before = base64.b64decode(request["before"], validate=True)
require(hashlib.sha256(before).hexdigest() == "0f03119d6ac3e19f74fc9fcec5315ac6ed436bab5abffd0804e9cf3350dd747a", "UnknownFixtureSource")
require(request.get("mode") == "anchored" and request["section"] == 0 and request["paragraph"] == 932, "WrongUnknownObjectTarget")
hp = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
part = "Contents/section0.xml"
with zipfile.ZipFile(io.BytesIO(before)) as source:
    paragraph = list(ET.fromstring(source.read(part)).iter(hp + "p"))[931]
    runs = paragraph.findall(hp + "run")
    require(len(runs) == 1, "WrongRunInventory")
    objects = runs[0].findall(hp + "unknownObj")
    require([node.attrib["id"] for node in objects] == ["1473398994", "1473398996", "1473398998", "1473399000"], "WrongUnknownObjectInventory")
    require(all(node.attrib["nativectrlid"] == "610496364" for node in objects), "WrongNativeControlInventory")
    require(len(runs[0].findall(hp + "tbl")) == 2, "WrongTableInventory")
verify = runpy.run_path(str(Path(__file__).with_name("hwpx-anchor-prefix-oracle.py")))["verify"]
verify(request)
if sys.argv[1:] == ["--self-test"]:
    after = base64.b64decode(request["after"], validate=True)
    with zipfile.ZipFile(io.BytesIO(after)) as saved:
        original_root = ET.fromstring(saved.read(part))

        def mutate(kind):
            root = copy.deepcopy(original_root)
            run = list(root.iter(hp + "p"))[931].find(hp + "run")
            nodes = run.findall(hp + "unknownObj")
            if kind == "native-control":
                nodes[0].set("nativectrlid", "0")
            elif kind == "remove-object":
                run.remove(nodes[0])
            elif kind == "object-order":
                first, second = list(run).index(nodes[0]), list(run).index(nodes[1])
                run[first], run[second] = nodes[1], nodes[0]
            elif kind == "opaque-child":
                nodes[0][0].set("mutation", "unexpected")
            elif kind == "table":
                run.find(hp + "tbl").set("id", "0")
            result = io.BytesIO()
            with zipfile.ZipFile(result, "w") as output:
                output.comment = saved.comment
                for info in saved.infolist():
                    data = ET.tostring(root, encoding="utf-8") if info.filename == part else saved.read(info.filename)
                    if kind == "other-payload" and info.filename == "mimetype":
                        data += b"wrong"
                    output.writestr(copy.copy(info), data)
            return base64.b64encode(result.getvalue()).decode("ascii")

        verify(dict(request, after=mutate("unchanged")))
        kinds = ("native-control", "remove-object", "object-order", "opaque-child", "table", "other-payload")
        for kind in kinds:
            try:
                verify(dict(request, after=mutate(kind)))
            except ValueError as error:
                expected = "non-target payload mimetype" if kind == "other-payload" else "complete XML mismatch"
                require(str(error) == expected, "WrongMutationRefusal:" + kind + ":" + str(error))
                continue
            raise ValueError("OracleAcceptedMutation:" + kind)
        print(json.dumps({"positive": 2, "negative": len(kinds)}))
