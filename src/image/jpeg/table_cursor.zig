const Reader = @import("../../binary/reader.zig").Reader;
pub const Options = struct { max_bytes: usize = 65533, max_tables: usize = 4096 };
/// Shared atomic cursor for a nonempty DQT/DHT marker payload.
pub const Cursor = struct {
    reader: Reader,
    options: Options,
    count: usize = 0,
    pub fn init(bytes: []const u8, options: Options) !Cursor {
        if (bytes.len > options.max_bytes) return error.LimitExceeded;
        if (bytes.len == 0) return error.EmptyJpegTableSegment;
        return .{ .reader = .{ .bytes = bytes }, .options = options };
    }
    pub fn begin(self: Cursor) !?Reader {
        if (self.reader.offset == self.reader.bytes.len) return null;
        if (self.count >= self.options.max_tables) return error.LimitExceeded;
        return self.reader;
    }
    pub fn commit(self: *Cursor, reader: Reader) void {
        self.reader = reader;
        self.count += 1;
    }
};
pub const Selector = struct { high: u8, destination: u8 };
pub fn selector(byte: u8) !Selector {
    if (byte >> 4 > 1 or byte & 15 > 3) return error.InvalidJpegTableSelector;
    return .{ .high = byte >> 4, .destination = byte & 15 };
}
