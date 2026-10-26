const std = @import("std");
test "actual bookmark anchors follow host edits retain source positions and release allocations" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/basic/sungeo.hwp", a, .limited(8_000_000));
    defer a.free(input);
    const Session = @import("hwp5/edit/style_preservation.zig").Session;
    const session = try Session.open(a, input);
    defer session.close();
    var count: usize = 0;
    for (0..session.sectionCount()) |section| {
        const rows = try session.structuralAnchors(a, section);
        defer a.free(rows);
        for (rows) |row| if (row.kind == .bookmark) {
            try std.testing.expect(section > 0);
            try std.testing.expectEqual(@as(usize, 0), row.paragraph);
            count += 1;
        };
    }
    try std.testing.expectEqual(@as(usize, 12), count);
    const before = try session.structuralAnchors(a, 1);
    defer a.free(before);
    try session.apply(.{ .splice_text = .{ .section = 1, .paragraph = 0, .start_unit = 0, .end_unit = 0, .utf8 = "책갈피😀" } });
    const after = try session.structuralAnchors(a, 1);
    defer a.free(after);
    for (before, after) |old, current| {
        try std.testing.expectEqual(old.source_unit, current.source_unit);
        try std.testing.expectEqual(old.current_unit + 5, current.current_unit);
    }
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, s: *const Session, expected: []const @import("hwp5/edit/structural_anchor_positions.zig").Anchor) !void {
            const rows = try s.structuralAnchors(allocator, 1);
            defer allocator.free(rows);
            try std.testing.expectEqualDeep(expected, rows);
        }
    }.run, .{ session, after });
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 1);
    defer a.free(raw);
    var tree = try @import("hwp5/edit/source_tree.zig").parse(a, raw, source.header.version(), .{});
    defer tree.deinit(a);
    const bookmark = for (before) |row| {
        if (row.kind == .bookmark) break row.control_node;
    } else return error.TestExpectedEqual;
    const policy = @import("hwp5/edit/bookmark_anchor_policy.zig");
    try policy.validate(a, tree, bookmark);
    const parent = tree.nodes[bookmark + 1].parent;
    tree.nodes[bookmark + 1].parent = null;
    try std.testing.expectError(error.UnsupportedBookmarkAnchor, policy.validate(a, tree, bookmark));
    tree.nodes[bookmark + 1].parent = parent;
    const end = tree.nodes[bookmark].subtree_end;
    tree.nodes[bookmark].subtree_end -= 1;
    try std.testing.expectError(error.UnsupportedBookmarkAnchor, policy.validate(a, tree, bookmark));
    tree.nodes[bookmark].subtree_end = end;
    const payload = tree.nodes[bookmark + 1].record.framing.payload;
    const offset = @intFromPtr(payload.ptr) - @intFromPtr(raw.ptr) + 6;
    const item = std.mem.readInt(u16, raw[offset..][0..2], .little);
    std.mem.writeInt(u16, raw[offset..][0..2], 0x4001, .little);
    try std.testing.expectError(error.UnsupportedControlData, policy.validate(a, tree, bookmark));
    std.mem.writeInt(u16, raw[offset..][0..2], item, .little);
}
