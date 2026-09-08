pub const Fraction = @import("fraction.zig").Fraction;
pub const WideFraction = @import("fraction.zig").WideFraction;
/// Exact normalized output for u512 targets; denominator > 0, numerator <= denominator.
/// Plain integer pair, without an implicit floating-point conversion API.
pub const ExtendedFraction = struct { numerator: u1024, denominator: u1024 };
pub fn Target(comptime bits: u16) type {
    return switch (bits) {
        128 => u128,
        512 => u512,
        else => @compileError("unsupported sampled inverse width"),
    };
}
pub fn Work(comptime bits: u16) type {
    return switch (bits) {
        128 => u256,
        512 => u1024,
        else => @compileError("unsupported sampled inverse width"),
    };
}
pub fn Result(comptime bits: u16) type {
    return switch (bits) {
        128 => WideFraction,
        512 => ExtendedFraction,
        else => @compileError("unsupported sampled inverse width"),
    };
}
