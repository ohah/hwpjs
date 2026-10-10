//! Selection, resource provenance, save/reopen and history on real input.
const std = @import("std");
const editor = @import("editor_session.zig");
const history_module = @import("editor_history.zig");

test "HWPX underline session supports all kinds mixed properties and exact history" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var history = try history_module.History.init(&session, 16, 8_000_000);
    defer history.deinit();
    const original_spans = try @import("character_style_snapshot.zig").read(&session, 0, 2);
    defer a.free(original_spans);
    var applied: usize = 0;
    for ([_]@import("../model/document.zig").CharacterUnderlineKind{ .bottom, .center, .top, .none }) |kind| {
        const command: history_module.Command = .{ .kind = .character_properties, .paragraph = 2, .start = 0, .deleted = 1, .inserted = "", .character_properties = .{ .underline_kind = kind } };
        try std.testing.expect(try history.apply(&session, command));
        applied += 1;
        try std.testing.expect(!try history.apply(&session, command));
        const current = try @import("character_style_snapshot.zig").read(&session, 0, 2);
        defer a.free(current);
        try std.testing.expectEqual(@as(u32, 1), current[0].end_unit);
        for (current) |span| {
            if (span.start_unit < 1 or span.start_unit == span.end_unit) continue;
            var found = false;
            for (original_spans) |original| if (original.start_unit <= span.start_unit and span.start_unit < original.end_unit) {
                try std.testing.expectEqual(original.char_shape_id, span.char_shape_id);
                found = true;
                break;
            };
            try std.testing.expect(found);
        }
        const size: history_module.Command = .{ .kind = .character_properties, .paragraph = 2, .start = 0, .deleted = 1, .inserted = "", .character_properties = .{ .size = 2400 + @as(i32, @intCast(applied)) } };
        try std.testing.expect(try history.apply(&session, size));
        applied += 1;
        try std.testing.expect(!try history.apply(&session, command));
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        try std.testing.expect(!try reopened.setCharacterProperties(0, 2, 0, 1, .{ .underline_kind = kind }));
        const same = try reopened.save();
        defer a.free(same);
        try std.testing.expectEqualSlices(u8, saved, same);
        try std.testing.expect(try history.undo(&session));
        var invalid = command;
        invalid.start = std.math.maxInt(u32);
        try std.testing.expectError(error.InvalidTextPosition, history.apply(&session, invalid));
        try std.testing.expect(try history.redo(&session));
        const redone = try session.save();
        defer a.free(redone);
        try std.testing.expectEqualSlices(u8, saved, redone);
    }
    for (0..applied) |_| try std.testing.expect(try history.undo(&session));
    try std.testing.expect(!try history.undo(&session));
    const original = try session.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, input, original);
}
