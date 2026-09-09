const Frame = @import("frame.zig").Frame;
pub const Kind = enum { coefficient, end_of_block, zero_run };
pub const Ac = struct { kind: Kind, zeros: u8, width: u8 };

/// Sequential Huffman coding only. Progressive EOB runs and lossless categories
/// must not be interpreted with this table.
pub const Rules = struct {
    dc_maximum: u8,
    ac_maximum: u8,

    pub fn forFrame(frame: Frame) !Rules {
        if (frame.process.coding != .huffman or (frame.process.mode != .baseline and frame.process.mode != .sequential)) return error.UnsupportedJpegSequentialProcess;
        return switch (frame.precision) {
            8 => .{ .dc_maximum = 11, .ac_maximum = 10 },
            12 => .{ .dc_maximum = 15, .ac_maximum = 14 },
            else => error.InvalidJpegPrecision,
        };
    }

    pub fn dc(self: Rules, symbol: u8) !u8 {
        if (symbol > self.dc_maximum) return error.InvalidJpegDcCategory;
        return symbol;
    }

    pub fn ac(self: Rules, symbol: u8) !Ac {
        if (symbol == 0) return .{ .kind = .end_of_block, .zeros = 0, .width = 0 };
        if (symbol == 0xf0) return .{ .kind = .zero_run, .zeros = 16, .width = 0 };
        const width = symbol & 15;
        if (width == 0 or width > self.ac_maximum) return error.InvalidJpegAcSymbol;
        return .{ .kind = .coefficient, .zeros = symbol >> 4, .width = width };
    }
};
