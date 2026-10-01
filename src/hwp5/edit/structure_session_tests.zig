const std = @import("std");
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const a = std.testing.allocator;

fn expectSaved(session: *edit.Session, expected: []const u8) !void {
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try std.testing.expectEqualSlices(u8, expected, saved.bytes);
}

test "native structural split all allocation failures preserve model and redo" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            const session = try edit.Session.open(allocator, bytes);
            defer session.close();
            var history = try History.init(allocator, session, 4, 8_000_000);
            defer history.deinit();
            const command: edit.Command = .{ .split_paragraph = .{ .section = 0, .paragraph = 1, .at_unit = 1, .end_unit = 3 } };
            _ = history.apply(session, command) catch |err| {
                try expectSaved(session, bytes);
                try std.testing.expectEqual(@as(usize, 0), history.stack.undo.items.len);
                try std.testing.expectEqual(@as(usize, 0), history.stack.redo.items.len);
                return err;
            };
            const split = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(split.bytes);
            try std.testing.expect(try history.undo(session));
            try expectSaved(session, bytes);
            _ = history.apply(session, command) catch |err| {
                try expectSaved(session, bytes);
                try std.testing.expectEqual(@as(usize, 0), history.stack.undo.items.len);
                try std.testing.expectEqual(@as(usize, 1), history.stack.redo.items.len);
                try std.testing.expect(try history.redo(session));
                try expectSaved(session, split.bytes);
                return err;
            };
            try expectSaved(session, split.bytes);
            try std.testing.expectEqual(@as(usize, 0), history.stack.redo.items.len);
        }
    }.run, .{input});
}

test "native structural split checkpoint growth refusal restores topology and redo" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    var history = try History.init(a, session, 4, 8_000_000);
    defer history.deinit();
    const command: edit.Command = .{ .split_paragraph = .{ .section = 0, .paragraph = 1, .at_unit = 1 } };
    const count = try session.paragraphCount(0);
    try std.testing.expect(try history.apply(session, command));
    const split = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(split.bytes);
    try std.testing.expect(try history.undo(session));
    history.max_checkpoint_bytes = try session.checkpointSize(std.math.maxInt(usize));
    try std.testing.expectError(error.LimitExceeded, history.apply(session, command));
    try std.testing.expectEqual(count, try session.paragraphCount(0));
    try expectSaved(session, input);
    try std.testing.expectEqual(@as(usize, 1), history.stack.redo.items.len);
    try std.testing.expect(try history.redo(session));
    try expectSaved(session, split.bytes);
}

test "native structural split saves actual root nested and empty cells and history restores source" {
    const cases = [_]struct { name: []const u8, paragraph: usize, at: u32 }{
        .{ .name = "charshape", .paragraph = 1, .at = 1 },
        .{ .name = "software", .paragraph = 2, .at = 1 },
        .{ .name = "table", .paragraph = 1, .at = 0 },
    };
    for (cases) |case| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{case.name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        const session = try edit.Session.open(a, input);
        defer session.close();
        const count = try session.paragraphCount(0);
        var history = try History.init(a, session, 4, 8_000_000);
        defer history.deinit();
        try std.testing.expect(try history.apply(session, .{ .split_paragraph = .{ .section = 0, .paragraph = case.paragraph, .at_unit = case.at } }));
        try std.testing.expectEqual(count + 1, try session.paragraphCount(0));
        try std.testing.expectError(error.LayoutReflowRequired, session.save(a, .{}));
        const saved = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved.bytes);
        const reopened = try edit.Session.open(a, saved.bytes);
        defer reopened.close();
        try std.testing.expectEqual(count + 1, try reopened.paragraphCount(0));
        for (0..count + 1) |paragraph| {
            const expected = try session.copyText(a, 0, paragraph);
            defer a.free(expected);
            const actual = try reopened.copyText(a, 0, paragraph);
            defer a.free(actual);
            try std.testing.expectEqualSlices(u8, expected, actual);
        }
        try std.testing.expect(try history.undo(session));
        try std.testing.expectEqual(count, try session.paragraphCount(0));
        const restored = try session.save(a, .{});
        defer a.free(restored.bytes);
        try std.testing.expectEqualSlices(u8, input, restored.bytes);
        try std.testing.expect(!restored.layout_requires_reflow);
        try std.testing.expect(try history.redo(session));
        const repeated = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(repeated.bytes);
        try std.testing.expectEqualSlices(u8, saved.bytes, repeated.bytes);
        try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = case.paragraph + 1, .start_unit = 0, .end_unit = 0, .utf8 = "후속😀" } }));
        const typed = try session.copyText(a, 0, case.paragraph + 1);
        defer a.free(typed);
        try std.testing.expect(std.mem.startsWith(u8, typed, &.{ 0xc4, 0xd6, 0x8d, 0xc1, 0x3d, 0xd8, 0x00, 0xde }));
        _ = try history.apply(session, .{ .set_character_format = .{ .section = 0, .paragraph = case.paragraph + 1, .start_unit = 0, .end_unit = 1, .char_shape_id = 0 } });
        const formatted = try session.copyText(a, 0, case.paragraph + 1);
        defer a.free(formatted);
        try std.testing.expectEqualSlices(u8, typed, formatted);
        try std.testing.expect(try history.apply(session, .{ .split_paragraph = .{ .section = 0, .paragraph = case.paragraph + 1, .at_unit = 2 } }));
        try std.testing.expectEqual(count + 2, try session.paragraphCount(0));
        const second_split = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(second_split.bytes);
        const second_reopened = try edit.Session.open(a, second_split.bytes);
        defer second_reopened.close();
        try std.testing.expectEqual(count + 2, try second_reopened.paragraphCount(0));
        try std.testing.expect(try history.undo(session));
        try std.testing.expectEqual(count + 1, try session.paragraphCount(0));
    }
}
