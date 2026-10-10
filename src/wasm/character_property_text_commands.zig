//! Text and inserted-range properties share one existing native batch transaction.
const Format = @import("../model/document.zig").Format;
const text = @import("text_transaction_commands.zig");
const properties = @import("../model/character_properties.zig");

pub fn build(comptime format: Format, input: text.Input, patch: properties.Patch) ![2]text.Command(format) {
    try properties.validate(patch);
    const inserted = try text.build(format, input);
    return .{ inserted.command, if (format == .hwp5)
        .{ .set_character_properties = .{ .section = input.section, .paragraph = input.paragraph, .start_unit = input.start, .end_unit = inserted.end, .properties = patch } }
    else
        .{ .kind = .character_properties, .section = input.section, .paragraph = input.paragraph, .start = input.start, .deleted = inserted.units, .inserted = "", .character_properties = patch } };
}

pub fn buildWithFont(comptime format: Format, input: @import("named_font_text_commands.zig").Input, patch: properties.Patch) ![3]text.Command(format) {
    const font = try @import("named_font_text_commands.zig").build(format, input);
    const styled = try build(format, .{ .section = input.section, .paragraph = input.paragraph, .start = input.start, .end = input.end, .text = input.text, .kind = input.text_kind, .begin_element = input.begin_element }, patch);
    return .{ font[0], font[1], styled[1] };
}

test "character property text commands combine font and properties without duplicate insertion" {
    const std = @import("std");
    const input: @import("named_font_text_commands.zig").Input = .{ .section = 0, .paragraph = 2, .start = 1, .end = 5, .text = "한😀", .language = .hangul, .name = "Combined Font" };
    const hwp = try buildWithFont(.hwp5, input, .{ .bold = true, .italic = false });
    const hwpx = try buildWithFont(.hwpx, input, .{ .size = 1700 });
    try std.testing.expect(hwp[0] == .splice_text);
    try std.testing.expect(hwp[1] == .set_character_font_name);
    try std.testing.expect(hwp[2] == .set_character_properties);
    try std.testing.expectEqual(@as(u32, 4), hwp[1].set_character_font_name.end_unit);
    try std.testing.expectEqual(@as(u32, 4), hwp[2].set_character_properties.end_unit);
    try std.testing.expectEqual(.character_font_name, hwpx[1].kind);
    try std.testing.expectEqual(.character_properties, hwpx[2].kind);
    try std.testing.expectEqual(@as(u32, 3), hwpx[2].deleted);
    try std.testing.expectError(error.InvalidCharacterSize, buildWithFont(.hwpx, input, .{ .size = -1 }));
    var invalid = input;
    invalid.name = "";
    try std.testing.expectError(error.InvalidFontName, buildWithFont(.hwp5, invalid, .{ .bold = true }));
}

test "character property text commands format only inserted Unicode and validate patches" {
    const std = @import("std");
    const input: text.Input = .{ .section = 0, .paragraph = 1, .start = 2, .end = 7, .text = "한😀" };
    const hwp = try build(.hwp5, input, .{ .size = 0, .bold = false, .italic = true });
    const hwpx = try build(.hwpx, input, .{ .bold = true });
    try std.testing.expectEqual(@as(u32, 5), hwp[1].set_character_properties.end_unit);
    try std.testing.expectEqual(@as(?i32, 0), hwp[1].set_character_properties.properties.size);
    try std.testing.expectEqual(@as(?bool, false), hwp[1].set_character_properties.properties.bold);
    try std.testing.expectEqual(@as(u32, 3), hwpx[1].deleted);
    try std.testing.expectEqual(@as(u32, 5), hwpx[0].deleted);
    try std.testing.expectError(error.InvalidCharacterSize, build(.hwp5, input, .{ .size = -1 }));
    try std.testing.expectError(error.InvalidCharacterSize, build(.hwpx, input, .{ .size = 409601 }));
    var protected = input;
    protected.kind = .anchored;
    protected.begin_element = 17;
    const anchored = try build(.hwpx, protected, .{ .italic = true });
    try std.testing.expectEqual(.anchored, anchored[0].kind);
    try std.testing.expectEqual(@as(usize, 17), anchored[0].begin_element);
    try std.testing.expectError(error.InvalidTextKind, build(.hwp5, protected, .{ .bold = true }));
}
