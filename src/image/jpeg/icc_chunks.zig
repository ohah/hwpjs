const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
pub const identifier = "ICC_PROFILE\x00";
pub const max_chunk_bytes = 65533 - identifier.len - 2;
pub const max_profile_bytes = 255 * max_chunk_bytes;

pub const Chunk = struct {
    sequence: u8,
    count: u8,
    bytes: []const u8,

    pub fn parse(payload: []const u8) !Chunk {
        if (payload.len > 65533) return error.LimitExceeded;
        var r: Reader = .{ .bytes = payload };
        if (!std.mem.eql(u8, try r.take(identifier.len), identifier)) return error.InvalidJpegIccIdentifier;
        const sequence = try r.readInt(u8);
        const count = try r.readInt(u8);
        if (count == 0 or sequence == 0 or sequence > count) return error.InvalidJpegIccSequence;
        return .{ .sequence = sequence, .count = count, .bytes = payload[r.offset..] };
    }
};

/// Fixed bounded directory; chunks borrow immutable input until assemble.
/// Failed additions preserve state. The payload bytes are not ICC-certified.
pub const Collector = struct {
    chunks: [255]?[]const u8 = @splat(null),
    count: ?u8 = null,
    received: u16 = 0,
    bytes: usize = 0,
    limit: usize,

    pub fn init(limit: usize) Collector {
        return .{ .limit = @min(limit, max_profile_bytes) };
    }

    pub fn add(self: *Collector, payload: []const u8) !void {
        const chunk = try Chunk.parse(payload);
        if (self.count) |count| if (count != chunk.count) return error.InconsistentJpegIccCount;
        const index = chunk.sequence - 1;
        if (self.chunks[index] != null) return error.DuplicateJpegIccChunk;
        if (chunk.bytes.len > self.limit - self.bytes) return error.LimitExceeded;
        self.chunks[index] = chunk.bytes;
        self.count = chunk.count;
        self.received += 1;
        self.bytes += chunk.bytes.len;
    }

    /// null is absent; an owned empty slice is a present empty payload.
    /// May be called repeatedly; allocation failure does not consume state.
    pub fn assemble(self: *const Collector, a: std.mem.Allocator) !?[]u8 {
        const count = self.count orelse return null;
        if (self.received != count) return error.MissingJpegIccChunk;
        const bytes = try a.alloc(u8, self.bytes);
        var at: usize = 0;
        for (self.chunks[0..count]) |chunk| {
            const data = chunk.?;
            @memcpy(bytes[at..][0..data.len], data);
            at += data.len;
        }
        return bytes;
    }
};
