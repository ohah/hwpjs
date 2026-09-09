const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;

fn sized(r: *core.Reader) ![]const u8 {
    return r.take(try r.readInt(u16));
}

pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const code = try r.readInt(u8);
    const finish = try r.readInt(u8);
    const skip = try r.readInt(u8);
    if (skip > 32) return error.InvalidJpegBitCount;
    var state: core.image.jpeg_progressive_block.State = .{ .predictor = try r.readInt(i32), .eob_remaining = try r.readInt(u16) };
    const count = try r.readInt(u32);
    if (@as(u64, count) * 256 + 20 > limit) return error.LimitExceeded;
    const frame = try core.image.jpeg_frame.parse(code, try sized(&r), .{});
    const scan = try sized(&r);
    const raw_table = try sized(&r);
    var table: ?core.image.jpeg_huffman.Table = null;
    if (raw_table.len != 0) {
        var it = try core.image.jpeg_huffman.Iterator.init(raw_table, .{});
        table = (try it.next()) orelse return error.EmptyJpegHuffmanTable;
        if (try it.next() != null) return error.MultipleJpegHuffmanTables;
    }
    const decoder = try core.image.jpeg_progressive_block.Decoder.init(frame, scan, table);
    var rows: core.Reader = .{ .bytes = try r.take(@as(usize, count) * 256) };
    var bits = try core.image.jpeg_entropy_bits.Bits.init(bytes[r.offset..], limit);
    _ = try bits.read(@intCast(skip));
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try out.appendNTimes(a, 0, 20);
    for (0..count) |_| {
        var block: [64]i32 = undefined;
        for (&block) |*value| value.* = try rows.readInt(i32);
        try decoder.decode(&bits, &state, &block);
        for (block) |value| try int(a, &out, i32, value);
    }
    if (finish != 0) {
        try state.finish();
        try bits.finish();
    }
    std.mem.writeInt(u32, out.items[0..4], @intCast(bits.reader.offset), .little);
    std.mem.writeInt(u32, out.items[4..8], bits.remaining, .little);
    std.mem.writeInt(i32, out.items[8..12], state.predictor, .little);
    std.mem.writeInt(u32, out.items[12..16], state.eob_remaining, .little);
    std.mem.writeInt(u32, out.items[16..20], count, .little);
    return out.toOwnedSlice(a);
}
