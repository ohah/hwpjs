const Curve = @import("parametric_curve.zig").Curve;
const domain = @import("parametric_domain.zig");
const Fraction = @import("fraction.zig").Fraction;
pub const Interval = @import("unit_interval.zig").Interval;
pub const Linear = struct { interval: Interval, slope: i32, offset: i32 };
pub const Power = struct { interval: Interval, a: i32, b: i32, g: i32, offset: i32 };
/// Table 68 branches before clipping. No monotonicity or inverse validity claim.
pub const Plan = struct { linear: ?Linear, power: ?Power };
pub fn assemble(curve: Curve) !Plan {
    try domain.validate(curve);
    const active = try domain.powerDomain(curve);
    const zero = Fraction{ .numerator = 0, .denominator = 1 };
    const one = Fraction{ .numerator = 1, .denominator = 1 };
    var plan = Plan{ .linear = null, .power = null };
    if (active) |p| plan.power = .{
        .interval = .{ .start = p.start, .end = one },
        .a = p.a,
        .b = p.b,
        .g = p.g,
        .offset = switch (curve.function) {
            .type2 => curve.values[3],
            .type4 => curve.values[5],
            else => 0,
        },
    };
    if (active == null or active.?.start.numerator != 0) {
        plan.linear = .{
            .interval = .{ .start = zero, .end = if (active) |p| p.start else one, .end_included = active == null },
            .slope = switch (curve.function) {
                .type3, .type4 => curve.values[3],
                else => 0,
            },
            .offset = switch (curve.function) {
                .type2 => curve.values[3],
                .type4 => curve.values[6],
                else => 0,
            },
        };
    }
    return plan;
}
