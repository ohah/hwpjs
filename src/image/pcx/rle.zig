//! Shared PCX scanline-bounded run iterator; failed reads do not advance state.
pub const Run = struct { offset: usize, count: usize, value: u8 };
pub const Iterator = struct {
    bytes: []const u8,
    decoded_bytes: usize,
    scanline_bytes: usize,
    cursor: usize = 0,
    produced: usize = 0,
    pub fn next(self: *Iterator) !?Run {
        if (self.scanline_bytes == 0 or self.produced > self.decoded_bytes) return error.InvalidPcxBytesPerLine;
        if (self.produced == self.decoded_bytes) {
            if (self.cursor != self.bytes.len) return error.InvalidPcxTrailer;
            return null;
        }
        if (self.cursor >= self.bytes.len) return error.TruncatedPcxImage;
        var cursor = self.cursor;
        const code = self.bytes[cursor];
        cursor += 1;
        var count: usize = 1;
        var value = code;
        if (code & 0xc0 == 0xc0) {
            count = code & 0x3f;
            if (count == 0) return error.InvalidPcxRun;
            if (cursor >= self.bytes.len) return error.TruncatedPcxRun;
            value = self.bytes[cursor];
            cursor += 1;
        }
        if (count > self.decoded_bytes - self.produced) return error.PcxRunOverrun;
        if (count > self.scanline_bytes - self.produced % self.scanline_bytes) return error.PcxRunCrossesScanLine;
        const run: Run = .{ .offset = self.produced, .count = count, .value = value };
        self.cursor = cursor;
        self.produced += count;
        return run;
    }
};
