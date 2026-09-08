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
        if (self.numerator == 0 or self.numerator > 4294967295 or
            (self.exponent_numerator != 65536 and self.exponent_numerator != -65536) or
            self.exponent_denominator == 0 or self.exponent_denominator > 2147483648)
            return error.InvalidIccPowerRoot;
    }
};
pub const Root = union(enum) { zero, nonzero: Radical };
pub const Finite = struct { roots: [2]Root = undefined, count: usize = 0 };
/// g=0 has value 1 at every nonzero real base; 0^0 remains undefined.
pub const Solutions = union(enum) { all_nonzero, finite: Finite };

/// Preserve radicals symbolically; never approximate, exponentiate or allocate.
pub fn solve(g: i32, offset: i32, target: i32) Solutions {
    const ordinate = @as(i64, target) - offset;
    if (g == 0) return if (ordinate == 65536) .all_nonzero else .{ .finite = .{} };
    if (ordinate == 0) {
        var result: Finite = .{};
        if (g > 0) {
            result.roots[0] = .zero;
            result.count = 1;
        }
        return .{ .finite = result };
    }
    const exponent = @import("fixed16_exponent.zig").classify(g);
    const magnitude = Radical{
        .negative = false,
        .numerator = @intCast(if (ordinate < 0) -ordinate else ordinate),
        .exponent_numerator = if (g < 0) -65536 else 65536,
        .exponent_denominator = @intCast(if (g < 0) -@as(i64, g) else g),
    };
    var result: Finite = .{};
    if (ordinate > 0) {
        result.roots[0] = .{ .nonzero = magnitude };
        result.count = 1;
    }
    // Negative bases require an integer exponent. Its parity determines the sign.
    if ((ordinate < 0 and exponent == .odd_integer) or (ordinate > 0 and exponent == .even_integer)) {
        var negative = magnitude;
        negative.negative = true;
        result.roots[result.count] = .{ .nonzero = negative };
        result.count += 1;
    }
    return .{ .finite = result };
}
