const std = @import("std");
const records = @import("records.zig");
const escape = @import("escape.zig");

pub const Chunk = struct {
    version: u32,
    checksum: u16,
    record_count: u32,
    current_size: u32,
    remaining_bytes: u32,
    total_size: u32,
    data: []const u8,
};

pub fn parse(record: records.Record) !Chunk {
    const value = try escape.parse(record);
    if (value.function_raw != 0x000f) return error.InvalidWmfEnhancedMetafileFunction;
    if (value.data.len < 34) return error.InvalidWmfEnhancedMetafileSize;
    if (std.mem.readInt(u32, value.data[0..4], .little) != 0x43464d57)
        return error.InvalidWmfCommentIdentifier;
    if (std.mem.readInt(u32, value.data[4..8], .little) != 1)
        return error.InvalidWmfCommentType;
    if (std.mem.readInt(u32, value.data[14..18], .little) != 0)
        return error.InvalidWmfEnhancedMetafileFlags;

    const record_count = std.mem.readInt(u32, value.data[18..22], .little);
    const current_size = std.mem.readInt(u32, value.data[22..26], .little);
    const remaining_bytes = std.mem.readInt(u32, value.data[26..30], .little);
    const total_size = std.mem.readInt(u32, value.data[30..34], .little);
    if (record_count == 0) return error.InvalidWmfEnhancedMetafileRecordCount;
    if (current_size > 8192) return error.InvalidWmfEnhancedMetafileChunkSize;
    if (value.data.len - 34 != current_size) return error.InvalidWmfEnhancedMetafileSize;
    if (@as(u64, current_size) + remaining_bytes > total_size)
        return error.InvalidWmfEnhancedMetafileRemainingBytes;

    return .{
        .version = std.mem.readInt(u32, value.data[8..12], .little),
        .checksum = std.mem.readInt(u16, value.data[12..14], .little),
        .record_count = record_count,
        .current_size = current_size,
        .remaining_bytes = remaining_bytes,
        .total_size = total_size,
        .data = value.data[34..],
    };
}

pub fn isConformanceError(err: anyerror) bool {
    return switch (err) {
        error.InvalidWmfEnhancedMetafileFunction,
        error.InvalidWmfEnhancedMetafileSize,
        error.InvalidWmfCommentIdentifier,
        error.InvalidWmfCommentType,
        error.InvalidWmfEnhancedMetafileFlags,
        error.InvalidWmfEnhancedMetafileRecordCount,
        error.InvalidWmfEnhancedMetafileChunkSize,
        error.InvalidWmfEnhancedMetafileRemainingBytes,
        => true,
        else => false,
    };
}
