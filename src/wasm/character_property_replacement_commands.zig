//! Append properties only for inserted text; paragraph planning remains separate.
const std = @import("std");
const Format = @import("../model/document.zig").Format;
const plans = @import("paragraph_replace_commands.zig");
const properties = @import("../model/character_properties.zig");

pub fn buildWithFont(comptime format: Format, a: std.mem.Allocator, replacement: []const plans.Command(format), language: @import("../model/character_fonts.zig").Language, name: []const u8, patch: properties.Patch) ![]plans.Command(format) {
    try properties.validate(patch);
    const named = try @import("named_font_replacement_commands.zig").build(format, a, replacement, language, name);
    defer a.free(named);
    return build(format, a, named, patch);
}

pub fn build(comptime format: Format, a: std.mem.Allocator, replacement: []const plans.Command(format), patch: properties.Patch) ![]plans.Command(format) {
    try properties.validate(patch);
    var output: std.ArrayList(plans.Command(format)) = .empty;
    errdefer output.deinit(a);
    try output.appendSlice(a, replacement);
    for (replacement) |command| {
        const input = @import("replacement_insertion.zig").read(format, command) orelse continue;
        const styled = try @import("character_property_text_commands.zig").build(format, input, patch);
        try output.append(a, styled[1]);
    }
    return output.toOwnedSlice(a);
}

test "character property replacement commands preserve empty lines and Unicode ranges" {
    const a = std.testing.allocator;
    const Range = @import("character_range_batch.zig").Range;
    const ranges = [_]Range{.{ .section = 0, .paragraph = 2, .start = 1, .end = 3 }};
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        const replacement = try plans.build(format, a, &ranges, &.{3}, "한😀\r\n\n끝");
        defer a.free(replacement);
        const batch = try build(format, a, replacement, .{ .size = 1700, .bold = false, .italic = true });
        defer a.free(batch);
        try std.testing.expectEqual(replacement.len + 2, batch.len);
        try std.testing.expectEqualDeep(replacement, batch[0..replacement.len]);
        if (format == .hwp5) {
            const first = batch[replacement.len].set_character_properties;
            try std.testing.expectEqual(@as(u32, 1), first.start_unit);
            try std.testing.expectEqual(@as(u32, 4), first.end_unit);
            try std.testing.expectEqual(@as(?bool, false), first.properties.bold);
            const last = batch[replacement.len + 1].set_character_properties;
            try std.testing.expectEqual(@as(usize, 4), last.paragraph);
            try std.testing.expectEqual(@as(u32, 1), last.end_unit);
        } else {
            try std.testing.expectEqual(@as(u32, 3), batch[replacement.len].deleted);
            try std.testing.expectEqual(@as(usize, 4), batch[replacement.len + 1].paragraph);
            try std.testing.expectEqual(@as(u32, 1), batch[replacement.len + 1].deleted);
        }
        const named = try @import("named_font_replacement_commands.zig").build(format, a, replacement, .hangul, "Combined Paste Font");
        defer a.free(named);
        const combined = try buildWithFont(format, a, replacement, .hangul, "Combined Paste Font", .{ .bold = true });
        defer a.free(combined);
        try std.testing.expectEqual(replacement.len + 4, combined.len);
        try std.testing.expectEqualDeep(named, combined[0..named.len]);
        try std.testing.expectError(error.InvalidCharacterSize, build(format, a, replacement, .{ .size = -1 }));
    }
}

test "character property replacement commands release all allocation failures" {
    const a = std.testing.allocator;
    const Range = @import("character_range_batch.zig").Range;
    const ranges = [_]Range{.{ .section = 0, .paragraph = 2, .start = 1, .end = 3 }};
    inline for (.{ Format.hwp5, Format.hwpx }) |format| {
        const replacement = try plans.build(format, a, &ranges, &.{3}, "한😀\n\n끝");
        defer a.free(replacement);
        inline for (.{ false, true }) |named| {
            try std.testing.checkAllAllocationFailures(a, struct {
                fn run(allocator: std.mem.Allocator, base: []const plans.Command(format)) !void {
                    const batch = if (named) try buildWithFont(format, allocator, base, .hangul, "Combined Paste Font", .{ .bold = true }) else try build(format, allocator, base, .{ .bold = true });
                    defer allocator.free(batch);
                    try std.testing.expectEqual(base.len + @as(usize, if (named) 4 else 2), batch.len);
                }
            }.run, .{replacement});
        }
    }
}
