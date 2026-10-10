const std = @import("std");
const Session = @import("style_preservation.zig").Session;

test "HWP5 font creation saves reopens and exchanges checkpoint names" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/facename.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    const session = try Session.open(a, bytes);
    defer session.close();
    const checkpoint = try session.createCheckpoint(4_000_000);
    defer checkpoint.deinit();
    const id = try session.ensureFont(.hangul, "Hwpjs Test Font");
    try std.testing.expectEqual(id, try session.ensureFont(.hangul, "Hwpjs Test Font"));
    const latin = try session.ensureFont(.latin, "Hwpjs Test Font");
    try std.testing.expectEqual(id, try session.ensureFont(.hangul, "Hwpjs Test Font"));
    try std.testing.expectError(error.InvalidFontName, session.ensureFont(.hangul, ""));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try Session.open(a, saved.bytes);
    defer reopened.close();
    try std.testing.expectEqual(id, try reopened.ensureFont(.hangul, "Hwpjs Test Font"));
    try std.testing.expectEqual(latin, try reopened.ensureFont(.latin, "Hwpjs Test Font"));
    const unchanged = try reopened.save(a, .{ .allow_stale_layout = true });
    defer a.free(unchanged.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, unchanged.bytes);
    try session.restoreCheckpoint(checkpoint);
    const undone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, bytes, undone.bytes);
    try session.restoreCheckpoint(checkpoint);
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}

test "HWP5 new font applies to actual text and checkpoint restores original file" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    const session = try Session.open(a, bytes);
    defer session.close();
    const checkpoint = try session.createCheckpoint(4_000_000);
    defer checkpoint.deinit();
    const id = try session.ensureFont(.hangul, "Hwpjs Test Font");
    try session.apply(.{ .set_character_properties = .{ .section = 0, .paragraph = 5, .start_unit = 0, .end_unit = 2, .properties = .{ .font_ids = .{ id, null, null, null, null, null, null } } } });
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try Session.open(a, saved.bytes);
    defer reopened.close();
    const ranges = try reopened.characterRanges(a, 0, 5);
    defer a.free(ranges);
    const shapes = try reopened.characterShapes(a);
    defer a.free(shapes);
    try std.testing.expectEqual(@as(u16, @intCast(id)), shapes[ranges[0].char_shape_id.?].font_ids[0]);
    try std.testing.expectEqual(id, try reopened.ensureFont(.hangul, "Hwpjs Test Font"));
    try session.restoreCheckpoint(checkpoint);
    const undone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, bytes, undone.bytes);
    try session.restoreCheckpoint(checkpoint);
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}

test "HWP5 named font history rolls back failed creation and preserves redo" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    const session = try Session.open(a, bytes);
    defer session.close();
    var history = try @import("editor_history.zig").History.init(a, session, 8, 4_000_000);
    defer history.deinit();
    const command: @import("style_preservation.zig").Command = .{ .set_character_font_name = .{ .section = 0, .paragraph = 5, .start_unit = 0, .end_unit = 2, .language = .hangul, .name = "Hwpjs Named Font" } };
    var empty = command;
    empty.set_character_font_name.end_unit = 0;
    try std.testing.expect(!try history.apply(session, empty));
    try std.testing.expectError(error.InvalidFontName, session.ensureFont(.latin, ""));
    try std.testing.expect(try history.apply(session, command));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try std.testing.expect(try history.undo(session));
    var invalid = command;
    invalid.set_character_font_name.name = "Rejected Font";
    invalid.set_character_font_name.start_unit = 2;
    invalid.set_character_font_name.end_unit = 1;
    try std.testing.expectError(error.InvalidTextPosition, history.apply(session, invalid));
    try std.testing.expectError(error.InvalidTextPosition, session.apply(invalid));
    const original = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(original.bytes);
    try std.testing.expectEqualSlices(u8, bytes, original.bytes);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}

test "HWP5 named font command leaves original bytes at every allocation failure" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    var failing = std.testing.FailingAllocator.init(a, .{});
    const session = try Session.open(failing.allocator(), bytes);
    defer session.close();
    for (0..2000) |index| {
        failing.fail_index = failing.alloc_index + index;
        const result = session.apply(.{ .set_character_font_name = .{ .section = 0, .paragraph = 5, .start_unit = 0, .end_unit = 2, .language = .hangul, .name = "Hwpjs Failure Font" } });
        failing.fail_index = std.math.maxInt(usize);
        if (result) |_| {
            const saved = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(saved.bytes);
            try std.testing.expect(!std.mem.eql(u8, bytes, saved.bytes));
            const reopened = try Session.open(a, saved.bytes);
            defer reopened.close();
            std.debug.print("HWP5 named font rejected allocation points: {d}\n", .{index});
            return;
        } else |err| {
            try std.testing.expectEqual(error.OutOfMemory, err);
            const saved = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(saved.bytes);
            try std.testing.expectEqualSlices(u8, bytes, saved.bytes);
        }
    }
    return error.AllocationFailureSweepIncomplete;
}
