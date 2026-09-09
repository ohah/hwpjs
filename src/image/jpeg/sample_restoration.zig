const std = @import("std");

/// Non-differential DCT sample range. This is not lossless prediction or a
/// progressive point transform. Tie rounding is toward positive infinity.
pub const Format = struct {
    level: u16,
    maximum: u16,

    pub fn init(precision: u8) !Format {
        if (precision != 8 and precision != 12) return error.InvalidJpegPrecision;
        const level = @as(u16, 1) << @as(u4, @intCast(precision - 1));
        return .{ .level = level, .maximum = level * 2 - 1 };
    }

    pub fn sample(self: Format, centered: f64) !u16 {
        @setFloatMode(.strict);
        if (!std.math.isFinite(centered)) return error.InvalidJpegSample;
        const level: f64 = @floatFromInt(self.level);
        const maximum: f64 = @floatFromInt(self.maximum);
        if (centered <= -level) return 0;
        if (centered >= maximum - level) return self.maximum;
        // Adding the level first can erase the last bit below a half tie.
        // Only shift after rounding; both remaining additions are integers.
        const lower = @floor(centered);
        const rounded = lower + @as(f64, if (centered - lower >= 0.5) 1 else 0);
        return @intFromFloat(rounded + level);
    }

    /// Failure returns no partial block; caller's input is unchanged.
    pub fn block(self: Format, centered: [64]f64) ![64]u16 {
        var result: [64]u16 = undefined;
        for (centered, 0..) |value, i| result[i] = try self.sample(value);
        return result;
    }
};
