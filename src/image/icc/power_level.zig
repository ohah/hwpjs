/// Exact solutions in the BASE variable z of z^(g/65536)+offset/65536=target/65536.
/// Not x coordinates, interval membership, clipping classification or an inverse API.
pub const Radical = struct {
    negative: bool,
    /// Positive radicand numerator; denominator is exactly 65536.
    numerator: u64,
    /// Magnitude = (numerator/65536)^(exponent_numerator/exponent_denominator).
    exponent_numerator: i32,
    exponent_denominator: u32,
    pub fn validate(self: Radical) !void {
        if (self.numerator == 0 or self.numerator > 4294967295) return error.InvalidIccPowerRoot;
        try (@import("power_level_shape.zig").Reciprocal{ .numerator = self.exponent_numerator, .denominator = self.exponent_denominator }).validate();
    }
};
pub const Root = union(enum) { zero, nonzero: Radical };
/// Lossless adapter; preserve the narrower input validation contract.
pub fn widen(root: Root) !@import("normalized_power_level.zig").Root {
    return widenTo(@import("normalized_power_level.zig").Root, root);
}
pub fn widenExtended(root: Root) !@import("normalized_power_level.zig").Wide.Root {
    return widenTo(@import("normalized_power_level.zig").Wide.Root, root);
}
fn widenTo(comptime Result: type, root: Root) !Result {
    const r = switch (root) {
        .zero => return .zero,
        .nonzero => |value| value,
    };
    try r.validate();
    return .{ .nonzero = .{
        .negative = r.negative,
        .numerator = r.numerator,
        .denominator = 65536,
        .exponent_numerator = r.exponent_numerator,
        .exponent_denominator = r.exponent_denominator,
    } };
}
pub const Finite = struct { roots: [2]Root = undefined, count: usize = 0 };
/// g=0 has value 1 at every nonzero real base; 0^0 remains undefined.
pub const Solutions = union(enum) { all_nonzero, finite: Finite };

/// Preserve radicals symbolically; never approximate, exponentiate or allocate.
pub fn solve(g: i32, offset: i32, target: i32) Solutions {
    const ordinate = @as(i64, target) - offset;
    const shape = @import("power_level_shape.zig").classify(g, ordinate, 65536);
    if (shape == .all_nonzero) return .all_nonzero;
    var result: Finite = .{};
    for (shape.finite.signs[0..shape.finite.count]) |sign| {
        result.roots[result.count] = if (sign == .zero) .zero else .{ .nonzero = .{
            .negative = sign == .negative,
            .numerator = @intCast(@abs(ordinate)),
            .exponent_numerator = shape.finite.reciprocal.?.numerator,
            .exponent_denominator = shape.finite.reciprocal.?.denominator,
        } };
        result.count += 1;
    }
    return .{ .finite = result };
}
