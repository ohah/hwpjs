const std = @import("std");
const structure = @import("structure.zig");
const high_byte = @import("rgb32_high_byte.zig");
const f = @import("test_fixture.zig");

test "BMP BI_RGB32 high byte is counted without alpha interpretation" {
    const view = try structure.inspect(&f.plain, .{});
    try std.testing.expectEqualDeep(high_byte.Report{ .images = 1, .zero = 1, .ff = 1, .other = 2 }, high_byte.inspect(view));
    var changed = f.plain;
    f.put(&changed, 22, i32, -2);
    try std.testing.expectEqualDeep(high_byte.inspect(view), high_byte.inspect(try structure.inspect(&changed, .{})));
    const indexed = f.indexed();
    try std.testing.expectEqualDeep(high_byte.Report{}, high_byte.inspect(try structure.inspect(&indexed, .{})));
    const bitfields = try f.extended(std.testing.allocator, 108);
    defer std.testing.allocator.free(bitfields);
    f.put(bitfields, 30, u32, 3);
    f.put(bitfields, 34, u32, 16);
    f.put(bitfields, 54, u32, 0x00ff0000);
    f.put(bitfields, 58, u32, 0x0000ff00);
    f.put(bitfields, 62, u32, 0x000000ff);
    f.put(bitfields, 66, u32, 0xff000000);
    try std.testing.expectEqualDeep(high_byte.Report{}, high_byte.inspect(try structure.inspect(bitfields, .{})));
}
