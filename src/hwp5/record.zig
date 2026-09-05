const Reader = @import("../binary/reader.zig").Reader;

pub const Record = struct {
    tag: u10,
    level: u10,
    offset: usize,
    /// Borrowed complete header + payload, including unknown tags and extended sizes.
    raw: []const u8,
    payload: []const u8,
};
pub const Options = struct {
    max_payload_bytes: usize = 64 * 1024 * 1024,
    max_records: usize = 1_000_000,
};
/// Framing only. No speculative hierarchy or tag-specific version rules.
/// Failure leaves the cursor/count unchanged; callers must stop or change input.
pub const Iterator = struct {
    reader: Reader,
    options: Options = .{},
    count: usize = 0,

    pub fn init(bytes: []const u8, options: Options) Iterator {
        return .{ .reader = .{ .bytes = bytes }, .options = options };
    }
    pub fn next(self: *Iterator) !?Record {
        if (self.reader.offset == self.reader.bytes.len) return null;
        if (self.count >= self.options.max_records) return error.LimitExceeded;
        var r = self.reader;
        const start = r.offset;
        const bits = try r.readInt(u32);
        const size = if (bits >> 20 == 0xfff) try r.readInt(u32) else bits >> 20;
        if (size > self.options.max_payload_bytes) return error.LimitExceeded;
        const payload = try r.take(size);
        self.reader = r;
        self.count += 1;
        return .{ .tag = @truncate(bits), .level = @truncate(bits >> 10), .offset = start, .raw = r.bytes[start..r.offset], .payload = payload };
    }
};
