const std = @import("std");
const edit = @import("style_preservation.zig");
fn payload(a: std.mem.Allocator, bytes: []const u8, id: u32) ![]u8 {
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const info = try @import("../stream.zig").decode(a, &source.header, try source.file.readStream(a, "/DocInfo"), 4_000_000);
    defer a.free(info);
    var records = @import("../record.zig").Iterator.init(info, .{});
    var index: u32 = 0;
    while (try records.next()) |record| {
        if (record.tag != 21) continue;
        if (index == id) return a.dupe(u8, record.payload);
        index += 1;
    }
    return error.InvalidCharacterShapeReference;
}

test "HWP5 underline selection preserves complete resource payload and exact history" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    var history = try @import("editor_history.zig").History.init(a, session, 8, 4_000_000);
    defer history.deinit();
    const ranges = try session.characterRanges(a, 0, 5);
    defer a.free(ranges);
    const original_id = ranges[0].char_shape_id.?;
    const original = try payload(a, input, original_id);
    defer a.free(original);
    try std.testing.expect((original[46] & 12) != 12);
    const command: edit.Command = .{ .set_character_properties = .{ .section = 0, .paragraph = 5, .start_unit = 0, .end_unit = 1, .properties = .{ .underline_kind = .top } } };
    try std.testing.expect(try history.apply(session, command));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const current = try session.characterRanges(a, 0, 5);
    defer a.free(current);
    try std.testing.expectEqual(@as(u32, 1), current[0].end_unit);
    const actual = try payload(a, saved.bytes, current[0].char_shape_id.?);
    defer a.free(actual);
    const expected = try a.dupe(u8, original);
    defer a.free(expected);
    expected[46] = (expected[46] & ~@as(u8, 12)) | 12;
    try std.testing.expectEqualSlices(u8, expected, actual);
    try std.testing.expect(!try history.apply(session, command));
    try std.testing.expectError(error.UnsupportedCharacterUnderlineKind, session.apply(.{ .set_character_properties = .{ .section = 0, .paragraph = 5, .start_unit = 0, .end_unit = 0, .properties = .{ .underline_kind = .center } } }));
    try std.testing.expect(try history.undo(session));
    const restored = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(restored.bytes);
    try std.testing.expectEqualSlices(u8, input, restored.bytes);
    var invalid = command;
    invalid.set_character_properties.start_unit = 2;
    invalid.set_character_properties.end_unit = 1;
    try std.testing.expectError(error.InvalidTextPosition, history.apply(session, invalid));
    const refused = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(refused.bytes);
    try std.testing.expectEqualSlices(u8, restored.bytes, refused.bytes);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    try reopened.apply(command);
    const stable = try reopened.save(a, .{ .allow_stale_layout = true });
    defer a.free(stable.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, stable.bytes);
}
