const std = @import("std");
const enhanced = @import("enhanced_metafile.zig");

pub const Summary = struct {
    version: u32,
    checksum: u16,
    bytes: usize,
    records: usize,
};

pub fn calculateChecksum(bytes: []const u8) !u16 {
    if (bytes.len % 2 != 0) return error.InvalidWmfEnhancedMetafileWordSize;
    var value: u16 = 0;
    var offset: usize = 0;
    while (offset < bytes.len) : (offset += 2)
        value ^= std.mem.readInt(u16, bytes[offset..][0..2], .little);
    return ~value;
}

pub fn validate(chunks: []const enhanced.Chunk, limit: usize) !Summary {
    if (chunks.len == 0) return error.MissingWmfEnhancedMetafileChunk;
    const first = chunks[0];
    if (chunks.len != @as(usize, first.record_count))
        return error.InvalidWmfEnhancedMetafileSequenceCount;
    const total: usize = first.total_size;
    if (total > limit) return error.LimitExceeded;

    var offset: usize = 0;
    var checksum_xor: u16 = 0;
    var low_byte: ?u8 = null;
    for (chunks) |chunk| {
        if (chunk.record_count != first.record_count or chunk.total_size != first.total_size or
            chunk.version != first.version or chunk.checksum != first.checksum)
            return error.InconsistentWmfEnhancedMetafileSequence;
        if (chunk.data.len != chunk.current_size or chunk.data.len > total - offset)
            return error.InvalidWmfEnhancedMetafileSequenceSize;
        offset += chunk.data.len;
        if (chunk.remaining_bytes != total - offset)
            return error.InvalidWmfEnhancedMetafileSequenceRemainingBytes;
        for (chunk.data) |byte| {
            if (low_byte) |low| {
                checksum_xor ^= @as(u16, low) | (@as(u16, byte) << 8);
                low_byte = null;
            } else low_byte = byte;
        }
    }
    if (offset != total) return error.InvalidWmfEnhancedMetafileSequenceSize;
    if (low_byte != null) return error.InvalidWmfEnhancedMetafileWordSize;
    if (~checksum_xor != first.checksum) return error.InvalidWmfEnhancedMetafileChecksum;
    return .{ .version = first.version, .checksum = first.checksum, .bytes = total, .records = chunks.len };
}

pub fn assemble(a: std.mem.Allocator, chunks: []const enhanced.Chunk, limit: usize) ![]u8 {
    const summary = try validate(chunks, limit);
    const bytes = try a.alloc(u8, summary.bytes);
    var offset: usize = 0;
    for (chunks) |chunk| {
        @memcpy(bytes[offset..][0..chunk.data.len], chunk.data);
        offset += chunk.data.len;
    }
    return bytes;
}
