const std = @import("std");
const prefix = @import("type_prefix.zig");
pub const Parameter = enum { g, a, b, c, d, e, f };
pub const Function = enum(u16) {
    type0,
    type1,
    type2,
    type3,
    type4,
    pub fn count(self: Function) usize {
        return switch (self) {
            .type0 => 1,
            .type1 => 3,
            .type2 => 4,
            .type3 => 5,
            .type4 => 7,
        };
    }
};
/// Owned raw s15Fixed16 parameters. Absence is distinct from a present zero.
pub const Curve = struct {
    function: Function,
    values: [7]i32,
    pub fn get(self: Curve, parameter: Parameter) ?i32 {
        const index = @intFromEnum(parameter);
        return if (index < self.function.count()) self.values[index] else null;
    }
};
/// ICC.1:2022 Tables 67/68 wire shape only; no function evaluation/validity claim.
pub fn parse(data: []const u8) !Curve {
    const signature = try prefix.inspect(data);
    if (!std.mem.eql(u8, &signature, "para")) return error.InvalidIccParametricType;
    if (data.len < 12) return error.InvalidIccParametricSize;
    if (!std.mem.allEqual(u8, data[10..12], 0)) return error.InvalidIccParametricReserved;
    const raw = std.mem.readInt(u16, data[8..10], .big);
    if (raw > 4) return error.UnsupportedIccParametricFunction;
    const function: Function = @enumFromInt(raw);
    const count = function.count();
    if (data.len != 12 + count * 4) return error.InvalidIccParametricSize;
    var result: Curve = .{ .function = function, .values = @splat(0) };
    for (result.values[0..count], 0..) |*value, i| value.* = std.mem.readInt(i32, data[12 + i * 4 ..][0..4], .big);
    return result;
}
