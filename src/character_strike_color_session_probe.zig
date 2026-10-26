const std = @import("std");
test {
    _ = @import("hwp5/edit/character_decoration_patch_merge.zig");
}

test "legacy decoration chain recolors disabled shared slot and restores explicit strike without stale intents" {
    const a = std.testing.allocator;
    const edit = @import("hwp5/edit/style_preservation.zig");
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    var history = try @import("hwp5/edit/editor_history.zig").History.init(a, session, 16, 4_000_000);
    defer history.deinit();
    var command: edit.Command = .{ .set_character_properties = .{ .section = 0, .paragraph = 2, .start_unit = 6, .end_unit = 7, .properties = .{ .strike_color = 0x123456 } } };
    try std.testing.expect(try history.apply(session, command));
    command.set_character_properties.properties = .{ .strike_enabled = false };
    try std.testing.expect(try history.apply(session, command));
    command.set_character_properties.properties = .{ .underline_color = 0xabcdef };
    try std.testing.expect(try history.apply(session, command));
    try std.testing.expect(!try history.apply(session, command));
    command.set_character_properties.properties = .{ .strike_enabled = true };
    try std.testing.expect(try history.apply(session, command));
    const shapes = try session.characterShapes(a);
    defer a.free(shapes);
    const ranges = try session.characterRanges(a, 0, 2);
    defer a.free(ranges);
    const id = for (ranges) |range| {
        if (range.start_unit <= 6 and range.end_unit > 6) break range.char_shape_id.?;
    } else return error.MissingTestRange;
    const view = @import("hwp5/edit/character_decoration_compat.zig").resolve(shapes[id]);
    try std.testing.expectEqual(@as(?bool, true), view.strike_enabled);
    try std.testing.expectEqual(@as(?u32, 0xefcdab), view.strike_color);
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    try std.testing.expectEqual(@as(u32, 0x05000107), reopened.fileVersion());
    var again = try @import("hwp5/edit/editor_history.zig").History.init(a, reopened, 8, 4_000_000);
    defer again.deinit();
    command.set_character_properties.properties = .{ .strike_color = 0xabcdef };
    try std.testing.expect(!try again.apply(reopened, command));
    for (0..4) |_| try std.testing.expect(try history.undo(session));
    const original = try session.save(a, .{});
    defer a.free(original.bytes);
    try std.testing.expectEqualSlices(u8, input, original.bytes);
    for (0..4) |_| try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}

test "strike color session HWP5 preserves legacy and modern files with no-op history and reopen" {
    const a = std.testing.allocator;
    const edit = @import("hwp5/edit/style_preservation.zig");
    for ([_]struct { path: []const u8, paragraph: usize, start: u32 }{
        .{ .path = "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", .paragraph = 2, .start = 6 },
        .{ .path = "legacy/rust/crates/hwp-core/tests/fixtures/strikethrough.hwp", .paragraph = 1, .start = 0 },
    }) |fixture| {
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, fixture.path, a, .limited(4_000_000));
        defer a.free(input);
        const session = try edit.Session.open(a, input);
        defer session.close();
        var history = try @import("hwp5/edit/editor_history.zig").History.init(a, session, 8, 4_000_000);
        defer history.deinit();
        const command: edit.Command = .{ .set_character_properties = .{ .section = 0, .paragraph = fixture.paragraph, .start_unit = fixture.start, .end_unit = fixture.start + 1, .properties = .{ .strike_color = 0x123456, .bold = true } } };
        try std.testing.expect(try history.apply(session, command));
        try std.testing.expect(!try history.apply(session, command));
        const saved = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved.bytes);
        const reopened = try edit.Session.open(a, saved.bytes);
        defer reopened.close();
        try std.testing.expectEqual(session.fileVersion(), reopened.fileVersion());
        var again = try @import("hwp5/edit/editor_history.zig").History.init(a, reopened, 8, 4_000_000);
        defer again.deinit();
        try std.testing.expect(!try again.apply(reopened, command));
        try std.testing.expect(try history.undo(session));
        const original = try session.save(a, .{});
        defer a.free(original.bytes);
        try std.testing.expectEqualSlices(u8, input, original.bytes);
        var invalid = command;
        invalid.set_character_properties.properties.strike_color = 0x1000000;
        try std.testing.expectError(error.InvalidCharacterColor, history.apply(session, invalid));
        if (fixture.paragraph == 2) {
            var absent = command;
            absent.set_character_properties.paragraph = 1;
            absent.set_character_properties.start_unit = 0;
            absent.set_character_properties.end_unit = 1;
            try std.testing.expectError(error.MissingCharacterStrikeColorField, history.apply(session, absent));
            const unchanged = try session.save(a, .{});
            defer a.free(unchanged.bytes);
            try std.testing.expectEqualSlices(u8, input, unchanged.bytes);
        }
        try std.testing.expect(try history.redo(session));
        const redone = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(redone.bytes);
        try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    }
}

