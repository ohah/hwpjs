//! 선택 구간을 포맷별 native 명령으로 변환합니다. 실행과 이력은 소유하지 않습니다.
const std = @import("std");
const wire = @import("character_range_batch.zig");
const Patch = @import("../model/document.zig").CharacterPropertyPatch;
const Format = @import("../model/document.zig").Format;

pub fn build(comptime format: Format, a: std.mem.Allocator, bytes: []const u8, patch: Patch) ![]Command(format) {
    const ranges = try wire.decode(a, bytes);
    defer a.free(ranges);
    const commands = try a.alloc(Command(format), ranges.len);
    for (ranges, commands) |range, *command| {
        command.* = if (format == .hwp5)
            .{ .set_character_properties = .{ .section = range.section, .paragraph = range.paragraph, .start_unit = range.start, .end_unit = range.end, .properties = patch } }
        else
            .{ .kind = .character_properties, .section = range.section, .paragraph = range.paragraph, .start = range.start, .deleted = range.end - range.start, .inserted = "", .character_properties = patch };
    }
    return commands;
}

fn Command(comptime format: Format) type {
    return if (format == .hwp5) @import("../hwp5/edit/style_preservation.zig").Command else @import("../hwpx/editor_history.zig").Command;
}

/// 이름은 호출 버퍼를 빌리며 생성 명령은 동기 실행 중에만 사용합니다.
pub fn buildFontName(comptime format: Format, a: std.mem.Allocator, bytes: []const u8, language: @import("../model/character_fonts.zig").Language, name: []const u8) ![]Command(format) {
    try @import("../model/font_name.zig").validate(name, 4096);
    const ranges = try wire.decode(a, bytes);
    defer a.free(ranges);
    const commands = try a.alloc(Command(format), ranges.len);
    for (ranges, commands) |range, *command| {
        command.* = if (format == .hwp5)
            .{ .set_character_font_name = .{ .section = range.section, .paragraph = range.paragraph, .start_unit = range.start, .end_unit = range.end, .language = language, .name = name } }
        else
            .{ .kind = .character_font_name, .section = range.section, .paragraph = range.paragraph, .start = range.start, .deleted = range.end - range.start, .inserted = "", .font_language = language, .font_name = name };
    }
    return commands;
}

test "named font range commands preserve language borrowed name and allocation failures" {
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            var bytes: [16]u8 = @splat(0);
            std.mem.writeInt(u32, bytes[4..8], 7, .little);
            std.mem.writeInt(u32, bytes[8..12], 2, .little);
            std.mem.writeInt(u32, bytes[12..16], 5, .little);
            const name = "Range Font 😀";
            const hwp = try buildFontName(.hwp5, a, &bytes, .latin, name);
            defer a.free(hwp);
            const hwpx = try buildFontName(.hwpx, a, &bytes, .latin, name);
            defer a.free(hwpx);
            try std.testing.expectEqual(@as(usize, 7), hwp[0].set_character_font_name.paragraph);
            try std.testing.expectEqual(@as(usize, 7), hwpx[0].paragraph);
            try std.testing.expectEqual(@as(u32, 3), hwpx[0].deleted);
            try std.testing.expectEqual(.latin, hwpx[0].font_language);
            try std.testing.expectEqual(.latin, hwp[0].set_character_font_name.language);
            try std.testing.expectEqual(name.ptr, hwpx[0].font_name.ptr);
            try std.testing.expectEqualStrings(name, hwp[0].set_character_font_name.name);
        }
    }.run, .{});
    try std.testing.expectError(error.InvalidFontName, buildFontName(.hwpx, std.testing.allocator, &.{}, .hangul, ""));
}

test "character range commands preserve format paragraph basis and every allocation failure" {
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            var bytes: [16]u8 = @splat(0);
            std.mem.writeInt(u32, bytes[4..8], 7, .little);
            std.mem.writeInt(u32, bytes[8..12], 2, .little);
            std.mem.writeInt(u32, bytes[12..16], 5, .little);
            const hwp = try build(.hwp5, a, &bytes, .{ .bold = false, .underline_color = 0 });
            defer a.free(hwp);
            const hwpx = try build(.hwpx, a, &bytes, .{ .bold = false, .underline_color = 0 });
            defer a.free(hwpx);
            try std.testing.expectEqual(@as(usize, 7), hwp[0].set_character_properties.paragraph);
            try std.testing.expectEqual(@as(usize, 7), hwpx[0].paragraph);
            try std.testing.expectEqual(@as(u32, 3), hwpx[0].deleted);
            try std.testing.expectEqual(@as(?bool, false), hwpx[0].character_properties.bold);
            try std.testing.expectEqual(@as(?u32, 0), hwp[0].set_character_properties.properties.underline_color);
        }
    }.run, .{});
}
