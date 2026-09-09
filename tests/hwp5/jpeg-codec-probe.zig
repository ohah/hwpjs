const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const kind = try r.readInt(u8);
    const finish = try r.readInt(u8);
    const skip = try r.readInt(u8);
    const count = try r.readInt(u32);
    if (kind > 1) return error.InvalidMode;
    if (skip > 32) return error.InvalidJpegBitCount;
    if (count > 1000000) return error.LimitExceeded;
    var widths: []const u8 = &.{};
    var decoder: ?core.image.jpeg_huffman_decoder.Decoder = null;
    if (kind == 0) {
        widths = try r.take(count);
    } else {
        const length = try r.readInt(u16);
        var it = try core.image.jpeg_huffman.Iterator.init(try r.take(length), .{});
        decoder = try core.image.jpeg_huffman_decoder.Decoder.init((try it.next()).?);
        if (try it.next() != null) return error.MultipleJpegHuffmanTables;
    }
    var bits = try core.image.jpeg_entropy_bits.Bits.init(bytes[r.offset..], limit);
    _ = try bits.read(@intCast(skip));
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for ([_]u32{ count, 0, 0 }) |n| try int(a, &out, u32, n);
    for (0..count) |i| {
        const value: u32 = if (decoder) |d| try d.decode(&bits) else blk: {
            if (widths[i] > 32) return error.InvalidJpegBitCount;
            break :blk try bits.read(@intCast(widths[i]));
        };
        try int(a, &out, u32, value);
    }
    if (finish != 0) try bits.finish();
    std.mem.writeInt(u32, out.items[4..8], @intCast(bits.reader.offset), .little);
    std.mem.writeInt(u32, out.items[8..12], bits.remaining, .little);
    return out.toOwnedSlice(a);
}
