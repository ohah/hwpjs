const std = @import("std");

test "actual sungeo retains every exact shape control-data envelope and permits body input" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/basic/sungeo.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    var count: usize = 0;
    var empty: usize = 0;
    var mirrored: usize = 0;
    for (0..source.section_count) |section| {
        const bytes = try source.decodeSection(a, section);
        defer a.free(bytes);
        var tree = try @import("hwp5/body/tree.zig").Tree.parseTextPreview(a, bytes, source.header.version(), .{});
        defer tree.deinit(a);
        for (tree.nodes, 0..) |node, index| {
            if (node.record.framing.tag != 87) continue;
            const policy = @import("hwp5/edit/control_data_policy.zig");
            const kind = try policy.validateRetainedNode(a, tree, index);
            if (kind == .shape_empty_set) empty += 1;
            if (kind == .shape_mirrored_strings) {
                mirrored += 1;
                var doc = try @import("hwp5/parameters/parser.zig").Document.parse(a, node.record.framing.payload, .{ .header_layout = .observed6, .null_layout = .observed_empty });
                defer doc.deinit(a);
                const at = @intFromPtr(doc.nodes[3].raw.ptr) - @intFromPtr(bytes.ptr);
                const id = std.mem.readInt(u16, bytes[at..][0..2], .little);
                std.mem.writeInt(u16, bytes[at..][0..2], 0x6064, .little);
                try std.testing.expectError(error.UnsupportedControlData, policy.validateRetainedNode(a, tree, index));
                std.mem.writeInt(u16, bytes[at..][0..2], id, .little);
            }
            if (kind == .shape_empty_set or kind == .shape_mirrored_strings) {
                const parent = tree.nodes[index].parent;
                tree.nodes[index].parent = null;
                try std.testing.expectError(error.UnsupportedControlDataOwner, policy.validateRetainedNode(a, tree, index));
                tree.nodes[index].parent = parent;
            }
            count += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 60), count);
    try std.testing.expectEqual(@as(usize, 24), empty);
    try std.testing.expectEqual(@as(usize, 24), mirrored);
    const session = try @import("hwp5/edit/style_preservation.zig").Session.open(a, input);
    defer session.close();
    var history = try @import("hwp5/edit/editor_history.zig").History.init(a, session, 4, 8_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = 0, .start_unit = 0, .end_unit = 0, .utf8 = "본문검증" } }));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try @import("hwp5/edit/style_preservation.zig").Session.open(a, saved.bytes);
    defer reopened.close();
    const current = try session.copyText(a, 0, 0);
    defer a.free(current);
    const recovered = try reopened.copyText(a, 0, 0);
    defer a.free(recovered);
    try std.testing.expectEqualSlices(u8, current, recovered);
    try std.testing.expect(try history.undo(session));
    const undone = try session.save(a, .{});
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, input, undone.bytes);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}
