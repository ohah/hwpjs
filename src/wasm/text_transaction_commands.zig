//! Shared UTF-8 insertion measurement and native text-command construction.
const std = @import("std");
const Format = @import("../model/document.zig").Format;
pub const Kind = enum { plain, anchored, field };
pub const Input = struct {
    section: usize,
    paragraph: usize,
    start: u32,
    end: u32,
    text: []const u8,
    kind: Kind = .plain,
    begin_element: usize = 0,
};

pub fn Command(comptime format: Format) type {
    return if (format == .hwp5) @import("../hwp5/edit/style_preservation.zig").Command else @import("../hwpx/editor_history.zig").Command;
}

fn Prepared(comptime format: Format) type {
    return struct { command: Command(format), end: u32, units: u32 };
}

pub fn build(comptime format: Format, input: Input) !Prepared(format) {
    if (format == .hwp5 and input.kind != .plain) return error.InvalidTextKind;
    if (input.start > input.end or input.text.len == 0) return error.InvalidTextPosition;
    if (input.text.len > 4 * 1024 * 1024) return error.LimitExceeded;
    var iterator = (try std.unicode.Utf8View.init(input.text)).iterator();
    var units: u32 = 0;
    while (iterator.nextCodepoint()) |point| {
        units = std.math.add(u32, units, if (point > 0xffff) 2 else 1) catch return error.LimitExceeded;
    }
    return .{
        .end = std.math.add(u32, input.start, units) catch return error.InvalidTextPosition,
        .units = units,
        .command = if (format == .hwp5)
            .{ .splice_text = .{ .section = input.section, .paragraph = input.paragraph, .start_unit = input.start, .end_unit = input.end, .utf8 = input.text } }
        else
            .{ .kind = switch (input.kind) {
                .plain => .plain,
                .anchored => .anchored,
                .field => .field,
            }, .begin_element = input.begin_element, .section = input.section, .paragraph = input.paragraph, .start = input.start, .deleted = input.end - input.start, .inserted = input.text },
    };
}

test "text transaction command preserves protected identity and UTF16 insertion extent" {
    const input: Input = .{ .section = 1, .paragraph = 2, .start = 3, .end = 5, .text = "한😀", .kind = .field, .begin_element = 37 };
    const prepared = try build(.hwpx, input);
    try std.testing.expectEqual(@as(u32, 6), prepared.end);
    try std.testing.expectEqual(@as(u32, 3), prepared.units);
    try std.testing.expectEqual(.field, prepared.command.kind);
    try std.testing.expectEqual(@as(usize, 37), prepared.command.begin_element);
    try std.testing.expectEqual(@as(u32, 2), prepared.command.deleted);
    try std.testing.expectEqual(input.text.ptr, prepared.command.inserted.ptr);
    try std.testing.expectError(error.InvalidTextKind, build(.hwp5, input));
    var invalid = input;
    invalid.start = 6;
    try std.testing.expectError(error.InvalidTextPosition, build(.hwpx, invalid));
    invalid = input;
    invalid.text = "\xff";
    try std.testing.expectError(error.InvalidUtf8, build(.hwpx, invalid));
    invalid.text = "";
    try std.testing.expectError(error.InvalidTextPosition, build(.hwpx, invalid));
    invalid = input;
    invalid.start = std.math.maxInt(u32);
    invalid.end = invalid.start;
    try std.testing.expectError(error.InvalidTextPosition, build(.hwpx, invalid));
}
