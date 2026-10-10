//! 원본 표시 서식에 현재 속성 의도를 적용하는 임시 값입니다. 캐시하지 않습니다.
const Shape = @import("character_shape_display.zig").Shape;
const Patch = @import("../model/document.zig").CharacterPropertyPatch;

pub fn project(source: Shape, id: u32, patch: Patch) !Shape {
    try @import("../model/character_properties.zig").validate(patch);
    var result = source;
    if (patch.outline_kind) |kind| result.outline = switch (kind) {
        .none => .none,
        .solid => .solid,
        else => .unknown,
    };
    inline for (.{ "emboss", "engrave", "superscript", "subscript" }) |name| {
        if (@field(patch, name)) |value| @field(result.effects, name) = value;
    }
    result.id = id;
    if (patch.size) |value| result.height = value;
    if (patch.bold) |value| result.bold = value;
    if (patch.italic) |value| result.italic = value;
    if (patch.text_color) |value| result.text_color = value;
    if (patch.shade) |intent| result.shade = @import("../model/shade_color.zig").hwp5(try @import("../model/shade_color.zig").encodeHwp5(intent));
    if (patch.font_ids) |values| result.font_ids = @import("../model/character_fonts.zig").merge(source.font_ids orelse @splat(null), values);
    return result;
}

test "character shape intent keeps absence and explicit zero without serialized cache" {
    const std = @import("std");
    const source: Shape = .{ .id = 7, .height = null, .bold = true, .text_color = 0x123456, .font_ids = .{ 1, 2, null, null, null, null, null } };
    const changed = try project(source, 9, .{ .size = 0, .bold = false, .text_color = 0, .font_ids = .{ null, 0, null, null, null, null, null }, .underline_kind = .bottom });
    try std.testing.expectEqual(@as(?i32, 0), changed.height);
    try std.testing.expect(!changed.bold);
    try std.testing.expectEqual(@as(?u32, 0), changed.text_color);
    try std.testing.expectEqual(@as(?u32, 1), changed.font_ids.?[0]);
    try std.testing.expectEqual(@as(?u32, 0), changed.font_ids.?[1]);
    try std.testing.expectEqual(@as(?i32, null), (try project(source, 9, .{})).height);
    try std.testing.expectEqual(@as(?i32, null), source.height);
    try std.testing.expect(source.bold);
    try std.testing.expectError(error.InvalidCharacterSize, project(source, 9, .{ .size = -1 }));
    try std.testing.expectError(error.InvalidCharacterColor, project(source, 9, .{ .text_color = 0x1000000 }));
}

test "character shape intent preserves source effects through unrelated current edits" {
    const std = @import("std");
    const source: Shape = .{ .id = 7, .height = 1200, .effects = .{ .emboss = true, .engrave = true, .superscript = true, .subscript = true } };
    const changed = try project(source, 8, .{ .size = 900, .bold = true, .shade = .none, .text_color = 0 });
    try std.testing.expectEqualDeep(source.effects, changed.effects);
    try std.testing.expectEqual(@as(?i32, 900), changed.height);
    try std.testing.expectEqual(@as(?u32, 8), changed.id);
    try std.testing.expectEqual(@as(?u32, 7), source.id);
}
