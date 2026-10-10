//! Real-fixture property edits, mixed styles and native history regression.
const std = @import("std");
const editor = @import("editor_session.zig");
test "HWPX extended outline rejects before edits and retains redo" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var history = try @import("editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    var command: @import("editor_history.zig").Command = .{ .kind = .character_properties, .paragraph = 2, .start = 0, .deleted = 2, .inserted = "", .character_properties = .{ .outline_kind = .solid } };
    try std.testing.expect(try history.apply(&session, command));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expect(try history.undo(&session));
    for ([_]@import("../model/character_outline_kind.zig").Kind{ .dot, .thick, .dash, .dash_dot, .dash_dot_dot }) |kind| {
        command.character_properties.outline_kind = kind;
        try std.testing.expectError(error.UnsupportedCharacterOutlineKind, history.apply(&session, command));
        const unchanged = try session.save();
        defer a.free(unchanged);
        try std.testing.expectEqualSlices(u8, input, unchanged);
    }
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}
test "HWPX effect session saves reopens and preserves history and no-op" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var history = try @import("editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    const command: @import("editor_history.zig").Command = .{ .kind = .character_properties, .paragraph = 2, .start = 0, .deleted = 2, .inserted = "", .character_properties = .{ .emboss = true, .engrave = true, .superscript = true, .subscript = true, .outline_kind = .solid } };
    try std.testing.expect(try history.apply(&session, command));
    try std.testing.expect(!try history.apply(&session, command));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expect(!try reopened.setCharacterProperties(0, 2, 0, 2, command.character_properties));
    const spans = try @import("character_style_snapshot.zig").read(&reopened, 0, 2);
    defer a.free(spans);
    const shapes = try @import("character_style_resources.zig").displayShapes(&reopened);
    defer a.free(shapes);
    var checked = false;
    for (shapes) |shape| if (shape.id == spans[0].char_shape_id) {
        try std.testing.expectEqualDeep(@import("../model/character_effect_flags.zig").Flags{ .emboss = true, .engrave = true, .superscript = true, .subscript = true }, shape.effects);
        try std.testing.expectEqual(@as(?@import("character_outline_display.zig").Value, .solid), shape.outline);
        checked = true;
    };
    try std.testing.expect(checked);
    try std.testing.expect(try history.undo(&session));
    const original = try session.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, input, original);
    try std.testing.expect(try history.redo(&session));
    var removed = command;
    removed.character_properties = .{ .emboss = false, .engrave = false, .superscript = false, .subscript = false, .outline_kind = .none };
    try std.testing.expect(try history.apply(&session, removed));
    try std.testing.expect(!try history.apply(&session, removed));
}

test "HWPX shade session saves reopens and history distinguishes none white and no-op" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var history = try @import("editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    const command: @import("editor_history.zig").Command = .{ .kind = .character_properties, .paragraph = 2, .start = 0, .deleted = 2, .inserted = "", .character_properties = .{ .shade = .{ .color = 0xffffff } } };
    try std.testing.expect(try history.apply(&session, command));
    try std.testing.expect(!try history.apply(&session, command));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expect(!try reopened.setCharacterProperties(0, 2, 0, 2, command.character_properties));
    try std.testing.expect(try history.undo(&session));
    const original = try session.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, input, original);
    try std.testing.expect(!try history.undo(&session));
    var invalid = command;
    invalid.character_properties.shade = .{ .color = 0x1000000 };
    try std.testing.expectError(error.InvalidCharacterColor, history.apply(&session, invalid));
    const after_failure = try session.save();
    defer a.free(after_failure);
    try std.testing.expectEqualSlices(u8, input, after_failure);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    try std.testing.expect(try session.setCharacterProperties(0, 2, 0, 2, .{ .shade = .none }));
    try std.testing.expect(!try session.setCharacterProperties(0, 2, 0, 2, .{ .shade = .none }));
}

