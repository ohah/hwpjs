const std = @import("std");
const edit = @import("style_preservation.zig");
test "HWP5 extended outline session saves every kind with history and no-op" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    var history = try @import("editor_history.zig").History.init(a, session, 8, 4_000_000);
    defer history.deinit();
    const kinds = [_]@import("../../model/character_outline_kind.zig").Kind{ .solid, .dot, .thick, .dash, .dash_dot, .dash_dot_dot };
    for (kinds, 1..) |kind, expected| {
        const command: edit.Command = .{ .set_character_properties = .{ .section = 0, .paragraph = 5, .start_unit = 0, .end_unit = 2, .properties = .{ .outline_kind = kind } } };
        try std.testing.expect(try history.apply(session, command));
        try std.testing.expect(!try history.apply(session, command));
        const saved = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved.bytes);
        const reopened = try edit.Session.open(a, saved.bytes);
        defer reopened.close();
        const shapes = try reopened.characterShapes(a);
        defer a.free(shapes);
        const ranges = try reopened.characterRanges(a, 0, 5);
        defer a.free(ranges);
        try std.testing.expectEqual(@as(u3, @intCast(expected)), shapes[ranges[0].char_shape_id.?].outline_kind_raw);
        var reopened_history = try @import("editor_history.zig").History.init(a, reopened, 8, 4_000_000);
        defer reopened_history.deinit();
        try std.testing.expect(!try reopened_history.apply(reopened, command));
        try std.testing.expect(try history.undo(session));
        const original = try session.save(a, .{});
        defer a.free(original.bytes);
        try std.testing.expectEqualSlices(u8, input, original.bytes);
        try std.testing.expect(try history.redo(session));
        const redone = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(redone.bytes);
        try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
        try std.testing.expect(try history.undo(session));
    }
}
test "HWP5 effect session saves reopens and preserves history and no-op" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    var history = try @import("editor_history.zig").History.init(a, session, 8, 4_000_000);
    defer history.deinit();
    const command: edit.Command = .{ .set_character_properties = .{ .section = 0, .paragraph = 5, .start_unit = 0, .end_unit = 2, .properties = .{ .emboss = true, .engrave = true, .superscript = true, .subscript = true, .outline_kind = .solid } } };
    try std.testing.expect(try history.apply(session, command));
    try std.testing.expect(!try history.apply(session, command));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    var reopened_history = try @import("editor_history.zig").History.init(a, reopened, 8, 4_000_000);
    defer reopened_history.deinit();
    try std.testing.expect(!try reopened_history.apply(reopened, command));
    const shapes = try reopened.characterShapes(a);
    defer a.free(shapes);
    const ranges = try reopened.characterRanges(a, 0, 5);
    defer a.free(ranges);
    try std.testing.expectEqualDeep(@import("../../model/character_effect_flags.zig").Flags{ .emboss = true, .engrave = true, .superscript = true, .subscript = true }, shapes[ranges[0].char_shape_id.?].effects);
    try std.testing.expectEqual(@as(u3, 1), shapes[ranges[0].char_shape_id.?].outline_kind_raw);
    try std.testing.expect(try history.undo(session));
    const original = try session.save(a, .{});
    defer a.free(original.bytes);
    try std.testing.expectEqualSlices(u8, input, original.bytes);
    try std.testing.expect(try history.redo(session));
    var removed = command;
    removed.set_character_properties.properties = .{ .emboss = false, .engrave = false, .superscript = false, .subscript = false, .outline_kind = .none };
    try std.testing.expect(try history.apply(session, removed));
    try std.testing.expect(!try history.apply(session, removed));
}
test "HWP5 shade session preserves current values no-op save reopen and history" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    var history = try @import("editor_history.zig").History.init(a, session, 8, 4_000_000);
    defer history.deinit();
    const command: edit.Command = .{ .set_character_properties = .{ .section = 0, .paragraph = 5, .start_unit = 0, .end_unit = 2, .properties = .{ .shade = .{ .color = 0xffffff } } } };
    try std.testing.expect(try history.apply(session, command));
    try std.testing.expect(!try history.apply(session, command));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    var reopened_history = try @import("editor_history.zig").History.init(a, reopened, 8, 4_000_000);
    defer reopened_history.deinit();
    try std.testing.expect(!try reopened_history.apply(reopened, command));
    const shapes = try reopened.characterShapes(a);
    defer a.free(shapes);
    const ranges = try reopened.characterRanges(a, 0, 5);
    defer a.free(ranges);
    try std.testing.expectEqual(@as(u32, 0xffffff), shapes[ranges[0].char_shape_id.?].shade_color_raw);
    try std.testing.expect(try history.undo(session));
    const original = try session.save(a, .{});
    defer a.free(original.bytes);
    try std.testing.expectEqualSlices(u8, input, original.bytes);
    try std.testing.expect(!try history.undo(session));
    var invalid = command;
    invalid.set_character_properties.properties.shade = .{ .color = 0x1000000 };
    try std.testing.expectError(error.InvalidCharacterColor, history.apply(session, invalid));
    const after_failure = try session.save(a, .{});
    defer a.free(after_failure.bytes);
    try std.testing.expectEqualSlices(u8, input, after_failure.bytes);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    var removed = command;
    removed.set_character_properties.properties.shade = .none;
    try std.testing.expect(try history.apply(session, removed));
    try std.testing.expect(!try history.apply(session, removed));
}

