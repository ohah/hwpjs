//! Test-only WASM bridge; not the public product ABI.
const std = @import("std");
const core = @import("hwpjs");
const a = std.heap.wasm_allocator;
var output: []u8 = &.{};
var last_error: []const u8 = "";

export fn alloc(n: usize) ?[*]u8 {
    return (a.alloc(u8, @max(n, 1)) catch return null).ptr;
}
export fn free(ptr: [*]u8, n: usize) void {
    a.free(ptr[0..@max(n, 1)]);
}
export fn result_ptr() usize {
    return if (output.len == 0) 0 else @intFromPtr(output.ptr);
}
export fn result_len() usize {
    return output.len;
}
export fn error_ptr() [*]const u8 {
    return last_error.ptr;
}
export fn error_len() usize {
    return last_error.len;
}
export fn close() void {
    a.free(output);
    output = &.{};
}

fn run(mode: u32, bytes: []const u8, limit: usize) ![]u8 {
    switch (mode) {
        0 => {
            const h = try core.hwp5.Header.parse(bytes);
            const fields = [_]u32{ h.version().raw, h.flags(), h.licenseFlags(), h.encryptVersion(), h.country() };
            const out = try a.alloc(u8, fields.len * 4);
            for (fields, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], v, .little);
            return out;
        },
        1 => return core.raw_deflate.decode(a, bytes, limit),
        2 => {
            // Exercise wasm32 subtraction bounds even for a 0xffffffff wire size.
            var records = core.hwp5.record.Iterator.init(bytes, .{
                .max_records = limit,
                .max_payload_bytes = std.math.maxInt(usize),
            });
            var out: std.ArrayList(u8) = .empty;
            defer out.deinit(a);
            while (try records.next()) |r| {
                for ([_]u32{ r.tag, r.level, @intCast(r.offset), @intCast(r.raw.len), @intCast(r.payload.len) }) |v| {
                    var word: [4]u8 = undefined;
                    std.mem.writeInt(u32, &word, v, .little);
                    try out.appendSlice(a, &word);
                }
            }
            return out.toOwnedSlice(a);
        },
        3 => {
            if (bytes.len < 256) return error.InvalidHeaderSize;
            const h = try core.hwp5.Header.parse(bytes[0..256]);
            return core.hwp5.stream.decode(a, &h, bytes[256..], limit);
        },
        4 => return @import("docinfo-probe.zig").run(a, bytes, limit),
        5 => return @import("resource-probe.zig").report(a, bytes, limit),
        6 => return @import("resource-probe.zig").decode(a, bytes, limit),
        7 => return @import("reference-probe.zig").run(a, bytes, limit),
        8 => return @import("body-probe.zig").run(a, bytes, limit),
        9 => return @import("metadata-probe.zig").validate(a, bytes, limit),
        10 => return @import("tree-probe.zig").run(a, bytes, limit),
        11 => return @import("section-probe.zig").inspect(a, bytes, limit),
        12 => {
            const note = try core.hwp5.body.NoteShape.parse(bytes);
            const out = try a.alloc(u8, 16);
            for ([_]i32{ note.separator_length, note.above, note.below, note.between }, 0..) |v, i| std.mem.writeInt(i32, out[i * 4 ..][0..4], v, .little);
            return out;
        },
        13 => return @import("link-probe.zig").run(a, bytes, limit, false),
        14 => return @import("column-probe.zig").fields(a, bytes),
        15 => return @import("list-probe.zig").run(a, bytes, limit),
        16 => return @import("link-probe.zig").run(a, bytes, limit, true),
        17 => return @import("table-probe.zig").inspect(a, bytes, limit),
        18 => return @import("table-probe.zig").zoneFields(a, bytes),
        19 => return @import("grid-probe.zig").run(a, bytes),
        20 => return @import("cell-probe.zig").run(a, bytes),
        21 => return @import("parameter-probe.zig").run(a, bytes, limit),
        22 => return @import("parameter-probe.zig").field(a, bytes, limit),
        23 => return @import("parameter-sources-probe.zig").run(a, bytes, limit),
        24 => return @import("document-probe.zig").run(a, bytes, limit),
        25 => return @import("container-probe.zig").run(a, bytes, limit),
        26 => return @import("preview-probe.zig").run(a, bytes),
        27 => return @import("summary-probe.zig").run(a, bytes, limit),
        28 => return @import("scripts-probe.zig").run(a, bytes),
        29 => return @import("xml-template-probe.zig").run(a, bytes, limit),
        30 => return @import("history-probe.zig").run(a, bytes, limit),
        31 => return @import("header-footer-probe.zig").run(a, bytes, limit),
        32 => return @import("number-control-probe.zig").run(a, bytes),
        33 => return @import("page-number-probe.zig").run(a, bytes),
        34 => return @import("index-mark-probe.zig").run(a, bytes, limit),
        35 => return @import("page-visibility-probe.zig").run(a, bytes, limit),
        36 => return @import("bookmark-probe.zig").run(a, bytes, limit),
        37 => return @import("char-overlap-probe.zig").run(a, bytes, limit),
        38 => return @import("link-probe.zig").identities(a, bytes, limit),
        39 => return @import("field-probe.zig").run(a, bytes, limit),
        40 => return @import("ruby-probe.zig").run(a, bytes, limit),
        41 => return @import("hidden-comment-probe.zig").run(a, bytes, limit),
        42 => return @import("note-control-probe.zig").run(a, bytes),
        43 => return @import("note-validation-probe.zig").run(a, bytes, limit),
        44 => return @import("equation-probe.zig").run(a, bytes),
        45 => return @import("equation-validation-probe.zig").run(a, bytes, limit),
        46 => return @import("ole-probe.zig").run(a, bytes),
        47 => return @import("ole-validation-probe.zig").run(a, bytes, limit),
        48 => return @import("storage-probe.zig").run(a, bytes),
        49 => return @import("container-probe.zig").specifiedStorage(a, bytes, limit),
        50 => return @import("shape-component-probe.zig").run(a, bytes),
        51 => return @import("shape-validation-probe.zig").run(a, bytes, limit),
        52 => return @import("shape-border-probe.zig").run(a, bytes),
        53 => return @import("drawing-style-probe.zig").run(a, bytes),
        54 => return @import("document-probe.zig").styled(a, bytes, limit),
        55 => return @import("container-probe.zig").styled(a, bytes, limit),
        56 => return @import("shape-line-probe.zig").run(a, bytes),
        57 => return @import("line-validation-probe.zig").run(a, bytes, limit),
        58 => return @import("shape-rectangle-probe.zig").run(a, bytes),
        59 => return @import("rectangle-validation-probe.zig").run(a, bytes, limit),
        60 => return @import("shape-ellipse-probe.zig").run(a, bytes),
        61 => return @import("ellipse-validation-probe.zig").run(a, bytes, limit),
        62 => return @import("shape-arc-probe.zig").run(a, bytes),
        63 => return @import("arc-validation-probe.zig").run(a, bytes, limit),
        64 => return @import("document-probe.zig").arced(a, bytes, limit),
        65 => return @import("container-probe.zig").arced(a, bytes, limit),
        66 => return @import("shape-polygon-probe.zig").run(a, bytes),
        67 => return @import("polygon-validation-probe.zig").run(a, bytes, limit),
        68 => return @import("document-probe.zig").polygoned(a, bytes, limit),
        69 => return @import("container-probe.zig").polygoned(a, bytes, limit),
        70 => return @import("shape-curve-probe.zig").run(a, bytes),
        71 => return @import("curve-validation-probe.zig").run(a, bytes, limit),
        72 => return @import("document-probe.zig").curved(a, bytes, limit),
        73 => return @import("container-probe.zig").curved(a, bytes, limit),
        74 => return @import("shape-picture-probe.zig").run(a, bytes),
        75 => return @import("picture-color-probe.zig").run(a, bytes),
        76 => return @import("picture-effects-probe.zig").run(a, bytes),
        77 => return @import("picture-additional-probe.zig").run(a, bytes, false),
        78 => return @import("picture-additional-probe.zig").run(a, bytes, true),
        79 => return @import("picture-validation-probe.zig").run(a, bytes, limit),
        80 => return @import("document-probe.zig").pictured(a, bytes, limit),
        81 => return @import("container-probe.zig").pictured(a, bytes, limit),
        82 => return @import("picture-validation-probe.zig").referenced(a, bytes, limit),
        83 => return @import("shape-connector-probe.zig").run(a, bytes),
        84 => return @import("group-info-probe.zig").run(a, bytes),
        85 => return @import("group-validation-probe.zig").run(a, bytes, limit),
        86 => return @import("video-data-probe.zig").run(a, bytes),
        87 => return @import("memo-shape-probe.zig").run(a, bytes),
        88 => return @import("list-probe.zig").runMemo(a, bytes, limit),
        89 => return @import("memo-field-probe.zig").run(a, bytes),
        90 => return @import("document-probe.zig").memo(a, bytes, limit),
        91 => return @import("memo-end-probe.zig").run(a, bytes),
        92 => return @import("document-probe.zig").memoEnd(a, bytes, limit),
        93 => return @import("list-probe.zig").runFlows(a, bytes, limit),
        94 => return @import("document-probe.zig").memoRange(a, bytes, limit),
        95 => return @import("forbidden-chars-probe.zig").run(a, bytes),
        96 => return @import("document-probe.zig").forbidden(a, bytes, limit),
        97 => return @import("container-probe.zig").forbidden(a, bytes, limit),
        98 => return @import("container-probe.zig").viewText(a, bytes, limit),
        99 => return @import("distribution-probe.zig").run(a, bytes),
        100 => return @import("revision-projection-probe.zig").run(a, bytes),
        101 => return @import("revision-groups-probe.zig").run(a, bytes, limit),
        102 => return @import("revision-text-probe.zig").run(a, bytes, limit),
        103 => return @import("revision-text-probe.zig").mapped(a, bytes, limit),
        104 => return @import("form-probe.zig").run(a, bytes),
        105 => return @import("form-property-probe.zig").run(a, bytes, limit),
        106 => return @import("form-control-probe.zig").run(a, bytes, limit),
        107 => return @import("form-links-probe.zig").run(a, bytes, limit),
        108 => return @import("form-schema-probe.zig").run(a, bytes, limit),
        109 => return @import("document-probe.zig").formed(a, bytes, limit),
        110 => return @import("container-probe.zig").formed(a, bytes, limit),
        111 => return @import("form-schema-probe.zig").semantics(a, bytes, limit),
        112 => return @import("form-max-length-probe.zig").run(a, bytes, limit),
        113 => return @import("history-date-probe.zig").run(a, bytes),
        114 => return @import("container-probe.zig").history(a, bytes, limit),
        115 => return @import("container-probe.zig").xmlTemplate(a, bytes, limit),
        116 => return @import("history-last-document-probe.zig").run(a, bytes, limit),
        117 => return @import("container-probe.zig").historyLastDocument(a, bytes, limit),
        118 => return @import("xml-input-probe.zig").run(a, bytes, limit),
        119 => return @import("xml-prolog-probe.zig").run(a, bytes, limit),
        120 => return @import("xml-reference-probe.zig").classes(a, bytes),
        121 => return @import("xml-reference-probe.zig").run(a, bytes, limit),
        122 => return @import("xml-tag-probe.zig").run(a, bytes, limit),
        123, 124 => return @import("xml-document-probe.zig").run(a, bytes, limit, mode == 124),
        125 => return @import("container-probe.zig").xmlDocuments(a, bytes, limit),
        126 => return @import("png-structure-probe.zig").run(a, bytes, limit),
        127 => return core.zlib.decode(a, bytes, limit),
        128 => return @import("zlib-prefix-probe.zig").run(a, bytes, limit),
        129 => return @import("png-filter-probe.zig").run(a, bytes, limit),
        130 => return @import("png-pixels-probe.zig").run(a, bytes, limit),
        131 => return @import("png-transparency-probe.zig").run(a, bytes, limit),
        132 => return @import("png-palette-metadata-probe.zig").run(a, bytes, limit),
        133 => return @import("png-sample-metadata-probe.zig").run(a, bytes, limit),
        134 => return @import("png-timestamp-probe.zig").run(a, bytes, limit),
        135 => return @import("png-text-probe.zig").run(a, bytes, limit),
        136 => return @import("png-compressed-text-probe.zig").run(a, bytes, limit),
        137 => return @import("bcp47-probe.zig").run(a, bytes, limit),
        138 => return @import("bcp47-registry-probe.zig").run(a, bytes, limit),
        139 => return @import("png-international-probe.zig").run(a, bytes, limit),
        140 => return @import("png-suggested-probe.zig").run(a, bytes, limit),
        141 => return @import("png-color-fixed-probe.zig").run(a, bytes, limit),
        142 => return @import("png-srgb-probe.zig").run(a, bytes, limit),
        143 => return @import("icc-header-probe.zig").run(a, bytes, limit),
        144 => return @import("icc-table-probe.zig").run(a, bytes, limit),
        145 => return @import("png-profile-probe.zig").run(a, bytes, limit),
        146 => return @import("icc-identifiers-probe.zig").run(a, bytes, limit),
        147 => return @import("icc-values-probe.zig").run(a, bytes, limit),
        148 => return @import("icc-v2-values-probe.zig").run(a, bytes, limit),
        149 => return @import("icc-registry-probe.zig").run(a, bytes, limit),
        150, 151 => return @import("icc-xyz-probe.zig").run(a, bytes, limit, mode == 151),
        152 => return @import("icc-xyz-tag-probe.zig").run(a, bytes, limit),
        153 => return @import("icc-curve-probe.zig").run(a, bytes, limit),
        154 => return @import("icc-parametric-probe.zig").run(a, bytes, limit),
        155, 156 => return @import("icc-trc-probe.zig").run(a, bytes, limit, if (mode == 155) .v2_2001 else .v4_2022),
        157 => return @import("icc-inverse-probe.zig").run(a, bytes, limit),
        158 => return @import("icc-forward-probe.zig").run(a, bytes, limit),
        159, 160 => return @import("icc-analytic-probe.zig").run(a, bytes, limit, if (mode == 160) .parametric_forward else .gamma_forward),
        161, 162 => return @import("icc-trc-forward-probe.zig").run(a, bytes, limit, if (mode == 161) .v2_2001 else .v4_2022),
        163 => return @import("icc-required-probe.zig").run(a, bytes, limit),
        164, 165 => return @import("icc-mluc-probe.zig").run(a, bytes, limit, if (mode == 164) .v4_2022 else .v2_2001),
        166 => return @import("icc-unicode-probe.zig").run(a, bytes, limit),
        167 => return @import("icc-selection-probe.zig").run(a, bytes, limit),
        168 => return @import("iso639-probe.zig").run(a, bytes, limit),
        169 => return @import("language-history-probe.zig").run(a, bytes, limit),
        170 => return @import("icc-selection-probe.zig").runWithMatching(a, bytes, limit, .iana_direct),
        171 => return @import("icc-adaptation-probe.zig").run(a, bytes, limit, false),
        172 => return @import("icc-adaptation-probe.zig").run(a, bytes, limit, true),
        173 => return @import("icc-matrix-probe.zig").run(a, bytes, limit, false),
        174 => return @import("icc-matrix-probe.zig").run(a, bytes, limit, true),
        175 => return @import("icc-model-probe.zig").run(a, bytes, limit),
        176 => return @import("icc-model-forward-probe.zig").run(a, bytes, limit),
        177 => return @import("icc-normalized-inverse-probe.zig").run(a, bytes, limit),
        178 => return @import("icc-analytic-probe.zig").run(a, bytes, limit, .gamma_inverse),
        179 => return @import("icc-parametric-domain-probe.zig").run(a, bytes, limit),
        180 => return @import("icc-segments-probe.zig").run(a, bytes, limit),
        181 => return @import("icc-partition-probe.zig").run(a, bytes, limit),
        182 => return @import("icc-power-level-probe.zig").run(a, bytes, limit),
        183 => return @import("icc-root-compare-probe.zig").run(a, bytes, limit, false),
        184 => return @import("icc-root-compare-probe.zig").run(a, bytes, limit, true),
        185 => return @import("icc-root-location-probe.zig").run(a, bytes, limit),
        186 => return @import("icc-level-locations-probe.zig").run(a, bytes, limit),
        187 => return @import("icc-level-order-probe.zig").run(a, bytes, limit),
        188 => return @import("icc-root-order-probe.zig").run(a, bytes, limit),
        189 => return @import("icc-power-clip-probe.zig").run(a, bytes, limit),
        190 => return @import("icc-rational-power-probe.zig").run(a, bytes, limit),
        191 => return @import("icc-parametric-jump-probe.zig").run(a, bytes, limit),
        192 => return @import("icc-parametric-trend-probe.zig").run(a, bytes, limit),
        193 => return @import("icc-linear-preimage-probe.zig").run(a, bytes, limit),
        194 => return @import("icc-preimage-choice-probe.zig").run(a, bytes, limit),
        195 => return @import("icc-normalized-power-level-probe.zig").run(a, bytes, limit),
        196 => return @import("icc-normalized-root-compare-probe.zig").run(a, bytes, limit),
        197 => return @import("icc-normalized-locations-probe.zig").point(a, bytes, limit),
        198 => return @import("icc-normalized-locations-probe.zig").active(a, bytes, limit),
        199 => return @import("icc-power-preimage-probe.zig").run(a, bytes, limit),
        200 => return @import("icc-parametric-preimage-probe.zig").run(a, bytes, limit),
        201 => return @import("icc-preimage-bounds-probe.zig").run(a, bytes, limit),
        202 => return @import("icc-attained-inverse-probe.zig").run(a, bytes, limit),
        203 => return @import("icc-nearest-range-probe.zig").run(a, bytes, limit),
        204 => return @import("icc-linear-range-probe.zig").run(a, bytes, limit),
        205, 206 => return @import("icc-power-range-probe.zig").run(a, bytes, limit, mode == 206),
        207 => return @import("icc-parametric-range-probe.zig").run(a, bytes, limit),
        208 => return @import("icc-ordinate-order-probe.zig").run(a, bytes, limit),
        209 => return @import("icc-power-nearest-probe.zig").run(a, bytes, limit),
        210 => return @import("icc-ordinate-distance-probe.zig").run(a, bytes, limit),
        211 => return @import("icc-parametric-nearest-probe.zig").run(a, bytes, limit),
        212 => return @import("icc-parametric-inverse-probe.zig").run(a, bytes, limit),
        213, 214 => return @import("icc-trc-inverse-probe.zig").run(a, bytes, limit, if (mode == 213) .v2_2001 else .v4_2022),
        215 => return @import("icc-model-inverse-probe.zig").run(a, bytes, limit),
        216 => return @import("icc-fraction-matrix-inverse-probe.zig").run(a, bytes, limit),
        217, 218 => return @import("icc-wide-linear-target-probe.zig").run(a, bytes, limit, mode == 218),
        219 => return @import("icc-sampled-wide-inverse-probe.zig").run(a, bytes, limit),
        220 => return @import("icc-gamma-wide-inverse-probe.zig").run(a, bytes, limit),
        221 => return @import("icc-wide-power-level-probe.zig").run(a, bytes, limit),
        222 => return @import("icc-normalized-root-compare-probe.zig").runWide(a, bytes, limit),
        223 => return @import("icc-normalized-locations-probe.zig").pointWide(a, bytes, limit),
        224 => return @import("icc-normalized-locations-probe.zig").activeWide(a, bytes, limit),
        225 => return @import("icc-power-preimage-probe.zig").runWide(a, bytes, limit),
        226 => return @import("icc-linear-preimage-probe.zig").runWide(a, bytes, limit),
        227 => return @import("icc-extended-fraction-float-probe.zig").run(a, bytes, limit),
        228 => return @import("icc-parametric-preimage-probe.zig").runWide(a, bytes, limit),
        229 => return @import("icc-extended-root-order-probe.zig").run(a, bytes, limit),
        230 => return @import("icc-preimage-bounds-probe.zig").runWide(a, bytes, limit),
        231 => return @import("icc-attained-inverse-probe.zig").runWide(a, bytes, limit),
        232 => return @import("icc-ordinate-order-probe.zig").runWide(a, bytes, limit),
        233 => return @import("icc-ordinate-distance-probe.zig").runWide(a, bytes, limit),
        234 => return @import("icc-parametric-nearest-probe.zig").runWide(a, bytes, limit),
        235 => return @import("icc-parametric-inverse-probe.zig").runWide(a, bytes, limit),
        238 => return @import("icc-model-inverse-probe.zig").runFraction(a, bytes, limit),
        239 => return @import("png-profile-inspection-probe.zig").run(a, bytes, limit),
        240 => return @import("png-required-inspection-probe.zig").run(a, bytes, limit),
        241 => return @import("png-payload-inspection-probe.zig").run(a, bytes, limit),
        242 => return @import("png-payload-inspection-probe.zig").runExtended(a, bytes, limit),
        243 => return @import("png-payload-inspection-probe.zig").runUnicode(a, bytes, limit),
        244 => return @import("container-probe.zig").images(a, bytes, limit),
        245 => return @import("jpeg-framing-probe.zig").run(a, bytes, limit),
        246 => return @import("jpeg-header-probe.zig").run(a, bytes, limit),
        247 => return @import("jpeg-tables-probe.zig").run(a, bytes, limit),
        248 => return @import("jpeg-store-probe.zig").run(a, bytes, limit),
        249 => return @import("jpeg-progressive-probe.zig").run(a, bytes, limit),
        250 => return @import("jpeg-structure-probe.zig").run(a, bytes, limit),
        251 => return @import("jpeg-codec-probe.zig").run(a, bytes, limit),
        252 => return @import("jpeg-sequential-probe.zig").run(a, bytes, limit),
        253 => return @import("jpeg-scan-probe.zig").run(a, bytes, limit),
        254 => return @import("jpeg-frame-probe.zig").run(a, bytes, limit),
        255 => return @import("jpeg-dequant-probe.zig").run(a, bytes, limit),
        256 => return @import("jpeg-frame-probe.zig").runDequantized(a, bytes, limit),
        257 => return @import("jpeg-idct-probe.zig").run(a, bytes, limit, true),
        258 => return @import("jpeg-idct-probe.zig").run(a, bytes, limit, false),
        259 => return @import("jpeg-frame-probe.zig").runSamples(a, bytes, limit),
        260 => return @import("jpeg-planes-probe.zig").run(a, bytes, limit),
        261 => return @import("jpeg-jfif-probe.zig").run(a, bytes, limit, false),
        262 => return @import("jpeg-jfif-probe.zig").run(a, bytes, limit, true),
        263 => return @import("jpeg-jfxx-probe.zig").run(a, bytes, limit),
        264 => return @import("jpeg-planes-probe.zig").runJfxx(a, bytes, limit),
        265 => return @import("jpeg-jfif-layout-probe.zig").run(a, bytes, limit),
        266...268 => return @import("jpeg-jfif-colour-probe.zig").run(a, bytes, limit, mode),
        236, 237 => return @import("icc-trc-inverse-probe.zig").runWide(a, bytes, limit, if (mode == 236) .v2_2001 else .v4_2022),
        else => return error.InvalidMode,
    }
}
export fn probe(mode: u32, ptr: [*]const u8, len: usize, limit: usize) bool {
    close();
    last_error = "";
    output = run(mode, ptr[0..len], limit) catch |err| {
        last_error = @errorName(err);
        return false;
    };
    return true;
}
