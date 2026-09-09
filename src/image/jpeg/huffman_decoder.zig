const Table = @import("huffman.zig").Table;
const lengths = @import("huffman_lengths.zig");
const Bits = @import("entropy_bits.zig").Bits;

/// Canonical code ranges own their values; symbol order borrows the DHT input.
/// Duplicate/raw symbols remain representable; DC/AC meaning is separate.
pub const Decoder = struct {
    first: [16]u32,
    count: [16]u8,
    offset: [16]usize,
    symbols: []const u8,

    pub fn init(table: Table) !Decoder {
        const stats = try lengths.inspect(table.bits);
        if (stats.symbols != table.symbols.len) return error.InvalidJpegHuffmanSymbolCount;
        if (stats.symbols == 0) return error.EmptyJpegHuffmanTable;
        var result: Decoder = .{ .first = undefined, .count = table.bits.*, .offset = undefined, .symbols = table.symbols };
        var code: u32 = 0;
        var at: usize = 0;
        for (table.bits, 0..) |count, i| {
            result.first[i] = code;
            result.offset[i] = at;
            at += count;
            code = (code + count) << 1;
        }
        return result;
    }

    /// At most 16 bits; a bad/truncated prefix does not consume any input.
    pub fn decode(self: *const Decoder, bits: *Bits) !u8 {
        var next = bits.*;
        var code: u32 = 0;
        for (0..16) |i| {
            code = (code << 1) | try next.read(1);
            if (code >= self.first[i] and code - self.first[i] < self.count[i]) {
                const symbol = self.symbols[self.offset[i] + code - self.first[i]];
                bits.* = next;
                return symbol;
            }
        }
        return error.InvalidJpegHuffmanCode;
    }
};
