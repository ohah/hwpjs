const std = @import("std");
const t = std.testing;
const records = @import("records.zig");
const enhanced = @import("enhanced_metafile.zig");

fn record(parameters: []const u8) records.Record {
    return .{ .offset = 0, .size_words = 3 + @as(u32, @intCast(parameters.len / 2)), .function = 0x0626, .parameters = parameters, .end = 6 + parameters.len };
}

fn validParameters() [42]u8 {
    var bytes = [_]u8{0} ** 42;
    std.mem.writeInt(u16, bytes[0..2], 0x000f, .little);
    std.mem.writeInt(u16, bytes[2..4], 38, .little);
    std.mem.writeInt(u32, bytes[4..8], 0x43464d57, .little);
    std.mem.writeInt(u32, bytes[8..12], 1, .little);
    std.mem.writeInt(u32, bytes[12..16], 0x00010000, .little);
    std.mem.writeInt(u16, bytes[16..18], 0x1234, .little);
    std.mem.writeInt(u32, bytes[22..26], 2, .little);
    std.mem.writeInt(u32, bytes[26..30], 4, .little);
    std.mem.writeInt(u32, bytes[30..34], 4, .little);
    std.mem.writeInt(u32, bytes[34..38], 8, .little);
    bytes[38..42].* = .{ 1, 2, 3, 4 };
    return bytes;
}

test "WMF enhanced metafile parses the specified comment header" {
    const bytes = validParameters();
    const value = try enhanced.parse(record(&bytes));
    try t.expectEqual(@as(u32, 0x00010000), value.version);
    try t.expectEqual(@as(u16, 0x1234), value.checksum);
    try t.expectEqual(@as(u32, 2), value.record_count);
    try t.expectEqual(@as(u32, 4), value.current_size);
    try t.expectEqual(@as(u32, 4), value.remaining_bytes);
    try t.expectEqual(@as(u32, 8), value.total_size);
    try t.expectEqualSlices(u8, &.{ 1, 2, 3, 4 }, value.data);
}

test "WMF enhanced metafile rejects each mandatory header invariant" {
    var bytes = validParameters();
    bytes[4] = 0;
    try t.expectError(error.InvalidWmfCommentIdentifier, enhanced.parse(record(&bytes)));
    bytes = validParameters();
    bytes[8] = 2;
    try t.expectError(error.InvalidWmfCommentType, enhanced.parse(record(&bytes)));
    bytes = validParameters();
    bytes[18] = 1;
    try t.expectError(error.InvalidWmfEnhancedMetafileFlags, enhanced.parse(record(&bytes)));
    bytes = validParameters();
    bytes[22] = 0;
    try t.expectError(error.InvalidWmfEnhancedMetafileRecordCount, enhanced.parse(record(&bytes)));
    bytes = validParameters();
    std.mem.writeInt(u32, bytes[30..34], 5, .little);
    try t.expectError(error.InvalidWmfEnhancedMetafileRemainingBytes, enhanced.parse(record(&bytes)));
}

test "WMF enhanced metafile rejects a self-consistent oversized chunk" {
    var bytes = [_]u8{0} ** 8232;
    std.mem.writeInt(u16, bytes[0..2], 0x000f, .little);
    std.mem.writeInt(u16, bytes[2..4], 8227, .little);
    std.mem.writeInt(u32, bytes[4..8], 0x43464d57, .little);
    std.mem.writeInt(u32, bytes[8..12], 1, .little);
    std.mem.writeInt(u32, bytes[12..16], 0x00010000, .little);
    std.mem.writeInt(u32, bytes[22..26], 1, .little);
    std.mem.writeInt(u32, bytes[26..30], 8193, .little);
    std.mem.writeInt(u32, bytes[34..38], 8193, .little);
    try t.expectError(error.InvalidWmfEnhancedMetafileChunkSize, enhanced.parse(record(&bytes)));
}