test "HWP5 character properties preserve mixed sizes and rejected range redo" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    const session = try edit.Session.open(a, bytes);
    defer session.close();
    var history = try @import("editor_history.zig").History.init(a, session, 8, 4_000_000);
    defer history.deinit();
    for ([_]i32{ 1200, 2400 }, 0..) |size, index| {
        try std.testing.expect(try history.apply(session, .{ .set_character_properties = .{ .section = 0, .paragraph = 5, .start_unit = @intCast(index), .end_unit = @intCast(index + 1), .properties = .{ .size = size, .bold = false } } }));
    }
    const count = session.characterShapeCount();
    const command: edit.Command = .{ .set_character_properties = .{ .section = 0, .paragraph = 5, .start_unit = 0, .end_unit = 2, .properties = .{ .bold = true } } };
    try std.testing.expect(try history.apply(session, command));
    try std.testing.expectEqual(count + 2, session.characterShapeCount());
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    const ranges = try reopened.characterRanges(a, 0, 5);
    defer a.free(ranges);
    const shapes = try reopened.characterShapes(a);
    defer a.free(shapes);
    try std.testing.expectEqual(@as(i32, 1200), shapes[ranges[0].char_shape_id.?].height);
    try std.testing.expectEqual(@as(i32, 2400), shapes[ranges[1].char_shape_id.?].height);
    try std.testing.expectEqual(@as(u32, 1), ranges[0].end_unit);
    try std.testing.expectEqual(@as(u32, 1), ranges[1].start_unit);
    try std.testing.expect(shapes[ranges[0].char_shape_id.?].bold and shapes[ranges[1].char_shape_id.?].bold);
    try std.testing.expect(try history.undo(session));
    const before = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(before.bytes);
    var invalid = command;
    invalid.set_character_properties.start_unit = 2;
    invalid.set_character_properties.end_unit = 1;
    try std.testing.expectError(error.InvalidTextPosition, history.apply(session, invalid));
    const after = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(after.bytes);
    try std.testing.expectEqualSlices(u8, before.bytes, after.bytes);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}

test "HWP5 character properties with font command survives every allocation failure" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    var failing = std.testing.FailingAllocator.init(a, .{});
    const session = try edit.Session.open(failing.allocator(), bytes);
    defer session.close();
    const count = session.characterShapeCount();
    for (0..2000) |index| {
        failing.fail_index = failing.alloc_index + index;
        const result = session.apply(.{ .set_character_properties = .{ .section = 0, .paragraph = 5, .start_unit = 0, .end_unit = 2, .properties = .{ .size = 2400, .bold = true, .font_ids = .{ 0, null, null, null, null, null, null } } } });
        failing.fail_index = std.math.maxInt(usize);
        if (result) |_| {
            try std.testing.expectEqual(count + 1, session.characterShapeCount());
            const ranges = try session.characterRanges(a, 0, 5);
            defer a.free(ranges);
            const shapes = try session.characterShapes(a);
            defer a.free(shapes);
            try std.testing.expectEqual(@as(u16, 0), shapes[ranges[0].char_shape_id.?].font_ids[0]);
            std.debug.print("HWP5 font property failure sweep: {d} rejected allocation points before success\n", .{index});
            return;
        } else |err| {
            try std.testing.expectEqual(error.OutOfMemory, err);
            try std.testing.expectEqual(count, session.characterShapeCount());
            const unchanged = try session.save(a, .{});
            defer a.free(unchanged.bytes);
            try std.testing.expectEqualSlices(u8, bytes, unchanged.bytes);
        }
    }
    return error.AllocationFailureSweepIncomplete;
}
test "HWP5 character properties session saves reopens and preserves history" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    const session = try edit.Session.open(a, bytes);
    defer session.close();
    const original_count = session.characterShapeCount();
    var history = try @import("editor_history.zig").History.init(a, session, 8, 4_000_000);
    defer history.deinit();
    const command: edit.Command = .{ .set_character_properties = .{ .section = 0, .paragraph = 5, .start_unit = 0, .end_unit = 1, .properties = .{ .size = 2400, .bold = true } } };
    try std.testing.expect(try history.apply(session, command));
    try std.testing.expect(!try history.apply(session, command));
    try std.testing.expectEqual(original_count + 1, session.characterShapeCount());
    try std.testing.expect(try history.apply(session, .{ .set_character_properties = .{ .section = 0, .paragraph = 5, .start_unit = 0, .end_unit = 1, .properties = .{ .italic = true } } }));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    const ranges = try reopened.characterRanges(a, 0, 5);
    defer a.free(ranges);
    const shapes = try reopened.characterShapes(a);
    defer a.free(shapes);
    const shape = shapes[ranges[0].char_shape_id.?];
    try std.testing.expectEqual(@as(i32, 2400), shape.height);
    try std.testing.expect(shape.bold and shape.italic);
    try std.testing.expect(try history.undo(session));
    try std.testing.expect(try history.undo(session));
    const original = try session.save(a, .{});
    defer a.free(original.bytes);
    try std.testing.expectEqualSlices(u8, bytes, original.bytes);
    try std.testing.expectError(error.InvalidCharacterSize, history.apply(session, .{ .set_character_properties = .{ .section = 0, .paragraph = 5, .start_unit = 0, .end_unit = 1, .properties = .{ .size = -1 } } }));
    try std.testing.expect(try history.redo(session));
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}
