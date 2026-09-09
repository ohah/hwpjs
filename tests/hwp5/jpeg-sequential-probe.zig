const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;

fn table(r: *core.Reader) !core.image.jpeg_huffman.Table {
    const length = try r.readInt(u16);
    var it = try core.image.jpeg_huffman.Iterator.init(try r.take(length), .{});
    const result = (try it.next()) orelse return error.EmptyJpegHuffmanTable;
    if (try it.next() != null) return error.MultipleJpegHuffmanTables;
    return result;
}

pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const code = try r.readInt(u8);
    const finish = try r.readInt(u8);
    const skip = try r.readInt(u8);
    if (skip > 32) return error.InvalidJpegBitCount;
    const predictor = try r.readInt(i32);
    const length = try r.readInt(u16);
    const frame = try core.image.jpeg_frame.parse(code, try r.take(length), .{});
    const dc = try table(&r);
    const ac = try table(&r);
    const decoder = try core.image.jpeg_sequential_block.Decoder.init(frame, dc, ac);
    var bits = try core.image.jpeg_entropy_bits.Bits.init(bytes[r.offset..], limit);
    _ = try bits.read(@intCast(skip));
    const block = try decoder.decode(&bits, predictor);
    if (finish != 0) try bits.finish();
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, @intCast(bits.reader.offset));
    try int(a, &out, u32, bits.remaining);
    for (block) |coefficient| try int(a, &out, i32, coefficient);
    return out.toOwnedSlice(a);
}
