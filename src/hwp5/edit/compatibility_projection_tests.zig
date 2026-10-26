const std = @import("std");
const edit = @import("style_preservation.zig");
const compat = @import("character_decoration_compat.zig");

test "HWP5 legacy strike actual fixture supports disable reopen and exact undo" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    const shapes = try session.characterShapes(a);
    defer a.free(shapes);
    try std.testing.expectEqual(@as(u2, 2), shapes[9].underline_kind_raw);
    try std.testing.expectEqual(@as(u3, 0), shapes[9].strike_kind_raw);
    const effective = compat.resolve(shapes[9]);
    try std.testing.expectEqual(@as(?bool, true), effective.strike_enabled);
    try std.testing.expectEqual(@as(u2, 0), effective.underline_kind);
    try std.testing.expectEqual(@as(?u32, shapes[9].underline_color_raw), effective.strike_color);
    var found = false;
    for (0..try session.paragraphCount(0)) |p| {
        const ranges = try session.characterRanges(a, 0, p);
        defer a.free(ranges);
        for (ranges) |range| {
            if (range.char_shape_id != 9 or range.end_unit <= range.start_unit) continue;
            var history = try @import("editor_history.zig").History.init(a, session, 4, 4_000_000);
            defer history.deinit();
            const on: edit.Command = .{ .set_character_properties = .{ .section = 0, .paragraph = p, .start_unit = range.start_unit, .end_unit = range.end_unit, .properties = .{ .strike_enabled = true } } };
            try std.testing.expect(!try history.apply(session, on));
            var unsafe = on;
            unsafe.set_character_properties.properties = .{ .underline_kind = .bottom };
            try std.testing.expectError(error.UnsupportedLegacyCharacterDecorations, history.apply(session, unsafe));
            const refused = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(refused.bytes);
            try std.testing.expectEqualSlices(u8, input, refused.bytes);
            var off = on;
            off.set_character_properties.properties.strike_enabled = false;
            try std.testing.expect(try history.apply(session, off));
            try std.testing.expect(!try history.apply(session, off));
            const saved = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(saved.bytes);
            const reopened = try edit.Session.open(a, saved.bytes);
            defer reopened.close();
            const current = try reopened.characterRanges(a, 0, p);
            defer a.free(current);
            const updated = try reopened.characterShapes(a);
            defer a.free(updated);
            var checked = false;
            for (current) |r| if (r.start_unit == range.start_unit) {
                try std.testing.expectEqual(@as(?bool, false), compat.resolve(updated[r.char_shape_id.?]).strike_enabled);
                checked = true;
            };
            try std.testing.expect(checked);
            try std.testing.expect(try history.undo(session));
            const restored = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(restored.bytes);
            try std.testing.expectEqualSlices(u8, input, restored.bytes);
            try std.testing.expect(try history.redo(session));
            const redone = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(redone.bytes);
            try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
            found = true;
            break;
        }
        if (found) break;
    }
    try std.testing.expect(found);
}

test "HWP5 heading projection actual outline retains raw and extended levels" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/outline.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    const shapes = try session.paragraphShapes(a);
    defer a.free(shapes);
    for ([_]usize{ 18, 16, 17 }, [_]u32{ 7, 8, 9 }) |id, level| {
        try std.testing.expectEqual(@as(u2, 1), shapes[id].heading_kind);
        try std.testing.expectEqual(@as(u3, 6), shapes[id].packed_heading_level);
        try std.testing.expectEqual(@as(?u32, level), shapes[id].extended_heading_level);
        try std.testing.expectEqual(level, shapes[id].heading_level);
    }
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try std.testing.expectEqualSlices(u8, input, saved.bytes);
}

test "HWP5 compatibility projection keeps explicit zero and refuses ambiguous decoration edits" {
    const a = std.testing.allocator;
    var payload: [58]u8 = @splat(0);
    std.mem.writeInt(u32, payload[0..4], 6 << 25, .little);
    const Shape = @import("../docinfo/para_shape.zig").ParaShape;
    const modern = try Shape.parse(&payload, .{ .raw = 0x05010000 });
    try std.testing.expectEqual(@as(u32, 0), modern.effectiveLevel());
    const absent = try Shape.parse(payload[0..54], .{ .raw = 0x05010000 });
    try std.testing.expectEqual(@as(u32, 6), absent.effectiveLevel());
    const older = try Shape.parse(&payload, .{ .raw = 0x05000300 });
    try std.testing.expectEqual(@as(u32, 6), older.effectiveLevel());
    var bytes: [68]u8 = @splat(0);
    std.mem.writeInt(u32, bytes[46..50], 8, .little);
    const writer = @import("character_property_payload.zig");
    try std.testing.expectError(error.UnsupportedLegacyCharacterDecorations, writer.write(a, &bytes, .{ .raw = 0x05000107 }, .{ .underline_kind = .bottom }, 100));
    try std.testing.expectError(error.UnsupportedLegacyCharacterDecorations, writer.write(a, &bytes, .{ .raw = 0x05000107 }, .{ .underline_color = 0x123456 }, 100));
    const unchanged = try writer.write(a, &bytes, .{ .raw = 0x05000107 }, .{ .underline_kind = .none }, 100);
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, &bytes, unchanged);
}

test "HWP5 decoration compatibility preserves every nonlegacy kind and independent source fields" {
    const Shape = @import("character_display_shapes.zig").Shape;
    for (0..4) |underline| for (0..8) |strike| {
        const raw: Shape = .{ .id = 0, .height = 1000, .bold = false, .italic = false, .underline_kind_raw = @intCast(underline), .underline_style_raw = 1, .underline_color_raw = 0x123456, .strike_kind_raw = @intCast(strike), .strike_style_raw = 0, .strike_color_raw = 0xabcdef };
        const effective = compat.resolve(raw);
        if (underline == 2 and strike == 0) {
            try std.testing.expectEqual(@as(?bool, true), effective.strike_enabled);
            try std.testing.expectEqual(@as(u4, 1), effective.strike_style);
            try std.testing.expectEqual(@as(?u32, 0x123456), effective.strike_color);
        } else {
            try std.testing.expectEqual(if (strike > 1) @as(?bool, null) else strike == 1, effective.strike_enabled);
            try std.testing.expectEqual(@as(u4, 0), effective.strike_style);
            try std.testing.expectEqual(@as(?u32, 0xabcdef), effective.strike_color);
            try std.testing.expectEqual(raw.underline_kind_raw, effective.underline_kind);
        }
        try std.testing.expectEqual(@as(u4, 1), raw.underline_style_raw);
        try std.testing.expectEqual(@as(u32, 0x123456), raw.underline_color_raw);
    };
}
