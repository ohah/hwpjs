const std = @import("std");
const Session = @import("style_preservation.zig").Session;
const Source = @import("drawing_style_sources.zig").Source;
const deinit = @import("drawing_style_sources.zig").deinit;
const Options = @import("../body/drawing_style_validation.zig").Options;
test "drawing style session actual input checkpoint save and query allocation failures" {
    const a = std.testing.allocator;
    const selected: Options = .{ .tail = .alpha_shadow };
    for ([_][]const u8{ "matrix", "shapecontainer-2", "textbox", "shaperect" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(input);
        const session = try Session.open(a, input);
        defer session.close();
        const before = try session.drawingStyleSources(a, 0, selected);
        defer deinit(a, before);
        try std.testing.expect(before.len > 0);
        try std.testing.expectError(error.InvalidSection, session.drawingStyleSources(a, 999, selected));
        const anchors = try session.drawingAnchors(a, 0);
        defer a.free(anchors);
        try std.testing.expect(anchors.len > 0);
        const checkpoint = try session.createCheckpoint(8_000_000);
        defer checkpoint.deinit();
        try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = anchors[0].paragraph, .start_unit = 0, .end_unit = 0, .utf8 = "스타일😀" } });
        const after = try session.drawingStyleSources(a, 0, selected);
        defer deinit(a, after);
        try std.testing.expectEqualDeep(before, after);
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, s: *const Session, options: Options, expected: []const Source) !void {
                const actual = try s.drawingStyleSources(allocator, 0, options);
                defer deinit(allocator, actual);
                try std.testing.expectEqualDeep(expected, actual);
            }
        }.run, .{ session, selected, before });
        const saved = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved.bytes);
        const reopened = try Session.open(a, saved.bytes);
        defer reopened.close();
        const restored = try reopened.drawingStyleSources(a, 0, selected);
        defer deinit(a, restored);
        try std.testing.expectEqual(before.len, restored.len);
        var original_source = try @import("../text_source.zig").Source.open(a, input);
        defer original_source.deinit();
        var saved_source = try @import("../text_source.zig").Source.open(a, saved.bytes);
        defer saved_source.deinit();
        const original_raw = try original_source.decodeSection(a, 0);
        defer a.free(original_raw);
        const saved_raw = try saved_source.decodeSection(a, 0);
        defer a.free(saved_raw);
        var original_tree = try @import("../body/tree.zig").Tree.parse(a, original_raw, original_source.header.version(), .{});
        defer original_tree.deinit(a);
        var saved_tree = try @import("../body/tree.zig").Tree.parse(a, saved_raw, saved_source.header.version(), .{});
        defer saved_tree.deinit(a);
        // Node indices belong to one parse, not a cross-save object identifier.
        for (before, restored) |old, new| {
            try std.testing.expectEqualSlices(u8, original_tree.nodes[old.component_node].record.framing.payload, saved_tree.nodes[new.component_node].record.framing.payload);
            try std.testing.expectEqualSlices(u8, original_tree.nodes[old.owner_node].record.framing.payload, saved_tree.nodes[new.owner_node].record.framing.payload);
            var expected = old;
            expected.component_node = new.component_node;
            expected.owner_node = new.owner_node;
            try std.testing.expectEqualDeep(expected, new);
        }
        try session.restoreCheckpoint(checkpoint);
        const undone = try session.drawingStyleSources(a, 0, selected);
        defer deinit(a, undone);
        try std.testing.expectEqualDeep(before, undone);
        const original = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(original.bytes);
        try std.testing.expectEqualSlices(u8, input, original.bytes);
        try session.restoreCheckpoint(checkpoint);
        const redone = try session.drawingStyleSources(a, 0, selected);
        defer deinit(a, redone);
        try std.testing.expectEqualDeep(before, redone);
        const redo_saved = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(redo_saved.bytes);
        try std.testing.expectEqualSlices(u8, saved.bytes, redo_saved.bytes);
    }
}
