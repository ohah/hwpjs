import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { documentRecords } from "./documents.mjs";
import { drawingStyleActual } from "./drawing-style.mjs";
import { lineActual } from "./shape-line.mjs";
import { groupInfoActual } from "./group-info.mjs";
import {groupActual} from "./group-validation.mjs";
import { connectorActual } from "./shape-connector.mjs";
import { lineOwnerActual } from "./line-validation.mjs";
import { rectangleActual } from "./shape-rectangle.mjs";
import { rectangleOwnerActual } from "./rectangle-validation.mjs";
import { ellipseActual } from "./shape-ellipse.mjs";
import { ellipseOwnerActual } from "./ellipse-validation.mjs";
import { arcOwnerActual } from "./arc-validation.mjs";
import { polygonActual } from "./shape-polygon.mjs";
import { polygonOwnerActual } from "./polygon-validation.mjs";
import { curveActual } from "./shape-curve.mjs";
import { curveOwnerActual } from "./curve-validation.mjs";
import { pictureOwnerActual } from "./picture-validation.mjs";
import { pictureActual, pictureRun } from "./shape-picture.mjs";
import { colorActual } from "./picture-color.mjs";
import { effectsActual } from "./picture-effects.mjs";
import { additionalActual, additionalRun, tailActual, tailRun } from "./picture-additional.mjs";

