//! Read-only display projection; original DocInfo remains authoritative.
const std = @import("std");
const info = @import("../docinfo/reader.zig");
pub const Shape = struct { id: u32, height: i32, bold: bool, italic: bool, effects: @import("../../model/character_effect_flags.zig").Flags = .{}, outline_kind_raw: u3 = 0, strike_kind_raw: u3 = 0, strike_style_raw: u4 = 0, strike_color_raw: ?u32 = null, underline_kind_raw: u2 = 0, underline_style_raw: u4 = 0, underline_color_raw: u32 = 0, text_color_raw: u32 = 0, shade_color_raw: u32 = 0xffffffff, font_ids: [7]u16 = @splat(0), shadow: ?@import("../../model/character_shadow.zig").Value = null, font_metrics: @import("character_font_metrics.zig").Values = .{} };

/// 원시 모양의 기존 표시 투영만 공유한다. payload를 변경하지 않는다.
pub fn fromRaw(id: u32, shape: info.CharShape) Shape {
    var output: Shape = .{ .id = id, .height = shape.size, .bold = shape.attributes & 2 != 0, .italic = shape.attributes & 1 != 0, .underline_kind_raw = shape.underlineKindRaw(), .underline_style_raw = shape.underlineStyleRaw(), .underline_color_raw = shape.underline_color, .text_color_raw = shape.text_color };
    output.font_ids = shape.font_ids;
    output.font_metrics = @import("character_font_metrics.zig").Values.fromRaw(shape);
    output.outline_kind_raw = shape.outlineKindRaw();
    output.effects = .{ .emboss = shape.embossed(), .engrave = shape.engraved(), .superscript = shape.superscript(), .subscript = shape.subscript() };
    output.shade_color_raw = shape.shade_color;
    output.strike_kind_raw = shape.strikeKindRaw();
    output.strike_style_raw = shape.strikeStyleRaw();
    output.strike_color_raw = shape.strike_color;
    output.shadow = .{ .kind_raw = shape.shadowKindRaw(), .offset_x = shape.shadow_x, .offset_y = shape.shadow_y, .color_raw = shape.shadow_color };
    return output;
}

pub const read_count_limit: usize = 100_000;
pub fn validateReadCount(count: usize) !void {
    if (count > read_count_limit) return error.LimitExceeded;
}

pub fn read(a: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, expected_count: usize) ![]Shape {
    try validateReadCount(expected_count);
    const output = try a.alloc(Shape, expected_count);
    errdefer a.free(output);
    var iterator = try info.Iterator.init(bytes, version, .{});
    var count: usize = 0;
    while (try iterator.next()) |record| {
        if (record.value != .char_shape) continue;
        if (count >= output.len) return error.ResourceCountMismatch;
        output[count] = fromRaw(@intCast(count), record.value.char_shape);
        count += 1;
    }
    if (count != output.len) return error.ResourceCountMismatch;
    return output;
}

fn fixture() [144]u8 {
    var bytes: [144]u8 = @splat(0);
    for (0..2) |index| {
        const at = index * 72;
        std.mem.writeInt(u32, bytes[at..][0..4], 21 | (1 << 10) | (68 << 20), .little);
        std.mem.writeInt(i32, bytes[at + 46 ..][0..4], if (index == 0) 1200 else -1, .little);
        std.mem.writeInt(u32, bytes[at + 50 ..][0..4], if (index == 0) 3 else 0xffff_fffc, .little);
    }
    return bytes;
}
fn allocationCase(a: std.mem.Allocator) !void {
    const bytes = fixture();
    const result = try read(a, &bytes, .{ .raw = 0x05000000 }, 2);
    defer a.free(result);
    try std.testing.expectEqual(@as(i32, 1200), result[0].height);
    try std.testing.expect(result[0].bold and result[0].italic);
    try std.testing.expectEqual(@as(u32, 1), result[1].id);
    try std.testing.expectEqual(@as(i32, -1), result[1].height);
    try std.testing.expect(!result[1].bold and !result[1].italic);
    try std.testing.expectEqual(@as(u3, 7), result[1].strike_kind_raw);
    try std.testing.expectEqual(@as(u4, 15), result[1].strike_style_raw);
    try std.testing.expectEqual(@as(?u32, null), result[1].strike_color_raw);
    try std.testing.expectEqualDeep(@import("../../model/character_effect_flags.zig").Flags{}, result[0].effects);
    try std.testing.expectEqualDeep(@import("../../model/character_effect_flags.zig").Flags{ .emboss = true, .engrave = true, .superscript = true, .subscript = true }, result[1].effects);
}
test "HWP5 display shapes preserve raw height and flags with allocation failure" {
    try @import("../../testing/allocation_failures.zig").check(allocationCase, .{});
}
test "HWP5 display shapes reject count level and truncated payload without repairing source" {
    var bytes = fixture();
    const before = bytes;
    const a = std.testing.allocator;
    try std.testing.expectError(error.ResourceCountMismatch, read(a, &bytes, .{ .raw = 0x05000000 }, 1));
    try std.testing.expectError(error.ResourceCountMismatch, read(a, &bytes, .{ .raw = 0x05000000 }, 3));
    try std.testing.expectError(error.LimitExceeded, read(a, &bytes, .{ .raw = 0x05000000 }, 100_001));
    try std.testing.expectEqualSlices(u8, &before, &bytes);
    for (0..bytes.len) |length| {
        if (read(a, bytes[0..length], .{ .raw = 0x05000000 }, 2)) |unexpected| {
            a.free(unexpected);
            return error.ExpectedFailure;
        } else |_| {}
    }
    bytes[1] &= ~@as(u8, 4);
    try std.testing.expectError(error.InvalidDocInfoLevel, read(a, &bytes, .{ .raw = 0x05000000 }, 2));
}
