//! Source linkage plus current token order; does not cache source text as an edit model.
const std = @import("std");
const model = @import("../../model/document.zig");
pub const Anchor = struct { table_record_node: usize, control_node: usize, paragraph: usize, source_unit: usize, current_unit: u32 };
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, paragraphs: []const model.Paragraph) ![]Anchor {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    var current = try @import("current_paragraph_sources.zig").build(a, paragraphs);
    defer current.deinit(a);
    var out: std.ArrayList(Anchor) = .empty;
    errdefer out.deinit(a);
    for (links.items, 0..) |link, link_index| {
        if (link.header_id != @import("../body/control_rules.zig").table_id) continue;
        if (link.code != 11) return error.UnsupportedTableAnchorControl;
        const paragraph = current.get(@intCast(link.paragraph_node)) orelse return error.MissingCurrentTableAnchorOwner;
        const position = @import("current_control_anchor.zig").position(links.items, link_index, paragraphs[paragraph]) catch |err| switch (err) {
            error.MissingCurrentControlAnchor => return error.MissingCurrentTableAnchor,
            else => return err,
        };
        const lists = try @import("../body/table_lists.zig").Iterator.init(tree, link.control_node);
        try out.append(a, .{ .table_record_node = lists.table_node, .control_node = link.control_node, .paragraph = paragraph, .source_unit = link.start_unit, .current_unit = position });
    }
    return out.toOwnedSlice(a);
}
test "HWP5 table anchor current positions actual multiple hosts and allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table2.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer document.deinit(a);
    const expected = try read(a, raw, source.header.version(), document.sections[0].paragraphs);
    defer a.free(expected);
    try std.testing.expectEqual(@as(usize, 2), expected.len);
    for (expected) |row| try std.testing.expectEqual(row.source_unit, row.current_unit);
    var tree = try @import("source_tree.zig").parse(a, raw, source.header.version(), .{});
    defer tree.deinit(a);
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    const resolver = @import("current_control_anchor.zig");
    try std.testing.expectError(error.InvalidControlLinkIndex, resolver.position(links.items, links.items.len, document.sections[0].paragraphs[0]));
    for (links.items, 0..) |link, index| {
        if (link.header_id != @import("../body/control_rules.zig").table_id) continue;
        var missing = document.sections[0].paragraphs[expected[0].paragraph];
        missing.tokens = &.{};
        try std.testing.expectError(error.MissingCurrentControlAnchor, resolver.position(links.items, index, missing));
    }
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, p: []const model.Paragraph, rows: []const Anchor) !void {
            const values = try read(allocator, bytes, version, p);
            defer allocator.free(values);
            try std.testing.expectEqualDeep(rows, values);
        }
    }.run, .{ raw, source.header.version(), document.sections[0].paragraphs, expected });
}

test "HWP5 table anchor positions follow actual host prefix and saved reopen" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table2.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    const Session = @import("style_preservation.zig").Session;
    const session = try Session.open(a, bytes);
    defer session.close();
    const original = try session.tableAnchors(a, 0);
    defer a.free(original);
    const paragraph = original[0].paragraph;
    try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = paragraph, .start_unit = 0, .end_unit = 0, .utf8 = "표앞😀" } });
    const shifted = try session.tableAnchors(a, 0);
    defer a.free(shifted);
    try std.testing.expectEqual(original.len, shifted.len);
    for (original, shifted) |before, after| {
        try std.testing.expectEqual(before.table_record_node, after.table_record_node);
        try std.testing.expectEqual(before.source_unit, after.source_unit);
        try std.testing.expectEqual(before.current_unit + @as(u32, if (before.paragraph == paragraph) 4 else 0), after.current_unit);
    }
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try Session.open(a, saved.bytes);
    defer reopened.close();
    const restored = try reopened.tableAnchors(a, 0);
    defer a.free(restored);
    try std.testing.expectEqual(shifted.len, restored.len);
    for (shifted, restored) |before, after| {
        try std.testing.expectEqual(before.paragraph, after.paragraph);
        try std.testing.expectEqual(before.current_unit, after.current_unit);
        try std.testing.expectEqual(after.source_unit, after.current_unit);
    }
}
