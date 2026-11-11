//! Table 62 derived paragraph layout. Remove known caches; never invent metrics.
const std = @import("std");
const body = @import("../body/reader.zig");
const Tree = @import("../body/tree.zig").Tree;
const known_flags: u32 = 3 | (0x3f << 16) | 0x80000000;
fn admitCacheParagraph(tree: Tree, paragraph: usize) !void {
    var p = paragraph;
    var depth: usize = 0;
    while (tree.nodes[p].parent) |control| {
        depth += 1;
        if (depth > 64) return error.UnsupportedSourceLineCache;
        const value = tree.nodes[control].record.value;
        if (value != .control_header or value.control_header.id != @import("../body/control_rules.zig").id("tbl ")) return error.UnsupportedSourceLineCache;
        p = tree.nodes[control].parent orelse return error.UnsupportedSourceLineCache;
        if (tree.nodes[p].record.value != .header) return error.UnsupportedSourceLineCache;
    }
}
pub fn validate(tree: Tree, paragraph: usize) !void {
    const header = tree.nodes[paragraph].record.value.header;
    const children = try @import("../body/paragraph_children.zig").collect(tree, paragraph);
    const count = if (children.metadata.lines) |lines| lines.count() else 0;
    if (children.metadata.lines != null or header.line_segment_count != 0) try admitCacheParagraph(tree, paragraph);
    if (count != header.line_segment_count) return error.UnsupportedSourceLineCache;
    if (children.metadata.lines) |lines| {
        var previous: u32 = 0;
        for (0..lines.count()) |i| {
            const v = lines.get(i).?;
            if (v.start > header.characterUnits() or (i != 0 and v.start < previous) or v.height <= 0 or v.text_height <= 0 or v.width < 0 or v.baseline < 0 or v.baseline > v.height or (v.flags & ~known_flags) != 0) return error.UnsupportedSourceLineCache;
            previous = v.start;
        }
    }
}
pub fn write(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, limit: usize) ![]u8 {
    var tree = try @import("source_tree.zig").parse(a, source, version, .{});
    defer tree.deinit(a);
    for (tree.nodes, 0..) |node, i| if (node.record.value == .header) try validate(tree, i);
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    for (tree.nodes) |node| {
        const record = node.record.framing;
        if (node.record.value == .line_segments) {
            const parent = node.parent orelse return error.UnsupportedSourceLineCache;
            if (tree.nodes[parent].record.value != .header) return error.UnsupportedSourceLineCache;
            continue;
        }
        if (record.raw.len > limit -| out.items.len) return error.LimitExceeded;
        if (node.record.value == .header and node.record.value.header.line_segment_count != 0) {
            const begin = out.items.len;
            try out.appendSlice(a, record.raw);
            const at = begin + record.raw.len - record.payload.len + body.Header.line_segment_count_offset;
            std.mem.writeInt(u16, out.items[at..][0..2], 0, .little);
        } else try out.appendSlice(a, record.raw);
    }
    return a.dupe(u8, out.items);
}