// Inventory only: failures remain visible and never authorize a fallback layout.
export function drawingStyleSurvey(call, cfb) {
  const root = new URL("../../reference/rhwp/samples/", import.meta.url);
  if (!existsSync(root)) return { skipped: true };
  const out = { files: 0, hierarchyCompleted: 0, security: 0, failures: [], kinds: {} };
  // Explicit per-fixture experiment, NOT version inference or production fallback.
  const olderFixtures = new Map([
    ["issue2559/1341000_research_report_footnotes.hwp", { count: 17, bytes: 21, version: "5000107" }],
    ["issue5714/1490000-200800034_vietnam_labor_report.hwp", { count: 1, bytes: 51, version: "5000006" }],
  ]);
  out.fillOnly = { parsed: 0, rejectedPrefixes: 0 };
  out.pictures = { parsed: 0, rejected: 0, lengths: {}, selectedPrefixes: [0,0,0], unavailablePrefixes: 0, nonzeroAdjustments: [] };
  out.pictureColors = { parsed: 0, rejected: 0, files: {}, values: {}, counts: {}, extra: {} };
  out.pictureEffects = { parsed: 0, rejected: 0, flags: {}, extra: {} };
  out.pictureAdditional = { selected: [0,0], rejected: 0, unavailable: 0, alpha: {} };
  out.pictureReferences = { ordinals: 0, absent: 0, nonidentity: {} };
  out.connectors = { parsed: 0, rejected: 0, points: 0, kinds: {}, extras: {}, files: {} };
  out.groupInfo = { parsed: 0, ids: 0, rejected: 0, selectedInstances: 0, unavailableInstances: 0, extras: {}, files: {}, identityMismatches: [] };
  out.videoRecords = [];
  out.versions = {};
  out.images = [];
  out.lines = { parsed: 0, rejected: 0, groupDrawingLines: 0, attributes: {}, extras: {}, deferredOwners: {} };
  out.rectangles = { parsed: 0, rejected: 0, groupDrawingRects: 0, rounds: {}, extras: {}, deferredOwners: {} };
  out.ellipses = { parsed: 0, rejected: 0, attributes: {}, extras: {}, files: {}, deferredOwners: {} };
  out.polygons = { parsed: 0, rejected: 0, counts: {}, extras: {}, tails: {}, files: {}, deferredOwners: {} };
  out.curves = { parsed: 0, rejected: 0, points: 0, segments: 0, types: {}, tails: {}, files: {}, deferredOwners: {} };
  out.metadata = { parsed: 0, rejected: 0, reservedNonzero: 0, alphaNonzero: 0, reservedExamples: [] };
  const drawingIds = new Set(["$lin", "$rec", "$ell", "$arc", "$pol", "$cur"]);
  for (const name of readdirSync(root, { recursive: true }).filter(n => n.endsWith(".hwp")).sort()) {
    out.files++;
    let sections, header, binItems;
    try {
      cfb.parse(readFileSync(join(fileURLToPath(root), name)), { strict: true });
      header = Buffer.from(cfb.findExact("/FileHeader").content);
      if (header.readUInt32LE(36) & (2 | 4 | 16 | 256 | 1024)) { out.security++; continue; }
      const info=call(3,Buffer.concat([header,Buffer.from(cfb.findExact('/DocInfo').content)]));
      binItems=documentRecords(info).filter(r=>r.tag===18).map(r=>info.subarray(r.start,r.end));
      const nodes = cfb.document().nodes;
      const body = nodes.findIndex(n => n.parent === 0 && n.name === "BodyText");
      assert.ok(body >= 0, "missing BodyText");
      sections = nodes.filter(n => n.parent === body && /^Section\d+$/.test(n.name))
        .map(n => ({ name: n.name, raw: Buffer.from(n.content) }));
      assert.ok(sections.length > 0, "missing sections");
    } catch (e) {
      if (e instanceof WebAssembly.RuntimeError) throw e;
      out.failures.push({ name, stage: "container", error: e.message }); continue;
    }
    let failed = false;
    for (const section of sections) {
      let bytes, records;
      try {
        bytes = call(3, Buffer.concat([header, section.raw]));
        records = documentRecords(bytes);
        const version = header.subarray(32, 36);
        call(51, Buffer.concat([version, bytes]));
      } catch (e) {
        if (e instanceof WebAssembly.RuntimeError) throw e;
        out.failures.push({ name, section: section.name, stage: "shape hierarchy", error: e.message });
        failed = true; continue;
      }
      lineOwnerActual(call,header.readUInt32LE(32),bytes);
      groupActual(call,header.readUInt32LE(32),bytes);
      rectangleOwnerActual(call,header.readUInt32LE(32),bytes);
      ellipseOwnerActual(call,header.readUInt32LE(32),bytes);
      arcOwnerActual(call,header.readUInt32LE(32),bytes);
      polygonOwnerActual(call,header.readUInt32LE(32),bytes);
      curveOwnerActual(call,header.readUInt32LE(32),bytes);
      pictureOwnerActual(call,header.readUInt32LE(32),bytes);
      const imageRefs=pictureOwnerActual(call,header.readUInt32LE(32),bytes,0,binItems.length);
      out.pictureReferences.ordinals+=imageRefs[7];out.pictureReferences.absent+=imageRefs[8];
      for(const r of records.filter(r=>r.tag===85)){
        const id=bytes.readUInt16LE(r.start+71),item=binItems[id-1];
        if(id&&item.length>=4&&[1,2].includes(item.readUInt16LE()&15)&&item.readUInt16LE(2)!==id)out.pictureReferences.nonidentity[name]=(out.pictureReferences.nonidentity[name]??0)+1;
      }
      const stack = [];
      for (const record of records) {
        if(record.tag===98)out.videoRecords.push({name,section:section.name,offset:record.offset,bytes:record.end-record.start});
        if(record.tag===85){
          const p=bytes.subarray(record.start,record.end),stats=pictureActual(call,p);
          out.pictures.parsed++;out.pictures.rejected+=stats.rejected;
          // Explicit experiment for present effect headers, not a version fallback.
          if(p.length>=82){
            const effect=effectsActual(call,p.subarray(78));out.pictureEffects.parsed++;out.pictureEffects.rejected+=effect.rejected;
            out.pictureEffects.flags[effect.flags]=(out.pictureEffects.flags[effect.flags]??0)+1;
            out.pictureEffects.extra[effect.extra]=(out.pictureEffects.extra[effect.extra]??0)+1;
            tailActual(call,p.subarray(78),0,false);
            const extra=p.subarray(78+effect.bytes);
            for(const [mode,size] of [[0,8],[1,9]]){
              if(extra.length<size){assert.throws(()=>additionalRun(call,extra,mode),/UnexpectedEnd/);assert.throws(()=>tailRun(call,p.subarray(78),mode+1),/UnexpectedEnd/);out.pictureAdditional.unavailable++;}
              else {
                const a=additionalActual(call,extra,mode),composed=tailActual(call,p.subarray(78),mode+1,false);
                assert.equal(a.width,composed.width);assert.equal(a.height,composed.height);assert.equal(a.alpha,composed.alpha);
                out.pictureAdditional.selected[mode]++;out.pictureAdditional.rejected+=a.rejected;
                if(mode===1)out.pictureAdditional.alpha[a.alpha]=(out.pictureAdditional.alpha[a.alpha]??0)+1;
              }
            }
          }
          // Explicit observed shadow-only experiment; other effect layouts stay pending.
          if(p.length>=82&&p.readUInt32LE(78)===1){
            assert.ok(p.length>=138);
            const color=colorActual(call,p.subarray(126));
            out.pictureColors.parsed++;out.pictureColors.rejected+=color.rejected;
            out.pictureColors.files[name]=(out.pictureColors.files[name]??0)+1;
            out.pictureColors.values[color.value]=(out.pictureColors.values[color.value]??0)+1;
            out.pictureColors.counts[color.count]=(out.pictureColors.counts[color.count]??0)+1;
            out.pictureColors.extra[color.extra]=(out.pictureColors.extra[color.extra]??0)+1;
          }
          out.pictures.lengths[p.length]=(out.pictures.lengths[p.length]??0)+1;
          out.pictures.selectedPrefixes[0]++;
          // Each prefix is a separate explicit experiment, never product auto-selection.
          for(const [prefix,size] of [[1,74],[2,78]]){
            if(p.length<size){assert.throws(()=>pictureRun(call,p,1,prefix),/UnexpectedEnd/);out.pictures.unavailablePrefixes++;}
            else {pictureActual(call,p,1,prefix,false);out.pictures.selectedPrefixes[prefix]++;}
          }
          if(stats.contrast||stats.brightness)out.pictures.nonzeroAdjustments.push({name,section:section.name,offset:record.offset,contrast:stats.contrast,brightness:stats.brightness});
        }
        const level = bytes.readUInt32LE(record.offset) >>> 10 & 1023;
        stack.length = level;
        if(record.tag===83){
          const parent=stack[level-1];
          const owner=parent?.tag===76?Buffer.from(bytes.subarray(parent.start,parent.start+4)).reverse().toString("latin1"):"other";
          if(owner==="$cur"){
            const curve=curveActual(call,bytes.subarray(record.start,record.end));
            out.curves.parsed++;out.curves.rejected+=curve.rejected;out.curves.points+=curve.points;out.curves.segments+=curve.segments;
            out.curves.files[name]=(out.curves.files[name]??0)+1;
            out.curves.tails[curve.tail]=(out.curves.tails[curve.tail]??0)+1;
            for(const [kind,n] of Object.entries(curve.types))out.curves.types[kind]=(out.curves.types[kind]??0)+n;
          }else out.curves.deferredOwners[owner]=(out.curves.deferredOwners[owner]??0)+1;
        }
        if(record.tag===82){
          const parent=stack[level-1];
          const owner=parent?.tag===76?Buffer.from(bytes.subarray(parent.start,parent.start+4)).reverse().toString("latin1"):"other";
          if(owner==="$pol"){
            const polygon=polygonActual(call,bytes.subarray(record.start,record.end));
            out.polygons.parsed++;out.polygons.rejected+=polygon.rejected;
            out.polygons.files[name]=(out.polygons.files[name]??0)+1;
            out.polygons.counts[polygon.count]=(out.polygons.counts[polygon.count]??0)+1;
            out.polygons.extras[polygon.extra]=(out.polygons.extras[polygon.extra]??0)+1;
            out.polygons.tails[polygon.tail]=(out.polygons.tails[polygon.tail]??0)+1;
          }else out.polygons.deferredOwners[owner]=(out.polygons.deferredOwners[owner]??0)+1;
        }
        if(record.tag===80){
          const parent=stack[level-1];
          const owner=parent?.tag===76?Buffer.from(bytes.subarray(parent.start,parent.start+4)).reverse().toString("latin1"):"other";
          if(owner==="$ell"){
            const ellipse=ellipseActual(call,bytes.subarray(record.start,record.end));
            out.ellipses.parsed++;out.ellipses.rejected+=ellipse.rejected;
            out.ellipses.files[name]=(out.ellipses.files[name]??0)+1;
            out.ellipses.attributes[ellipse.attributes]=(out.ellipses.attributes[ellipse.attributes]??0)+1;
            out.ellipses.extras[ellipse.extra]=(out.ellipses.extras[ellipse.extra]??0)+1;
          }else out.ellipses.deferredOwners[owner]=(out.ellipses.deferredOwners[owner]??0)+1;
        }
        if(record.tag===79){
          const parent=stack[level-1];
          const owner=parent?.tag===76?Buffer.from(bytes.subarray(parent.start,parent.start+4)).reverse().toString("latin1"):"other";
          if(owner==="$rec"){
            const rect=rectangleActual(call,bytes.subarray(record.start,record.end));
            out.rectangles.parsed++;out.rectangles.rejected+=rect.rejected;
            if(name==="group-drawing-02.hwp")out.rectangles.groupDrawingRects++;
            out.rectangles.rounds[rect.round]=(out.rectangles.rounds[rect.round]??0)+1;
            out.rectangles.extras[rect.extra]=(out.rectangles.extras[rect.extra]??0)+1;
          }else out.rectangles.deferredOwners[owner]=(out.rectangles.deferredOwners[owner]??0)+1;
        }
        if(record.tag===78){
          const parent=stack[level-1];
          const owner=parent?.tag===76?Buffer.from(bytes.subarray(parent.start,parent.start+4)).reverse().toString("latin1"):"other";
          if(owner==="$lin"){
            const line=lineActual(call,bytes.subarray(record.start,record.end));
            out.lines.parsed++;out.lines.rejected+=line.rejected;
            if(name==="group-drawing-02.hwp")out.lines.groupDrawingLines++;
            out.lines.attributes[line.attributes]=(out.lines.attributes[line.attributes]??0)+1;
            out.lines.extras[line.extra]=(out.lines.extras[line.extra]??0)+1;
          }else {
            out.lines.deferredOwners[owner]=(out.lines.deferredOwners[owner]??0)+1;
            if(owner==="$col"){
              const p=connectorActual(call,bytes.subarray(record.start,record.end));
              out.connectors.parsed++;out.connectors.rejected+=p.rejected;out.connectors.points+=p.count;
              out.connectors.kinds[p.kind]=(out.connectors.kinds[p.kind]??0)+1;
              out.connectors.extras[p.extra]=(out.connectors.extras[p.extra]??0)+1;
              out.connectors.files[name]=(out.connectors.files[name]??0)+1;
            }
          }
        }
        if (record.tag === 76) {
          const p = bytes.subarray(record.start, record.end);
          const id = Buffer.from(p.subarray(0, 4)).reverse().toString("latin1");
          if(id==="$con"){
            const base=(stack[level-1]?.tag===71?8:4)+42,start=base+50+p.readUInt16LE(base)*96;
            const tail=p.subarray(start),info=groupInfoActual(call,tail);
            out.groupInfo.parsed++;out.groupInfo.ids+=info.count;out.groupInfo.rejected+=info.rejected;
            out.groupInfo.extras[info.extra]=(out.groupInfo.extras[info.extra]??0)+1;
            out.groupInfo.files[name]=(out.groupInfo.files[name]??0)+1;
            if(info.extra>=4){out.groupInfo.rejected+=groupInfoActual(call,tail,1).rejected;out.groupInfo.selectedInstances++;}
            else out.groupInfo.unavailableInstances++;
            const actual=[];
            for(let j=records.indexOf(record)+1;j<records.length;j++){
              const child=records[j],childLevel=bytes.readUInt32LE(child.offset)>>>10&1023;
              if(childLevel<=level)break;
              if(childLevel===level+1&&child.tag===76)actual.push(bytes.readUInt32LE(child.start));
            }
            const listed=Array.from({length:info.count},(_,i)=>tail.readUInt32LE(2+i*4));
            if(JSON.stringify(actual)!==JSON.stringify(listed))out.groupInfo.identityMismatches.push({name,section:section.name,offset:record.offset,listed,actual});
          }
          const stats = out.kinds[id] ??= { total: 0, deferred: 0, known: 0, unknown: 0, errors: [], flags: {}, extras: {} };
          stats.total++;
          if (drawingIds.has(id)) {
            const start = (stack[level - 1].tag === 71 ? 8 : 4) + 42;
            const end = start + 50 + p.readUInt16LE(start) * 96;
            const style = p.subarray(end);
            const versionKey = `${header.readUInt32LE(32).toString(16)}/${p.readUInt16LE(start - 32)}`;
            const versionStats = out.versions[versionKey] ??= { full: 0, unknown: 0, failed: 0, fillOnly: 0 };
            if (olderFixtures.has(name) && id === "$rec") {
              const parsed = drawingStyleActual(call, style, 3);
              assert.equal(parsed.known, true);
              assert.equal(parsed.extra, 0);
              out.fillOnly.parsed++;
              versionStats.fillOnly++;
              for (let n = 0; n < parsed.consumed; n++) {
                assert.throws(() => call(53, Buffer.concat([Buffer.from([3]), style.subarray(0, n)])), /UnexpectedEnd/);
                out.fillOnly.rejectedPrefixes++;
              }
              drawingStyleActual(call, style, 3);
            }
            let result;
            try { result = call(53, Buffer.concat([Buffer.from([1]), style])); }
            catch (e) {
              if (e instanceof WebAssembly.RuntimeError) throw e;
              versionStats.failed++;
              stats.errors.push({ name, section: section.name, offset: record.offset, version: header.readUInt32LE(32).toString(16), localVersion: p.readUInt16LE(start - 32), bytes: style.length, hex: style.subarray(0, 64).toString("hex"), error: e.message });
            }
            if (result) {
              const parsed = drawingStyleActual(call, style);
              if(parsed.known){
                const full=drawingStyleActual(call,style,5);
                assert.equal(full.consumed,parsed.consumed+6);
                assert.equal(full.extra,0);
                out.metadata.parsed++;
                out.metadata.reservedNonzero+=Number(style[parsed.consumed+4]!==0);
                if(style[parsed.consumed+4]!==0)out.metadata.reservedExamples.push({name,section:section.name,offset:record.offset,value:style[parsed.consumed+4]});
                out.metadata.alphaNonzero+=Number(style[parsed.consumed+5]!==0);
                for(let n=0;n<6;n++){
                  assert.throws(()=>call(53,Buffer.concat([Buffer.from([5]),style.subarray(0,parsed.consumed+n)])),/UnexpectedEnd/);
                  out.metadata.rejected++;
                }
                drawingStyleActual(call,style,5);
              }
              if (parsed.imageId !== null) out.images.push({ name, section: section.name, offset: record.offset, id: parsed.imageId });
              stats[parsed.known ? "known" : "unknown"]++;
              versionStats[parsed.known ? "full" : "unknown"]++;
              stats.flags[parsed.flags] = (stats.flags[parsed.flags] ?? 0) + 1;
              stats.extras[parsed.extra] = (stats.extras[parsed.extra] ?? 0) + 1;
            }
          } else stats.deferred++;
        }
        stack.push(record);
      }
    }
    if (!failed) out.hierarchyCompleted++;
  }
  assert.equal(out.hierarchyCompleted + out.security + new Set(out.failures.map(f => f.name)).size, out.files);
  for (const stats of Object.values(out.kinds)) assert.equal(stats.total, stats.deferred + stats.known + stats.unknown + stats.errors.length);
  // Pin the newly observed incompatibilities, not a claim that these files are corrupt.
  let expectedParsed = 0;
  for (const [name, { count, bytes, version }] of olderFixtures) {
    if (!existsSync(join(fileURLToPath(root), name))) continue;
    expectedParsed += count;
    assert.ok(!out.failures.some(f => f.name === name), "regression fixture must reach styles");
    const failures = out.kinds.$rec.errors.filter(e => e.name === name);
    assert.equal(failures.length, count);
    for (const failure of failures) {
      assert.equal(failure.bytes, bytes);
      assert.equal(failure.version, version);
      assert.equal(failure.error, "UnexpectedEnd");
    }
  }
  assert.equal(out.fillOnly.parsed, expectedParsed);
  if(existsSync(join(fileURLToPath(root),"group-drawing-02.hwp")))assert.equal(out.lines.groupDrawingLines,4);
  if(existsSync(join(fileURLToPath(root),"group-drawing-02.hwp")))assert.equal(out.rectangles.groupDrawingRects,30);
  if(existsSync(join(fileURLToPath(root),"basic/KTX.hwp")))assert.equal(out.ellipses.files["basic/KTX.hwp"],19);
  if(existsSync(join(fileURLToPath(root),"basic/KTX.hwp")))assert.equal(out.polygons.files["basic/KTX.hwp"],21);
  if(existsSync(join(fileURLToPath(root),"2025 행정업무운영 편람(최종).hwp")))assert.equal(out.curves.files["2025 행정업무운영 편람(최종).hwp"],2);
  const versions = Object.values(out.versions);
  const kinds = Object.values(out.kinds);
  for (const [versionField, kindField] of [["full", "known"], ["unknown", "unknown"]]) {
    assert.equal(versions.reduce((n, v) => n + v[versionField], 0), kinds.reduce((n, k) => n + k[kindField], 0));
  }
  assert.equal(versions.reduce((n, v) => n + v.failed, 0), kinds.reduce((n, k) => n + k.errors.length, 0));
  assert.equal(versions.reduce((n, v) => n + v.fillOnly, 0), out.fillOnly.parsed);
  // The same local version occurs in both layouts: it cannot select a tail by itself.
  if (expectedParsed > 0 && existsSync(join(fileURLToPath(root), "group-drawing-02.hwp"))) {
    assert.ok(Object.entries(out.versions).some(([key, v]) => key.endsWith("/1") && v.full > 0));
    assert.ok(Object.entries(out.versions).some(([key, v]) => key.endsWith("/1") && v.fillOnly > 0));
  }
  return out;
}
