const std = @import("std");
const array = @import("s15_fixed16_array.zig");
const matrix = @import("matrix3_fixed.zig");
pub const Value = struct {
    /// Row-major signed 16.16 wire values, owned by the returned value.
    coefficients: [9]i32,
    /// Invertibility alone does not prove the adopted-white conversion.
    adaptation_deferred: bool = true,
};
/// ICC.1:2022 9.2.15. Unknown tags are unhandled, not validated.
pub fn parse(signature: [4]u8, data: []const u8, edition: @import("edition.zig").Edition) !?Value {
    if (!std.mem.eql(u8, &signature, "chad")) return null;
    if (edition != .v4_2022) return error.UnsupportedIccAdaptationEdition;
    const values = try array.parse(data);
    if (values.count() != 9) return error.InvalidIccAdaptationCount;
    var coefficients: [9]i32 = undefined;
    for (&coefficients, 0..) |*v, i| v.* = try values.at(i);
    if (matrix.determinantNumerator(coefficients) == 0) return error.InvalidIccAdaptationSingular;
    return .{ .coefficients = coefficients };
}
