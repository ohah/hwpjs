const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
pub const signature = "\x89PNG\r\n\x1a\n";
pub const Options = struct { max_bytes: usize = 64 * 1024 * 1024, max_chunk_bytes: usize = 16 * 1024 * 1024, max_chunks: usize = 65536 };
pub const Chunk = struct {
    name: [4]u8,
    payload: []const u8,
    raw: []const u8,
    pub fn is(self: Chunk, name: *const [4]u8) bool {
        return std.mem.eql(u8, &self.name, name);
    }
    pub fn critical(self: Chunk) bool {
        return self.name[0] & 32 == 0;
    }
    pub fn reserved(self: Chunk) bool {
        return self.name[2] & 32 != 0;
    }
};
pub const Iterator = struct {
    reader: Reader,
    options: Options,
    count: usize = 0,
    pub fn init(bytes: []const u8, options: Options) !Iterator {
        if (bytes.len > options.max_bytes) return error.LimitExceeded;
        var r: Reader = .{ .bytes = bytes };
        if (!std.mem.eql(u8, try r.take(8), signature)) return error.InvalidPngSignature;
        return .{ .reader = r, .options = options };
    }
    /// Validates all CRCs; atomic on a failed chunk. All slices borrow the input.
    /// A reserved third-letter bit is exposed, not silently treated as a known type.
    pub fn next(self: *Iterator) !?Chunk {
        if (self.reader.offset == self.reader.bytes.len) return null;
        if (self.count >= self.options.max_chunks) return error.LimitExceeded;
        var r = self.reader;
        const start = r.offset;
        const length = std.mem.readInt(u32, (try r.take(4))[0..4], .big);
        if (length > 0x7fffffff) return error.InvalidPngChunkLength;
        if (length > self.options.max_chunk_bytes) return error.LimitExceeded;
        const type_start = r.offset;
        const name = (try r.take(4))[0..4].*;
        for (name) |c| if (!std.ascii.isAlphabetic(c)) return error.InvalidPngChunkType;
        const payload = try r.take(length);
        const crc_end = r.offset;
        const crc = std.mem.readInt(u32, (try r.take(4))[0..4], .big);
        if (std.hash.Crc32.hash(r.bytes[type_start..crc_end]) != crc) return error.InvalidChecksum;
        self.reader = r;
        self.count += 1;
        return .{ .name = name, .payload = payload, .raw = r.bytes[start..r.offset] };
    }
};
