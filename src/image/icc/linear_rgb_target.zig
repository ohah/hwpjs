pub const Target = @import("trc_inverse_types.zig").Target;
pub const Clipping = enum { none, below, above };
pub const Result = struct { target: Target, clipping: Clipping };
/// F.3 clips linear RGB after the inverse matrix, not PCS XYZ before it.
/// No signed cast of the denominator, including full-width u128 inputs.
pub fn normalize(numerator: i128, denominator: u128) !Result {
    if (denominator == 0) return error.InvalidIccMatrixCoordinate;
    if (numerator < 0) return .{ .target = .{ .numerator = 0, .denominator = 1 }, .clipping = .below };
    const n: u128 = @intCast(numerator);
    if (n > denominator) return .{ .target = .{ .numerator = 1, .denominator = 1 }, .clipping = .above };
    return .{ .target = .{ .numerator = n, .denominator = denominator }, .clipping = .none };
}
