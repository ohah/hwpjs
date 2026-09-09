const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;

pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit or limit < 640) return error.LimitExceeded;
    var r: core.Reader = .{ .bytes = bytes };
    const length = try r.readInt(u16);
    var it = try core.image.jpeg_quantization.Iterator.init(try r.take(length), .{});
    const table = (try it.next()) orelse return error.EmptyJpegQuantizationTable;
    if (try it.next() != null) return error.MultipleJpegQuantizationTables;
    var coefficients: [64]i32 = undefined;
    for (&coefficients) |*value| value.* = try r.readInt(i32);
    if (r.offset != bytes.len) return error.TrailingJpegDequantizationBytes;
    const result = core.image.jpeg_dequantization.block(coefficients, table);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for (core.image.jpeg_zigzag.wire_at_raster) |value| try out.append(a, value);
    for (core.image.jpeg_zigzag.raster_at_wire) |value| try out.append(a, value);
    for (result) |value| try int(a, &out, i64, value);
    return out.toOwnedSlice(a);
}
