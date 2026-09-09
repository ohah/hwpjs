const std = @import("std");
fn emit(a: std.mem.Allocator, out: *std.ArrayList(u8), bit: *usize, code: u16, width: usize) !void {
    for (0..width) |i| {
        if (bit.* / 8 == out.items.len) try out.append(a, 0);
        out.items[bit.* / 8] |= @as(u8, @intCast((code >> @as(u4, @intCast(i))) & 1)) << @as(u3, @intCast(bit.* % 8));
        bit.* += 1;
    }
}
// Literal-only test vector. Width is calculated from the ordinal, without decoding a dictionary.
fn codeWidth(preceding: usize) usize {
    return @min(12, std.math.log2_int(usize, @min(4096, 6 + (preceding -| 1))) + 1);
}
pub fn literals(a: std.mem.Allocator, width: u16, height: u16, interlace: bool) ![]u8 {
    const count = @as(usize, width) * height;
    var data: std.ArrayList(u8) = .empty;
    defer data.deinit(a);
    var bit: usize = 0;
    try emit(a, &data, &bit, 4, 3);
    for (0..count) |i| try emit(a, &data, &bit, @intCast(i % 2), codeWidth(i));
    try emit(a, &data, &bit, 5, codeWidth(count));
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    var header = [_]u8{ 'G', 'I', 'F', '8', '9', 'a', 0, 0, 0, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255, 44, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2 };
    std.mem.writeInt(u16, header[6..8], width, .little);
    std.mem.writeInt(u16, header[8..10], height, .little);
    std.mem.writeInt(u16, header[24..26], width, .little);
    std.mem.writeInt(u16, header[26..28], height, .little);
    header[28] = if (interlace) 64 else 0;
    try out.appendSlice(a, &header);
    // One-byte sub-blocks force every code width to cross transport boundaries.
    for (data.items) |b| try out.appendSlice(a, &.{ 1, b });
    try out.appendSlice(a, &.{ 0, 59 });
    return out.toOwnedSlice(a);
}
