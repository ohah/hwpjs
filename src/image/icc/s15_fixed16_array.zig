const std = @import("std");
const prefix = @import("type_prefix.zig");
/// Borrowed signed wire coefficients; scale is 65536. No tag-specific policy.
pub const Array = struct {
    data: []const u8,
    pub fn count(self: Array) usize {
        return self.data.len / 4;
    }
    pub fn at(self: Array, index: usize) !i32 {
        if (index >= self.count()) return error.InvalidIccFixedArrayIndex;
        return std.mem.readInt(i32, self.data[index * 4 ..][0..4], .big);
    }
};
pub fn parse(data: []const u8) !Array {
    const signature = try prefix.inspect(data);
    if (!std.mem.eql(u8, &signature, "sf32")) return error.InvalidIccFixedArrayType;
    if ((data.len - 8) % 4 != 0) return error.InvalidIccFixedArraySize;
    return .{ .data = data[8..] };
}
