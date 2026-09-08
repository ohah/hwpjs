const shape = @import("power_level_shape.zig");
/// Shared symbolic positive-magnitude root descriptor; sign is separate.
/// No evaluation or floating-point approximation is implied by this type.
pub fn Of(comptime bits: u16) type {
    const U = switch (bits) {
        256 => u256,
        512 => u512,
        else => @compileError("unsupported ICC radical width"),
    };
    return struct {
        negative: bool,
        numerator: U,
        denominator: U,
        exponent_numerator: i32,
        exponent_denominator: u32,
        pub fn validate(self: @This()) !void {
            if (self.numerator == 0 or self.denominator == 0) return error.InvalidIccPowerRoot;
            try (shape.Reciprocal{ .numerator = self.exponent_numerator, .denominator = self.exponent_denominator }).validate();
        }
    };
}
