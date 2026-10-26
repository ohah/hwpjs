const std = @import("std");
const edit = @import("hwp5/edit/style_preservation.zig");
const Source = @import("hwp5/text_source.zig").Source;

comptime {
    _ = @import("hwp5_unselected_memo_probe.zig");
}

fn firstScalar(a: std.mem.Allocator, session: *const edit.Session, section: usize) !struct { paragraph: usize, start: u32, end: u32 } {
    for (0..try session.paragraphCount(section)) |paragraph| {
        const bytes = try session.copyText(a, section, paragraph);
        defer a.free(bytes);
        var tokens = try @import("hwp5/body/text.zig").Iterator.init(bytes);
        while (try tokens.next()) |token| {
            if (token.value != .text) continue;
            const code = std.mem.readInt(u16, token.raw[0..2], .little);
            const width: u32 = if (code >= 0xd800 and code <= 0xdbff) 2 else 1;
            return .{ .paragraph = paragraph, .start = @intCast(token.start_unit), .end = @as(u32, @intCast(token.start_unit)) + width };
        }
    }
    return error.MissingOrdinaryScalar;
}

test "memo format actual sections preserve other sources and native history" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/aift.hwp", a, .limited(16_000_000));
    defer a.free(input);
    for (0..3) |section| {
        const session = try edit.Session.open(a, input);
        defer session.close();
        var history = try @import("hwp5/edit/editor_history.zig").History.init(a, session, 4, 16_000_000);
        defer history.deinit();
        const target = try firstScalar(a, session, section);
        const command: edit.Command = .{ .set_character_properties = .{ .section = section, .paragraph = target.paragraph, .start_unit = target.start, .end_unit = target.end, .properties = .{ .size = 2400, .bold = true } } };
        try std.testing.expect(try history.apply(session, command));
        try std.testing.expect(!try history.apply(session, command));
        const saved = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved.bytes);
        var before = try Source.open(a, input);
        defer before.deinit();
        var after = try Source.open(a, saved.bytes);
        defer after.deinit();
        for (0..3) |other| {
            if (other == section) continue;
            const old = try before.decodeSection(a, other);
            defer a.free(old);
            const current = try after.decodeSection(a, other);
            defer a.free(current);
            try std.testing.expectEqualSlices(u8, old, current);
        }
        const reopened = try edit.Session.open(a, saved.bytes);
        defer reopened.close();
        var reopened_history = try @import("hwp5/edit/editor_history.zig").History.init(a, reopened, 4, 16_000_000);
        defer reopened_history.deinit();
        try std.testing.expect(!try reopened_history.apply(reopened, command));
        try std.testing.expect(try history.undo(session));
        const undone = try session.save(a, .{});
        defer a.free(undone.bytes);
        try std.testing.expectEqualSlices(u8, input, undone.bytes);
        try std.testing.expect(try history.redo(session));
        const redone = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(redone.bytes);
        try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    }
}
