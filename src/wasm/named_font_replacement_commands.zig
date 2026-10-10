//! 문단 교체 명령에 삽입된 문자만의 글꼴 적용을 덧붙입니다.
const std = @import("std");
const Format = @import("../model/document.zig").Format;
const Language = @import("../model/character_fonts.zig").Language;
const plans = @import("paragraph_replace_commands.zig");

pub fn build(comptime format: Format, a: std.mem.Allocator, replacement: []const plans.Command(format), language: Language, name: []const u8) ![]plans.Command(format) {
    try @import("../model/font_name.zig").validate(name, 4096);
    var output: std.ArrayList(plans.Command(format)) = .empty;
    errdefer output.deinit(a);
    try output.appendSlice(a, replacement);
    for (replacement) |command| {
        const inserted = @import("replacement_insertion.zig").read(format, command) orelse continue;
        const input: @import("named_font_text_commands.zig").Input = .{ .section = inserted.section, .paragraph = inserted.paragraph, .start = inserted.start, .end = inserted.end, .text = inserted.text, .language = language, .name = name };
        const pair = try @import("named_font_text_commands.zig").build(format, input);
        try output.append(a, pair[1]);
    }
    return output.toOwnedSlice(a);
}

test "named font replacement commands preserve structure Unicode and empty lines" {
    const a = std.testing.allocator;
    const Range = @import("character_range_batch.zig").Range;
    const ranges = [_]Range{.{ .section = 0, .paragraph = 2, .start = 1, .end = 3 }};
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        const replacement = try plans.build(format, a, &ranges, &.{3}, "한😀\r\n\n끝");
        defer a.free(replacement);
        const batch = try build(format, a, replacement, .hangul, "Paste Font");
        defer a.free(batch);
        try std.testing.expectEqual(replacement.len + 2, batch.len);
        if (format == .hwp5) {
            try std.testing.expectEqual(@as(u32, 4), batch[replacement.len].set_character_font_name.end_unit);
            try std.testing.expectEqual(@as(usize, 4), batch[replacement.len + 1].set_character_font_name.paragraph);
        } else {
            try std.testing.expectEqual(@as(u32, 3), batch[replacement.len].deleted);
            try std.testing.expectEqual(@as(usize, 4), batch[replacement.len + 1].paragraph);
        }
    }
}

test "named font replacement commands release every allocation failure" {
    const a = std.testing.allocator;
    const Range = @import("character_range_batch.zig").Range;
    const ranges = [_]Range{.{ .section = 0, .paragraph = 2, .start = 1, .end = 3 }};
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        const replacement = try plans.build(format, a, &ranges, &.{3}, "한😀\n\n끝");
        defer a.free(replacement);
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, base: []const plans.Command(format)) !void {
                const batch = try build(format, allocator, base, .hangul, "Paste Font");
                defer allocator.free(batch);
                try std.testing.expectEqual(base.len + 2, batch.len);
            }
        }.run, .{replacement});
        try std.testing.expectError(error.InvalidFontName, build(format, a, replacement, .hangul, ""));
    }
}
