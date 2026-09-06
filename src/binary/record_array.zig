const Reader = @import("reader.zig").Reader;
/// Fixed-width borrowed wire arrays; never infer native struct layout.
pub fn Records(comptime Entry: type, comptime width: usize) type {
    return struct {
        raw: []const u8,
        const Self = @This();
        pub fn parse(bytes: []const u8) !Self {
            if (bytes.len % width != 0) return error.InvalidRecordArraySize;
            return .{ .raw = bytes };
        }
        pub fn count(self: Self) usize {
            return self.raw.len / width;
        }
        pub fn get(self: Self, index: usize) ?Entry {
            if (index >= self.count()) return null;
            var r: Reader = .{ .bytes = self.raw[index * width ..][0..width] };
            return Entry.read(&r) catch unreachable;
        }
    };
}
