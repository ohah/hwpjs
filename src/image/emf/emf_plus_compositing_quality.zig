pub const CompositingQuality = enum(u8) {
    default = 1,
    high_speed = 2,
    high_quality = 3,
    gamma_corrected = 4,
    assume_linear = 5,

    pub fn parse(raw: u8) !CompositingQuality {
        if (raw < @intFromEnum(CompositingQuality.default) or raw > @intFromEnum(CompositingQuality.assume_linear))
            return error.InvalidEmfPlusCompositingQuality;
        return @enumFromInt(raw);
    }
};

pub const WireValue = union(enum) {
    defined: CompositingQuality,
    invalid_windows_default: u8,

    pub fn parse(raw: u8) WireValue {
        return .{ .defined = CompositingQuality.parse(raw) catch return .{ .invalid_windows_default = raw } };
    }

    pub fn effective(self: WireValue) CompositingQuality {
        return switch (self) {
            .defined => |value| value,
            .invalid_windows_default => .default,
        };
    }
};

test "EMF+ CompositingQuality separates the official domain from Windows fallback" {
    const std = @import("std");
    for (0..256) |raw_usize| {
        const raw: u8 = @intCast(raw_usize);
        const wire = WireValue.parse(raw);
        if (raw >= 1 and raw <= 5) {
            const defined = try CompositingQuality.parse(raw);
            try std.testing.expectEqual(raw, @intFromEnum(defined));
            try std.testing.expectEqual(defined, wire.defined);
            try std.testing.expectEqual(defined, wire.effective());
        } else {
            try std.testing.expectError(error.InvalidEmfPlusCompositingQuality, CompositingQuality.parse(raw));
            try std.testing.expectEqual(raw, wire.invalid_windows_default);
            try std.testing.expectEqual(CompositingQuality.default, wire.effective());
        }
    }
}
