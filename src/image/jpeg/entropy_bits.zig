const Reader = @import("../../binary/reader.zig").Reader;

/// One bounded entropy-coded segment, excluding its terminating marker.
/// Immutable input is borrowed; bits are read MSB first and FF00 becomes FF.
pub const Bits = struct {
    reader: Reader,
    byte: u8 = 0,
    remaining: u4 = 0,

    pub fn init(bytes: []const u8, maximum: usize) !Bits {
        if (bytes.len > maximum) return error.LimitExceeded;
        return .{ .reader = .{ .bytes = bytes } };
    }

    /// Failure preserves byte offset and partially consumed byte state.
    pub fn read(self: *Bits, count: u6) !u32 {
        if (count > 32) return error.InvalidJpegBitCount;
        var next = self.*;
        var value: u32 = 0;
        for (0..count) |_| {
            if (next.remaining == 0) {
                next.byte = try next.reader.readInt(u8);
                if (next.byte == 0xff and try next.reader.readInt(u8) != 0) return error.UnexpectedJpegEntropyMarker;
                next.remaining = 8;
            }
            next.remaining -= 1;
            value = (value << 1) | ((next.byte >> @as(u3, @intCast(next.remaining))) & 1);
        }
        self.* = next;
        return value;
    }

    /// After the caller consumed all coded data, only <=7 all-one pad bits
    /// may remain. An unread whole byte is not padding.
    pub fn finish(self: *Bits) !void {
        if (self.reader.offset != self.reader.bytes.len) return error.TrailingJpegEntropyBytes;
        const mask = (@as(u16, 1) << self.remaining) - 1;
        if (@as(u16, self.byte) & mask != mask) return error.InvalidJpegEntropyPadding;
        self.remaining = 0;
    }
};