test "strike color session HWPX preserves color intent through bold save reopen and history" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("hwpx/editor_session.zig").open(a, input, .{});
    defer session.deinit();
    var history = try @import("hwpx/editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    const command: @import("hwpx/editor_history.zig").Command = .{ .kind = .character_properties, .paragraph = 3, .start = 6, .deleted = 1, .inserted = "", .character_properties = .{ .strike_color = 0x123456, .bold = true } };
    try std.testing.expect(try history.apply(&session, command));
    try std.testing.expect(!try history.apply(&session, command));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("hwpx/editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expect(!try reopened.setCharacterProperties(0, 3, 6, 7, command.character_properties));
    try std.testing.expect(try history.undo(&session));
    const original = try session.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, input, original);
    var missing = command;
    missing.paragraph = 2;
    missing.start = 0;
    try std.testing.expectError(error.MissingCharacterStrikeColorField, history.apply(&session, missing));
    const refused = try session.save();
    defer a.free(refused);
    try std.testing.expectEqualSlices(u8, input, refused);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}

test "strike color HWPX payload preserves shape namespace extensions and all allocation failures" {
    const a = std.testing.allocator;
    const source = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:charPr><h:strikeout shape='DOT' color='#000000' opaque='keep'/></h:charPr></h:head>";
    var tree = try @import("hwpx/xml_part_tree.zig").parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const @import("hwpx/xml_part_tree.zig").Tree) !void {
            const bytes = try @import("hwpx/character_strike_color_patch.zig").write(allocator, parsed, 1, 0x123456, 4096);
            defer allocator.free(bytes);
            try std.testing.expectEqualStrings("<h:charPr><h:strikeout shape='DOT' color='#123456' opaque='keep'/></h:charPr>", bytes);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(source, tree.source);
}

test "strike color compound HWP5 payload keeps independent colors and refuses shared color conflicts" {
    const a = std.testing.allocator;
    var source: [79]u8 = @splat(0);
    const writer = @import("hwp5/edit/character_property_payload.zig");
    std.mem.writeInt(u32, source[46..50], 1 << 18 | 1 << 2, .little);
    const result = try writer.write(a, &source, .{ .raw = 0x05000300 }, .{ .strike_color = 0x123456, .underline_color = 0xabcdef, .bold = true }, 79);
    defer a.free(result);
    var expected = source;
    expected[46] |= 2;
    expected[56..60].* = .{ 0xab, 0xcd, 0xef, 0 };
    expected[70..74].* = .{ 0x12, 0x34, 0x56, 0 };
    try std.testing.expectEqualSlices(u8, &expected, result);
    std.mem.writeInt(u32, source[46..50], 2 << 2, .little);
    try std.testing.expectError(error.ConflictingCharacterDecorationColors, writer.write(a, source[0..68], .{ .raw = 0x05000107 }, .{ .strike_color = 0x123456, .underline_color = 0xabcdef, .strike_enabled = false }, 68));
}

test "strike color HWPX clone creates a color only with an explicit strike request and rejects unknown shape" {
    const a = std.testing.allocator;
    const xml = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:charPr id='0'/><h:charPr id='1'><h:strikeout shape='FUTURE' color='#000000'/></h:charPr></h:head>";
    var tree = try @import("hwpx/xml_part_tree.zig").parse(a, xml, .header, null, 0, .{});
    defer tree.deinit(a);
    const writer = @import("hwpx/character_resource_clone.zig");
    try std.testing.expectError(error.MissingCharacterStrikeColorField, writer.write(a, &tree, 1, 9, .{ .strike_color = 0x123456 }, 4096));
    const created = try writer.write(a, &tree, 1, 9, .{ .strike_color = 0x123456, .strike_enabled = true }, 4096);
    defer a.free(created);
    try std.testing.expect(std.mem.indexOf(u8, created, "shape=\"SOLID\" color=\"#123456\"") != null);
    try std.testing.expectError(error.UnsupportedCharacterStrikeShape, writer.write(a, &tree, 2, 9, .{ .strike_color = 0x123456 }, 4096));
    try std.testing.expectEqualStrings(xml, tree.source);
}
