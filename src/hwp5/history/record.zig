const Reader = @import("../../binary/reader.zig").Reader;
pub const Options = struct {
    max_payload_bytes: usize = 64 * 1024 * 1024,
    max_records: usize = 1_000_000,
};
pub const Record = struct {
    tag: u8,
    offset: usize,
    raw: []const u8,
    payload: []const u8,
};
/// Decrypted/decompressed history framing: BYTE tag + UINT byte length.
/// Not the ordinary HWP 10/10/12-bit record header. All slices borrow input.
pub const Iterator = struct {
    reader: Reader,
    options: Options,
    count: usize = 0,
    pub fn init(bytes: []const u8, options: Options) Iterator {
        return .{ .reader = .{ .bytes = bytes }, .options = options };
    }
    /// Failure does not advance the cursor or count.
    pub fn next(self: *Iterator) !?Record {
        if (self.reader.offset == self.reader.bytes.len) return null;
        if (self.count >= self.options.max_records) return error.LimitExceeded;
        var r = self.reader;
        const offset = r.offset;
        const tag = try r.readInt(u8);
        const len = try r.readInt(u32);
        if (len > self.options.max_payload_bytes) return error.LimitExceeded;
        const payload = try r.take(len);
        self.reader = r;
        self.count += 1;
        return .{ .tag = tag, .offset = offset, .raw = r.bytes[offset..r.offset], .payload = payload };
    }
};
