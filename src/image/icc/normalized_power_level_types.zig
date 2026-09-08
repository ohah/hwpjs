pub fn Of(comptime target_bits: u16) type {
    const work_bits = switch (target_bits) {
        128 => 256,
        512 => 1024,
        else => @compileError("unsupported normalized power target width"),
    };
    return struct {
        pub const Target = if (target_bits == 128) u128 else u512;
        pub const Signed = if (work_bits == 256) i256 else i1024;
        pub const Unsigned = if (work_bits == 256) u256 else u1024;
        pub const Radical = @import("power_radical.zig").Of(work_bits);
        pub const Root = union(enum) { zero, nonzero: Radical };
        pub const Finite = struct { roots: [2]Root = undefined, count: usize = 0 };
        pub const Solutions = union(enum) { all_nonzero, finite: Finite };
    };
}
