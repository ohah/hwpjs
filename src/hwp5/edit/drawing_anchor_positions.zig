//! Current gso anchors reuse source provenance and the shared token ordinal resolver.
const std = @import("std");
const Paragraph = @import("../../model/document.zig").Paragraph;
pub const Anchor = struct { control_node: usize, component_node: usize, paragraph: usize, source_unit: usize, current_unit: u32 };
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, paragraphs: []const Paragraph) ![]Anchor {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    var owners = try @import("current_paragraph_sources.zig").build(a, paragraphs);
    defer owners.deinit(a);
    var out: std.ArrayList(Anchor) = .empty;
    errdefer out.deinit(a);
    for (links.items, 0..) |link, index| {
        if (link.header_id != @import("../body/control_rules.zig").drawing_id) continue;
        if (link.code != 11) return error.UnsupportedDrawingAnchorControl;
        const paragraph = owners.get(@intCast(link.paragraph_node)) orelse return error.MissingCurrentDrawingOwner;
        const unit = try @import("current_control_anchor.zig").position(links.items, index, paragraphs[paragraph]);
        const component = (try @import("../body/owned_record.zig").find(tree, link.control_node, @import("../body/shape_component.zig").tag)) orelse return error.MissingShapeComponent;
        try out.append(a, .{ .control_node = link.control_node, .component_node = component, .paragraph = paragraph, .source_unit = link.start_unit, .current_unit = unit });
    }
    return out.toOwnedSlice(a);
}
test "HWP5 drawing anchors actual host prefix source preservation and allocation failures" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "shaperect", "textbox", "matrix" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(input);
        const session = try @import("style_preservation.zig").Session.open(a, input);
        defer session.close();
        const before = try session.drawingAnchors(a, 0);
        defer a.free(before);
        try std.testing.expect(before.len > 0);
        const target = before[0].paragraph;
        try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = target, .start_unit = 0, .end_unit = 0, .utf8 = "도형😀" } });
        const after = try session.drawingAnchors(a, 0);
        defer a.free(after);
        try std.testing.expectEqual(before.len, after.len);
        for (before, after) |old, current| {
            try std.testing.expectEqual(old.control_node, current.control_node);
            try std.testing.expectEqual(old.component_node, current.component_node);
            try std.testing.expectEqual(old.source_unit, current.source_unit);
            try std.testing.expectEqual(old.current_unit + @as(u32, if (old.paragraph == target) 4 else 0), current.current_unit);
        }
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, s: *const @import("style_preservation.zig").Session, expected: []const Anchor) !void {
                const rows = try s.drawingAnchors(allocator, 0);
                defer allocator.free(rows);
                try std.testing.expectEqualDeep(expected, rows);
            }
        }.run, .{ session, after });
        const saved = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved.bytes);
        const reopened = try @import("style_preservation.zig").Session.open(a, saved.bytes);
        defer reopened.close();
        const restored = try reopened.drawingAnchors(a, 0);
        defer a.free(restored);
        try std.testing.expectEqual(after.len, restored.len);
        for (after, restored) |old, current| {
            try std.testing.expectEqual(old.paragraph, current.paragraph);
            try std.testing.expectEqual(old.current_unit, current.current_unit);
            try std.testing.expectEqual(current.source_unit, current.current_unit);
        }
    }
}
