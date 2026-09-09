const sub = @import("sub_blocks.zig");
/// LSB-first codes cross sub-block boundaries without padding or reset.
pub const Reader = struct {
    chunks: sub.Iterator,
    chunk: []const u8 = &.{},
    offset: usize = 0,
    bits: u32 = 0,
    count: u5 = 0,
    bytes: usize = 0,
    pub fn read(self: *Reader, width: u4) !u16 {
        if (width < 3 or width > 12) return error.InvalidGifCodeSize;
        while (self.count < width) {
            if (self.offset == self.chunk.len) {
                self.chunk = try self.chunks.next() orelse return error.MissingGifEndCode;
                self.offset = 0;
            }
            self.bits |= @as(u32, self.chunk[self.offset]) << self.count;
            self.offset += 1;
            self.bytes += 1;
            self.count += 8;
        }
        const code: u16 = @intCast(self.bits & ((@as(u32, 1) << width) - 1));
        self.bits >>= width;
        self.count -= width;
        return code;
    }
};