test "HWPX font session merges languages saves reopens and preserves failed history" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var history = try @import("editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    const Command = @import("editor_history.zig").Command;
    const first: Command = .{ .kind = .character_properties, .paragraph = 2, .start = 0, .deleted = 2, .inserted = "", .character_properties = .{ .font_ids = .{ 2, null, null, null, null, null, null }, .text_color = 0x123456 } };
    const second: Command = .{ .kind = .character_properties, .paragraph = 2, .start = 0, .deleted = 2, .inserted = "", .character_properties = .{ .font_ids = .{ null, 2, null, null, null, null, null } } };
    try std.testing.expect(try history.apply(&session, first));
    try std.testing.expect(try history.apply(&session, second));
    try std.testing.expect(!try history.apply(&session, second));
    const spans = try @import("character_style_snapshot.zig").read(&session, 0, 2);
    defer a.free(spans);
    const shapes = try @import("character_style_resources.zig").displayShapes(&session);
    defer a.free(shapes);
    var checked: usize = 0;
    for (spans) |span| {
        if (span.start_unit >= 2 or span.end_unit == 0) continue;
        for (shapes) |shape| if (shape.id == span.char_shape_id) {
            try std.testing.expectEqual(@as(?u32, 2), shape.font_ids.?[0]);
            try std.testing.expectEqual(@as(?u32, 2), shape.font_ids.?[1]);
            try std.testing.expectEqual(@as(?u32, 0x123456), shape.text_color);
            checked += 1;
        };
    }
    try std.testing.expect(checked > 0);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expect(!try reopened.setCharacterProperties(0, 2, 0, 2, .{ .font_ids = .{ 2, 2, null, null, null, null, null }, .text_color = 0x123456 }));
    try std.testing.expect(try history.undo(&session));
    var invalid = second;
    invalid.character_properties.font_ids = .{ null, 999999, null, null, null, null, null };
    const before_invalid = try session.save();
    defer a.free(before_invalid);
    try std.testing.expectError(error.InvalidFontId, history.apply(&session, invalid));
    const after_invalid = try session.save();
    defer a.free(after_invalid);
    try std.testing.expectEqualSlices(u8, before_invalid, after_invalid);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    for (0..2) |_| try std.testing.expect(try history.undo(&session));
    const original = try session.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, input, original);
}

test "HWPX text color session composes properties saves and preserves history" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var history = try @import("editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    const command: @import("editor_history.zig").Command = .{ .kind = .character_properties, .paragraph = 2, .start = 0, .deleted = 2, .inserted = "", .character_properties = .{ .text_color = 0x123456, .underline_color = 0xabcdef, .bold = true } };
    try std.testing.expect(try history.apply(&session, command));
    try std.testing.expect(!try history.apply(&session, command));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expect(!try reopened.setCharacterProperties(0, 2, 0, 2, command.character_properties));
    try std.testing.expect(try history.undo(&session));
    const original = try session.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, input, original);
    var invalid = command;
    invalid.character_properties.text_color = 0x1000000;
    try std.testing.expectError(error.InvalidCharacterColor, history.apply(&session, invalid));
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}

test "HWPX strike property session saves reopens and preserves history and no-op" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var history = try @import("editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    const command: @import("editor_history.zig").Command = .{ .kind = .character_properties, .paragraph = 2, .start = 0, .deleted = 2, .inserted = "", .character_properties = .{ .strike_enabled = true, .bold = true } };
    try std.testing.expect(try history.apply(&session, command));
    try std.testing.expect(!try history.apply(&session, command));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expect(!try reopened.setCharacterProperties(0, 2, 0, 2, command.character_properties));
    try std.testing.expect(try reopened.setCharacterProperties(0, 2, 0, 2, .{ .strike_enabled = false }));
    const disabled = try reopened.save();
    defer a.free(disabled);
    var disabled_session = try editor.open(a, disabled, .{});
    defer disabled_session.deinit();
    try std.testing.expect(!try disabled_session.setCharacterProperties(0, 2, 0, 2, .{ .strike_enabled = false, .bold = true }));
    try std.testing.expect(try history.undo(&session));
    const original = try session.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, input, original);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}

