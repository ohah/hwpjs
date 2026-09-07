const std = @import("std");
const prefix = @import("type_prefix.zig");
/// Borrowed XYZType wire array (ICC.1:2022 section 10.31).
/// Raw signed s15Fixed16 values; no clipping, conversion, or tag cardinality policy.
pub const Array = struct {
    data: []const u8,
    pub fn count(self: Array) usize {
        return self.data.len / 12;
    }
    pub fn at(self: Array, index: usize) ![3]i32 {
        if (index >= self.count()) return error.InvalidIccXyzIndex;
        const bytes = self.data[index * 12 ..][0..12];
        return .{
            std.mem.readInt(i32, bytes[0..4], .big),
            std.mem.readInt(i32, bytes[4..8], .big),
            std.mem.readInt(i32, bytes[8..12], .big),
        };
    }
};
pub fn parse(data: []const u8) !Array {
    const signature = try prefix.inspect(data);
    if (!std.mem.eql(u8, &signature, "XYZ ")) return error.InvalidIccXyzType;
    if ((data.len - 8) % 12 != 0) return error.InvalidIccXyzSize;
    return .{ .data = data[8..] };
}
