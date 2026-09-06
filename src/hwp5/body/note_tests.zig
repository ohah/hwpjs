const std = @import("std");
const t = std.testing;
const Shape = @import("note_shape.zig").Shape;
test "note layout uses signed 32-bit separator length and distinct margin offsets" {
    var bytes = [_]u8{0} ** 31;
    std.mem.writeInt(i32, bytes[12..16], 14692344, .little);
    std.mem.writeInt(i16, bytes[16..18], 850, .little);
    std.mem.writeInt(i16, bytes[18..20], 567, .little);
    std.mem.writeInt(i16, bytes[20..22], 283, .little);
    bytes[22] = 1;
    bytes[23] = 2;
    std.mem.writeInt(u32, bytes[24..28], 0x12345678, .little);
    const note = try Shape.parse(&bytes);
    try t.expectEqual(14692344, note.separator_length);
    try t.expectEqual(850, note.above);
    try t.expectEqual(567, note.below);
    try t.expectEqual(283, note.between);
    try t.expectEqual(1, note.line_type);
    try t.expectEqual(2, note.line_width);
    try t.expectEqual(0x12345678, note.color);
    try t.expectEqual(3, note.extra.len);
    for (0..28) |n| try t.expectError(error.UnexpectedEnd, Shape.parse(bytes[0..n]));
    const old = try Shape.parseLayout(bytes[0..26], .spec26);
    try t.expectEqual(12280, old.separator_length);
    try t.expectEqual(224, old.above);
    try t.expectEqual(0, old.extra.len);
    for (0..26) |n| try t.expectError(error.UnexpectedEnd, Shape.parseLayout(bytes[0..n], .spec26));
}
test "note fields preserve negative values, raw UTF16 and unknown flags" {
    const bytes = [_]u8{255} ** 28;
    const s = try Shape.parse(&bytes);
    try t.expectEqual(-1, s.separator_length);
    try t.expectEqual(-1, s.above);
    try t.expectEqual(-1, s.below);
    try t.expectEqual(-1, s.between);
    try t.expectEqual(65535, s.user_char);
    try t.expectEqual(255, s.numberKind());
    try t.expectEqual(3, s.placement());
    try t.expectEqual(3, s.numbering());
    try t.expectEqual(0xffffffff, s.flags);
}
