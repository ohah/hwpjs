const std = @import("std");
const framing = @import("../record.zig");
pub const tag = 28;
pub const data_size = 256;
pub const Envelope = struct { data: *const [data_size]u8, ciphertext: []const u8 };
/// Exact observed envelope signatures, not decompression-error fallback.
pub fn hasSignature(bytes: []const u8) bool {
    if (bytes.len < 4) return false;
    const bits = std.mem.readInt(u32, bytes[0..4], .little);
    if (bits == (tag | (data_size << 20))) return true;
    return bits == (tag | (0xfff << 20)) and bytes.len >= 8 and std.mem.readInt(u32, bytes[4..8], .little) == data_size;
}
pub fn parse(bytes: []const u8, max_ciphertext: usize) !Envelope {
    var it = framing.Iterator.init(bytes, .{ .max_records = 1 });
    const r = try it.next() orelse return error.UnexpectedEnd;
    if (r.tag != tag or r.level != 0) return error.InvalidDistributionRecord;
    if (r.payload.len != data_size) return error.InvalidDistributionDataSize;
    const payload = bytes[r.raw.len..];
    if (payload.len > max_ciphertext) return error.LimitExceeded;
    if (payload.len == 0 or payload.len % 16 != 0) return error.InvalidDistributionBlockSize;
    return .{ .data = r.payload[0..data_size], .ciphertext = payload };
}
