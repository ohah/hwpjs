//! Local retained hyperlink markers only. Commands remain immutable and are
//! never executed. Cross-paragraph fields require a separate ownership model.
const std = @import("std");
const Text = @import("../body/text.zig").Text;
const controls = @import("../body/control_rules.zig");

pub fn validate(bytes: []const u8) !void {
    const text = try Text.parse(bytes);
    var tokens = text.tokens();
    var depth: usize = 0;
    const hyperlink = controls.id("%hlk");
    while (try tokens.next()) |token| {
        if (token.value != .control) continue;
        const c = token.value.control;
        if (c.code == 3) {
            if (std.mem.readInt(u32, c.data[0..4], .little) != hyperlink) return error.UnsupportedSectionControl;
            if (depth == 32) return error.LimitExceeded;
            depth += 1;
        } else if (c.code == 4) {
            if (depth == 0) return error.UnsupportedCrossParagraphField;
            const id = std.mem.readInt(u32, c.data[0..4], .little);
            // Actual software uses NUL instead of '%' in its end marker.
            if (id != hyperlink and id != (hyperlink & 0x00ffffff)) return error.FieldMarkerMismatch;
            depth -= 1;
        }
    }
    if (depth != 0) return error.UnsupportedCrossParagraphField;
}

test "retained hyperlink markers require local matching ends" {
    const start = [_]u8{ 3, 0, 'k', 'l', 'h', '%', 0, 0, 0, 0, 0, 0, 0, 0, 3, 0 };
    const end = [_]u8{ 4, 0, 'k', 'l', 'h', 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0 };
    try validate(&(start ++ end ++ [_]u8{ 13, 0 }));
    try validate(&(start ++ start ++ end ++ end ++ [_]u8{ 13, 0 }));
    try std.testing.expectError(error.UnsupportedCrossParagraphField, validate(&start));
    try std.testing.expectError(error.UnsupportedCrossParagraphField, validate(&end));
    var wrong = end;
    wrong[2] = 'x';
    try std.testing.expectError(error.FieldMarkerMismatch, validate(&(start ++ wrong)));
    var maximum: [32 * 32 + 2]u8 = undefined;
    for (0..32) |i| {
        @memcpy(maximum[i * 16 ..][0..16], &start);
        @memcpy(maximum[(32 + i) * 16 ..][0..16], &end);
    }
    maximum[maximum.len - 2] = 13;
    maximum[maximum.len - 1] = 0;
    try validate(&maximum);
    var bytes: [33 * 32 + 2]u8 = undefined;
    for (0..33) |i| {
        @memcpy(bytes[i * 16 ..][0..16], &start);
        @memcpy(bytes[(33 + i) * 16 ..][0..16], &end);
    }
    bytes[bytes.len - 2] = 13;
    bytes[bytes.len - 1] = 0;
    try std.testing.expectError(error.LimitExceeded, validate(&bytes));
}
