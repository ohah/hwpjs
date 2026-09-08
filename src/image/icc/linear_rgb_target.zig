pub const Clipping = enum { none, below, above };
pub const Target = Of(128).Target;
pub const Result = Of(128).Result;
pub const normalize = Of(128).normalize;
pub const Wide = Of(512);
/// F.3 clips linear RGB after the inverse matrix, not PCS XYZ before it.
/// Both widths share the rule; no signed cast of full-width denominators.
pub fn Of(comptime bits: u16) type {
    const S = switch (bits) {
        128 => i128,
        512 => i512,
        else => @compileError("unsupported linear RGB width"),
    };
    const U = switch (bits) {
        128 => u128,
        512 => u512,
        else => unreachable,
    };
    return struct {
        pub const Target = @import("fraction.zig").Normalized(bits);
        pub const Result = struct { target: @import("fraction.zig").Normalized(bits), clipping: Clipping };
        pub fn normalize(numerator: S, denominator: U) !@This().Result {
            if (denominator == 0) return error.InvalidIccMatrixCoordinate;
            if (numerator < 0) return .{ .target = .{ .numerator = 0, .denominator = 1 }, .clipping = .below };
            const n: U = @intCast(numerator);
            if (n > denominator) return .{ .target = .{ .numerator = 1, .denominator = 1 }, .clipping = .above };
            return .{ .target = .{ .numerator = n, .denominator = denominator }, .clipping = .none };
        }
    };
}
