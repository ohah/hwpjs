//! Known derived arrays on explicit physical paragraph owners only. Unknown
//! ownership rejects the whole edit; opaque source is never a deletion target.
const std = @import("std");
const trees = @import("xml_part_tree.zig");
const fields = @import("table_xml_fields.zig");
const caches = @import("line_segments.zig");
const writer = @import("xml_source_writer.zig");
const known_flags: u32 = 3 | (0x3f << 16) | 0x80000000;
pub fn validate(a: std.mem.Allocator, t: *const trees.Tree, paragraph: usize) !void {
    var seen = false;
    var child = t.elements[paragraph].first_child;
    while (child) |node| : (child = t.elements[node].next_sibling) {
        if (!fields.childIs(t, node, "linesegarray")) continue;
        try @import("source_table_grid_owner_path.zig").admitCacheParagraph(t, paragraph);
        if (seen or !@import("element_whitespace_gaps.zig").empty(t, node)) return error.UnsupportedSourceLineCache;
        seen = true;
        var report: caches.Report = .{};
        var tag = try @import("xml_part_attributes.zig").parseStartTag(a, t, node);
        defer tag.deinit(a);
        try caches.noteArrayTag(tag, .{}, &report);
        if (report.array_other_attributes != 0) return error.UnsupportedSourceLineCache;
        var segment = t.elements[node].first_child;
        var previous: u32 = 0;
        var count: usize = 0;
        while (segment) |i| : (segment = t.elements[i].next_sibling) {
            if (!fields.childIs(t, i, "lineseg") or t.elements[i].first_child != null or !@import("element_whitespace_gaps.zig").empty(t, i)) return error.UnsupportedSourceLineCache;
            var st = try @import("xml_part_attributes.zig").parseStartTag(a, t, i);
            defer st.deinit(a);
            try caches.noteSegmentTag(a, st, .{}, &report);
            if (report.segment_other_attributes != 0) return error.UnsupportedSourceLineCache;
            for (report.field_missing) |missing| if (missing != 0) return error.UnsupportedSourceLineCache;
            const start = (try fields.optionalUnsigned(a, t, i, "textpos", 4096)).?;
            const height = try signed(a, t, i, "vertsize");
            const text_height = try signed(a, t, i, "textheight");
            const width = try signed(a, t, i, "horzsize");
            const baseline = try signed(a, t, i, "baseline");
            const flags = (try fields.optionalUnsigned(a, t, i, "flags", 4096)).?;
            if ((count != 0 and start < previous) or height <= 0 or text_height <= 0 or width < 0 or baseline < 0 or baseline > height or flags & ~known_flags != 0) return error.UnsupportedSourceLineCache;
            previous = start;
            count += 1;
        }
    }
}
fn signed(a: std.mem.Allocator, t: *const trees.Tree, node: usize, name: []const u8) !i64 {
    const v = try t.attributeValue(a, node, "", name) orelse return error.UnsupportedSourceLineCache;
    return fields.margin(a, v, 4096);
}
pub fn write(a: std.mem.Allocator, source: []const u8, limit: usize) ![]u8 {
    var t = try @import("section_tree.zig").parse(a, source, 0, 0, .{ .max_xml_bytes = limit });
    defer t.deinit(a);
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    for (t.elements, 0..) |_, p| if (fields.childIs(&t, p, "p")) try validate(a, &t, p);
    for (t.elements, 0..) |e, i| if (fields.childIs(&t, i, "linesegarray")) {
        const parent = e.parent orelse return error.UnsupportedSourceLineCache;
        if (!fields.childIs(&t, parent, "p")) return error.UnsupportedSourceLineCache;
        try changes.append(a, .{ .start = e.start_tag.start, .end = e.end, .text = "", .serialized_xml = "" });
    };
    return writer.write(a, source, changes.items, limit);
}
