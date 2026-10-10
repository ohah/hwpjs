//! New FACE_NAME with no invented substitute, classification, or default name.
const std = @import("std");
pub fn write(a: std.mem.Allocator, name: []const u8, name_limit: usize, payload_limit: usize) ![]u8 {
    try @import("../../model/font_name.zig").validate(name, name_limit);
    const units = try std.unicode.utf8ToUtf16LeAlloc(a, name);
    defer a.free(units);
    if (units.len > std.math.maxInt(u16)) return error.InvalidFontName;
    const size = 3 + units.len * 2;
    if (size > payload_limit) return error.LimitExceeded;
    const output = try a.alloc(u8, size);
    output[0] = 0;
    std.mem.writeInt(u16, output[1..3], @intCast(units.len), .little);
    @memcpy(output[3..], std.mem.sliceAsBytes(units));
    return output;
}

test "new HWP5 font face payload encodes UTF16 length without optional metadata" {
    const a = std.testing.allocator;
    const output = try write(a, "A가😀", 8, 11);
    defer a.free(output);
    try std.testing.expectEqualSlices(u8, &.{ 0, 4, 0, 65, 0, 0, 0xac, 0x3d, 0xd8, 0, 0xde }, output);
    const parsed = try @import("../docinfo/face_name.zig").FaceName.parse(output);
    try std.testing.expectEqual(@as(u8, 0), parsed.attributes);
    try std.testing.expect(parsed.substitute == null and parsed.type_info == null and parsed.default_utf16 == null and parsed.extra.len == 0);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            const payload = try write(allocator, "Font", 4, 11);
            defer allocator.free(payload);
            try std.testing.expectEqualSlices(u8, &.{ 0, 4, 0, 70, 0, 111, 0, 110, 0, 116, 0 }, payload);
        }
    }.run, .{});
    try std.testing.expectError(error.InvalidFontName, write(a, "", 4, 11));
    try std.testing.expectError(error.InvalidFontName, write(a, "\xff", 4, 11));
    try std.testing.expectError(error.LimitExceeded, write(a, "Font", 3, 11));
    try std.testing.expectError(error.LimitExceeded, write(a, "Font", 4, 10));
    const too_long = try a.alloc(u8, 65536);
    defer a.free(too_long);
    @memset(too_long, 'A');
    try std.testing.expectError(error.InvalidFontName, write(a, too_long, 65536, 200000));
    const maximum = try write(a, too_long[0..65535], 65535, 131073);
    defer a.free(maximum);
    try std.testing.expectEqual(@as(u16, 65535), std.mem.readInt(u16, maximum[1..3], .little));
}
