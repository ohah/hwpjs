pub const Scaling = enum { nearest_normalized };
pub const Channels = struct {
    values: [4]u32,
    pub fn init(values: [4]u32, bits: u16) !Channels {
        if (bits != 16 and bits != 32) return error.InvalidBmpBitCount;
        var used: u32 = 0;
        for (values, 0..) |mask, i| {
            if (mask == 0) {
                if (i < 3) return error.InvalidBmpMask;
                continue;
            }
            if (bits == 16 and mask >> 16 != 0) return error.InvalidBmpMask;
            if (used & mask != 0) return error.OverlappingBmpMasks;
            const shifted = mask >> @intCast(@ctz(mask));
            if (shifted & (shifted +% 1) != 0) return error.InvalidBmpMask;
            used |= mask;
        }
        return .{ .values = values };
    }
    pub fn rgba(self: Channels, pixel: u32, scaling: Scaling) [4]u8 {
        _ = scaling;
        var result: [4]u8 = undefined;
        for (self.values, 0..) |mask, i| {
            if (mask == 0) {
                result[i] = 255;
                continue;
            }
            const shift: u5 = @intCast(@ctz(mask));
            const maximum = mask >> shift;
            const value = (pixel & mask) >> shift;
            result[i] = @intCast((@as(u64, value) * 255 + maximum / 2) / maximum);
        }
        return result;
    }
};