test "HWPX character property session saves reopens and preserves no-op ranges" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.setCharacterProperties(0, 2, 0, 2, .{ .size = 2400, .bold = true }));
    const count = session.character_resources.entries.items.len;
    try std.testing.expect(!try session.setCharacterProperties(0, 2, 0, 2, .{ .size = 2400, .bold = true }));
    try std.testing.expectEqual(count, session.character_resources.entries.items.len);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expect(!try reopened.setCharacterProperties(0, 2, 0, 2, .{ .size = 2400, .bold = true }));
    try std.testing.expectError(error.InvalidTextPosition, session.setCharacterProperties(0, 2, 2, 1, .{}));
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, saved, unchanged);
}

test "HWPX character property history preserves mixed sizes undo redo and failed commands" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var history = try @import("editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    const Command = @import("editor_history.zig").Command;
    const first: Command = .{ .kind = .character_properties, .paragraph = 2, .start = 0, .deleted = 1, .inserted = "", .character_properties = .{ .size = 1200, .bold = false } };
    const second: Command = .{ .kind = .character_properties, .paragraph = 2, .start = 1, .deleted = 1, .inserted = "", .character_properties = .{ .size = 2400, .bold = false } };
    const both: Command = .{ .kind = .character_properties, .paragraph = 2, .start = 0, .deleted = 2, .inserted = "", .character_properties = .{ .bold = true } };
    try std.testing.expect(try history.apply(&session, first));
    try std.testing.expect(try history.apply(&session, second));
    try std.testing.expect(try history.apply(&session, both));
    const spans = try @import("character_style_snapshot.zig").read(&session, 0, 2);
    defer a.free(spans);
    const shapes = try @import("character_style_resources.zig").displayShapes(&session);
    defer a.free(shapes);
    for ([_]i32{ 1200, 2400 }, 0..) |height, unit| {
        var found = false;
        for (spans) |span| if (span.start_unit <= unit and unit < span.end_unit) {
            for (shapes) |shape| if (shape.id == span.char_shape_id) {
                try std.testing.expectEqual(@as(?i32, height), shape.height);
                try std.testing.expect(shape.bold);
                found = true;
            };
        };
        try std.testing.expect(found);
    }
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expect(try history.undo(&session));
    var invalid = both;
    invalid.character_properties.size = -1;
    try std.testing.expectError(error.InvalidCharacterSize, history.apply(&session, invalid));
    invalid = both;
    invalid.start = std.math.maxInt(u32);
    try std.testing.expectError(error.InvalidTextPosition, history.apply(&session, invalid));
    invalid = both;
    invalid.inserted = "unexpected";
    try std.testing.expectError(error.InvalidFormatCommand, history.apply(&session, invalid));
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    for (0..3) |_| try std.testing.expect(try history.undo(&session));
    const original = try session.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, input, original);
}

test "HWPX character property history growth limit rolls back resources and text" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const budget = try @import("editor_checkpoint.zig").size(&session, 4_000_000);
    var history = try @import("editor_history.zig").History.init(&session, 8, budget);
    defer history.deinit();
    try std.testing.expectError(error.LimitExceeded, history.apply(&session, .{ .kind = .character_properties, .paragraph = 2, .start = 0, .deleted = 2, .inserted = "", .character_properties = .{ .size = 2400, .bold = true } }));
    try std.testing.expectEqual(@as(usize, 0), session.character_resources.entries.items.len);
    try std.testing.expect(session.sections[0].structure_values == null);
    try std.testing.expect(!try history.undo(&session));
    try std.testing.expect(!try history.redo(&session));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}
