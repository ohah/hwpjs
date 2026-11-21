//! Own test-only authoring. Reuse the verified real-body fixture; move the object
//! 1500 source units below its paragraph anchor so top margin has a preceding band.
//! This is not a product writer or a replacement for actual-font reflow evidence.
const std = @import("std");
const Kind = @import("object_outer_margins.zig").Kind;
pub const vertical_offset: i32 = 1500;
pub fn prepare(a: std.mem.Allocator, original: []const u8, kind: Kind) ![]u8 {
    const base = try @import("object_outer_margins_fixture.zig").prepare(a, original, kind, 1);
    defer a.free(base);
    var source = try @import("../text_source.zig").Source.open(a, base);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var tree = try @import("source_tree.zig").parse(a, raw, source.header.version(), .{});
    defer tree.deinit(a);
    const rows = try @import("drawing_sources.zig").read(a, raw, source.header.version());
    defer a.free(rows);
    var owner: ?usize = null;
    const expected = if (kind == .picture) @import("../body/control_rules.zig").id("$pic") else @import("../body/control_rules.zig").id("$rec");
    for (rows) |row| if (row.kind_id == expected) {
        if (owner != null) return error.AmbiguousVerticalFixture;
        owner = row.control_node;
    };
    const node = owner orelse return error.MissingVerticalFixture;
    const r = tree.nodes[node].record.framing;
    const at = r.offset + r.raw.len - r.payload.len + 8;
    const draft = try a.dupe(u8, raw);
    defer a.free(draft);
    std.mem.writeInt(i32, draft[at..][0..4], vertical_offset, .little);
    const encoded = if (source.header.has(.compressed)) try @import("../../compression/raw_deflate.zig").encodeStored(a, draft, 32 * 1024 * 1024) else try a.dupe(u8, draft);
    defer a.free(encoded);
    return @import("../../cfb/stream_replace.zig").rebuildExact(a, &source.file, "/BodyText/Section0", encoded, .{ .max_output_bytes = 64 * 1024 * 1024 });
}
