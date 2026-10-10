const std = @import("std");

test "HWPX aligned joined continuation fold is bounded and allocation atomic" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p id='9'><p:run><p:t>AB</p:t></p:run></p:p><p:p id='10'><p:run><p:t>CD</p:t></p:run></p:p>");
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.mergeParagraph(0, 1));
    const baseline = try session.save();
    defer a.free(baseline);
    for (0..12) |cycle| {
        try std.testing.expect(try session.splitParagraph(0, 1, @as(u32, @intCast(cycle % 3)) * 2, 0));
        const values = session.sections[0].structure_values.?;
        const left = values.paragraphs[0].joined().?;
        const right = values.paragraphs[1].joined().?;
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, one: *const @import("paragraph_joined_values.zig").Joined, two: *const @import("paragraph_joined_values.zig").Joined) !void {
                var merged = try @import("paragraph_joined_merge.zig").prepare(allocator, tree, one, two, 10000);
                defer merged.deinit(allocator);
                try std.testing.expectEqual(one.pieces.len, merged.pieces.len);
            }
        }.run, .{ &session.sections[0].tree, &left, &right });
        try std.testing.expect(try session.mergeParagraph(0, 1));
        try std.testing.expectEqual(@as(usize, 2), session.sections[0].structure_values.?.paragraphs[0].pieces.?.len);
        const saved = try session.save();
        defer a.free(saved);
        try std.testing.expectEqualSlices(u8, baseline, saved);
    }
}
