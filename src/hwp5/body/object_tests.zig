const std = @import("std");
const t = std.testing;
const object = @import("object_common.zig");
const Properties = object.Properties;
test "object common bounds, absent versus empty description, and borrowed extra" {
    var b = [_]u8{0} ** 51;
    for (0..40) |n| try t.expectError(error.UnexpectedEnd, Properties.parse(b[0..n]));
    try t.expect((try Properties.parse(b[0..40])).description_utf16 == null);
    try t.expectError(error.UnexpectedEnd, Properties.parse(b[0..41]));
    try t.expectEqual(0, (try Properties.parse(b[0..42])).description_utf16.?.len);
    std.mem.writeInt(u16, b[40..42], 3, .little);
    // Unpaired surrogate, embedded NUL, BOM: preserve code units, not Unicode repair.
    @memcpy(b[42..48], &[_]u8{ 0, 0xd8, 0, 0, 0xff, 0xfe });
    for (42..48) |n| try t.expectError(error.UnexpectedEnd, Properties.parse(b[0..n]));
    const p = try Properties.parse(&b);
    try t.expectEqualSlices(u8, b[42..48], p.description_utf16.?);
    try t.expect(p.description_utf16.?.ptr == b[42..48].ptr);
    try t.expect(p.extra.ptr == b[48..].ptr);
    try t.expectEqual(3, p.extra.len);
    std.mem.writeInt(u16, b[40..42], 65535, .little);
    try t.expectError(error.UnexpectedEnd, Properties.parse(&b));
}
test "object signed fields and unsigned sizes retain distinct offsets and extrema" {
    var b = [_]u8{255} ** 40;
    std.mem.writeInt(i32, b[4..8], -2835, .little);
    std.mem.writeInt(i32, b[8..12], -23207, .little);
    std.mem.writeInt(u32, b[12..16], 0x80000000, .little);
    std.mem.writeInt(i32, b[20..24], -2147483648, .little);
    std.mem.writeInt(i16, b[24..26], -32768, .little);
    std.mem.writeInt(i16, b[26..28], 32767, .little);
    std.mem.writeInt(i16, b[28..30], 17, .little);
    const p = try Properties.parse(&b);
    try t.expectEqual(0xffffffff, p.flags);
    try t.expectEqual(-2835, p.offset_y);
    try t.expectEqual(-23207, p.offset_x);
    try t.expectEqual(0x80000000, p.width);
    try t.expectEqual(0xffffffff, p.height);
    try t.expectEqual(-2147483648, p.z_order);
    try t.expectEqualSlices(i16, &.{ -32768, 32767, 17, -1 }, &p.margins);
    try t.expectEqual(0xffffffff, p.instance_id);
    try t.expectEqual(-1, p.prevent_page_break);
}
test "object dispatch does not mistake child shape IDs for control headers" {
    const id = @import("control_rules.zig").id;
    inline for (.{ "tbl ", "gso ", "eqed" }) |name| try t.expect(object.supports(id(name)));
    inline for (.{ "$pic", "$rec", "secd", "tblx", "GSO " }) |name| try t.expect(!object.supports(id(name)));
}
