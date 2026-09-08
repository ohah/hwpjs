pub const Target = @import("fraction.zig").Normalized(512);
pub const Radical = @import("power_radical.zig").Of(512);
pub const Result = union(enum) { rational: Target, power: Radical };
