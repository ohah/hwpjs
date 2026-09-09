const Reader = @import("../../binary/reader.zig").Reader;
/// Borrowed length-prefixed data, including its zero terminator.
pub const View = struct {
    raw: []const u8,
    payload_bytes: usize,
    blocks: usize,
    pub fn iterator(self: View) Iterator {
        return .{ .reader = .{ .bytes = self.raw } };
    }
};
pub fn read(reader: *Reader, max_blocks: usize) !View {
    var r = reader.*;
    const start = r.offset;
    var blocks: usize = 0;
    var bytes: usize = 0;
    while (true) {
        const size = try r.readInt(u8);
        if (size == 0) break;
        if (blocks == max_blocks) return error.LimitExceeded;
        _ = try r.take(size);
        blocks += 1;
        bytes += size; // bounded by the input span
    }
    reader.* = r;
    return .{ .raw = r.bytes[start..r.offset], .payload_bytes = bytes, .blocks = blocks };
}
pub const Iterator = struct {
    reader: Reader,
    done: bool = false,
    pub fn next(self: *Iterator) !?[]const u8 {
        if (self.done) return null;
        var r = self.reader;
        const size = try r.readInt(u8);
        const data = try r.take(size);
        self.reader = r;
        self.done = size == 0;
        return if (self.done) null else data;
    }
};
