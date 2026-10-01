const std = @import("std");
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;

test "HWP5 native history restores complex fixture fields formats and empty nested text" {
    const a = std.testing.allocator;
    const Case = struct { name: []const u8, command: edit.Command };
    const cases = [_]Case{
        .{ .name = "chart", .command = .{ .splice_text = .{ .section = 0, .paragraph = 19, .start_unit = 1, .end_unit = 2, .utf8 = "2" } } },
        .{ .name = "issue144-fields-crossing-lineseg-boundary", .command = .{ .splice_text = .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 4, .utf8 = "필드😀" } } },
        .{ .name = "charshape", .command = .{ .set_character_format = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 1, .char_shape_id = 0 } } },
        .{ .name = "charshape", .command = .{ .set_style = .{ .section = 0, .paragraph = 1, .style_id = 1 } } },
        .{ .name = "table", .command = .{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "빈셀😀" } } },
        .{ .name = "software", .command = .{ .splice_text = .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 0, .utf8 = "중첩😀" } } },
    };
    for (cases) |case| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{case.name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        const session = try edit.Session.open(a, input);
        defer session.close();
        var history = try History.init(a, session, 2, 8_000_000);
        defer history.deinit();
        try std.testing.expect(try history.apply(session, case.command));
        const edited = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(edited.bytes);
        try std.testing.expect(!std.mem.eql(u8, input, edited.bytes));
        try std.testing.expect(try history.undo(session));
        const original = try session.save(a, .{});
        defer a.free(original.bytes);
        try std.testing.expect(!original.layout_requires_reflow);
        try std.testing.expectEqualSlices(u8, input, original.bytes);
        try std.testing.expect(try history.redo(session));
        const redone = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(redone.bytes);
        try std.testing.expectEqualSlices(u8, edited.bytes, redone.bytes);
    }
}
