const std = @import("std");

pub const signature: u32 = 0x08007664;
pub const maximum_axes: u32 = 16;
pub const minimum_size: usize = 8;
pub const maximum_size: usize = minimum_size + maximum_axes * 4;
pub const DesignVector = struct {
    count: u32,
    value_bytes: []const u8,
    raw: []const u8,

    pub fn valueAt(self: DesignVector, index: usize) !i32 {
        if (index >= self.count) return error.EmfDesignVectorIndexOutOfBounds;
        return std.mem.readInt(i32, self.value_bytes[index * 4 ..][0..4], .little);
    }
};

pub fn parse(bytes: []const u8) !DesignVector {
    if (bytes.len < minimum_size or bytes.len > maximum_size) return error.InvalidEmfDesignVectorSize;
    if (std.mem.readInt(u32, bytes[0..4], .little) != signature) return error.InvalidEmfDesignVectorSignature;
    const count = std.mem.readInt(u32, bytes[4..8], .little);
    if (count > maximum_axes) return error.InvalidEmfDesignVectorAxes;
    const expected: u64 = minimum_size + @as(u64, count) * 4;
    if (expected != bytes.len) return error.InvalidEmfDesignVectorSize;
    return .{ .count = count, .value_bytes = bytes[8..], .raw = bytes };
}

test "DesignVector requires exact count-derived extent and preserves signed axes" {
    var bytes = [_]u8{0} ** 72;
    std.mem.writeInt(u32, bytes[0..4], signature, .little);
    std.mem.writeInt(u32, bytes[4..8], 16, .little);
    std.mem.writeInt(i32, bytes[8..12], std.math.minInt(i32), .little);
    const value = try parse(&bytes);
    try std.testing.expectEqual(@as(i32, std.math.minInt(i32)), try value.valueAt(0));
    try std.testing.expectError(error.EmfDesignVectorIndexOutOfBounds, value.valueAt(16));
    try std.testing.expectError(error.InvalidEmfDesignVectorSize, parse(bytes[0..71]));
    std.mem.writeInt(u32, bytes[4..8], 17, .little);
    try std.testing.expectError(error.InvalidEmfDesignVectorAxes, parse(&bytes));
}
