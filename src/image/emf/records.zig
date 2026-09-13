const std = @import("std");

pub const Record = struct {
    offset: usize,
    kind: u32,
    size: u32,
    bytes: []const u8,
    end: usize,
};

pub const Iterator = struct {
    bytes: []const u8,
    offset: usize = 0,

    pub fn next(self: *Iterator) !?Record {
        if (self.offset == self.bytes.len) return null;
        if (self.bytes.len - self.offset < 8) return error.TruncatedEmfRecord;
        const start = self.offset;
        const size = std.mem.readInt(u32, self.bytes[start + 4 ..][0..4], .little);
        if (size < 8 or size % 4 != 0) return error.InvalidEmfRecordSize;
        if (size > self.bytes.len - start) return error.TruncatedEmfRecord;
        const end = start + size;
        const value: Record = .{
            .offset = start,
            .kind = std.mem.readInt(u32, self.bytes[start..][0..4], .little),
            .size = size,
            .bytes = self.bytes[start..end],
            .end = end,
        };
        self.offset = end;
        return value;
    }
};
