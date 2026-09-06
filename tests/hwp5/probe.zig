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
