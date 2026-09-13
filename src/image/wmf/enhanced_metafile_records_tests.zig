const std = @import("std");
const t = std.testing;
const header = @import("header.zig");
const records = @import("records.zig");
const scanner = @import("enhanced_metafile_records.zig");

fn writeChunk(out: *[46]u8, remaining: u32, data: [2]u8) void {
    out.* = .{0} ** 46;
    std.mem.writeInt(u32, out[0..4], 23, .little);
    std.mem.writeInt(u16, out[4..6], 0x0626, .little);
    std.mem.writeInt(u16, out[6..8], 0x000f, .little);
    std.mem.writeInt(u16, out[8..10], 36, .little);
    std.mem.writeInt(u32, out[10..14], 0x43464d57, .little);
    std.mem.writeInt(u32, out[14..18], 1, .little);
    std.mem.writeInt(u32, out[18..22], 0x00010000, .little);
    std.mem.writeInt(u16, out[22..24], 0xfffc, .little);
    std.mem.writeInt(u32, out[28..32], 2, .little);
    std.mem.writeInt(u32, out[32..36], 2, .little);
    std.mem.writeInt(u32, out[36..40], remaining, .little);
    std.mem.writeInt(u32, out[40..44], 4, .little);
    out[44..46].* = data;
}

fn fixture() [92]u8 {
    var first: [46]u8 = undefined;
    var second: [46]u8 = undefined;
    writeChunk(&first, 2, .{ 1, 0 });
    writeChunk(&second, 0, .{ 2, 0 });
    return first ++ second;
}

fn inspect(a: std.mem.Allocator, bytes: []const u8, options: scanner.Options) !scanner.Report {
    const value: header.Header = .{ .placeable = undefined, .meta = undefined, .records_offset = 0 };
    const framing: records.Summary = .{ .count = 2, .max_record_words = 23, .eof_end = bytes.len, .trailing_zero_words = 0 };
    return scanner.inspect(a, bytes, value, framing, options);
}

test "WMF embedded EMF scanner requires consecutive records" {
    const bytes = fixture();
    const report = try inspect(t.allocator, &bytes, .{ .max_records_per_sequence = 2, .max_bytes_per_sequence = 4 });
    try t.expectEqual(@as(usize, 2), report.candidates);
    try t.expectEqual(@as(usize, 2), report.conforming);
    try t.expectEqual(@as(usize, 1), report.sequences);
    try t.expectEqual(@as(usize, 4), report.chunk_bytes);

    var interrupted = bytes;
    std.mem.writeInt(u16, interrupted[46 + 4 ..][0..2], 0x0102, .little);
    try t.expectError(error.NonconsecutiveWmfEnhancedMetafileChunk, inspect(t.allocator, &interrupted, .{ .max_records_per_sequence = 2, .max_bytes_per_sequence = 4 }));
}

test "WMF embedded EMF scanner enforces record and byte limits before success" {
    const bytes = fixture();
    try t.expectError(error.LimitExceeded, inspect(t.allocator, &bytes, .{ .max_records_per_sequence = 1, .max_bytes_per_sequence = 4 }));
    try t.expectError(error.LimitExceeded, inspect(t.allocator, &bytes, .{ .max_records_per_sequence = 2, .max_bytes_per_sequence = 3 }));
}

test "WMF embedded EMF scanner propagates sequence validation errors" {
    var bytes = fixture();
    std.mem.writeInt(u32, bytes[46 + 36 ..][0..4], 1, .little);
    try t.expectError(error.InvalidWmfEnhancedMetafileSequenceRemainingBytes, inspect(t.allocator, &bytes, .{ .max_records_per_sequence = 2, .max_bytes_per_sequence = 4 }));
}

fn successful(a: std.mem.Allocator) !void {
    const bytes = fixture();
    _ = try inspect(a, &bytes, .{ .max_records_per_sequence = 2, .max_bytes_per_sequence = 4 });
}

test "WMF embedded EMF scanner cleans up every allocation failure" {
    try successful(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, successful, .{});
}
