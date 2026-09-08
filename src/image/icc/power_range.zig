const partition = @import("power_partition.zig");
const affine = @import("affine_value.zig");
const Power = @import("parametric_segments.zig").Power;
const Fraction = @import("fraction.zig").Fraction;
pub const types = @import("power_range_types.zig");
pub const Result = types.Result;

fn endpoint(comptime precision: u16, source: Power, x: Fraction) !?types.Endpoint {
    return .{ .at = x, .value = (try @import("power_ordinate.zig").at(precision, source, x)) orelse return null };
}

/// Complete clipped output range of the active power branch, including folds.
/// Lower affine branch, nearest distances, and F.1 inverse selection are separate.
pub fn build(comptime precision: u16, curve: @import("parametric_curve.zig").Curve) !Result {
    const plan = try partition.partition(curve);
    const source = plan.source orelse return .inactive;
    var lower = source.interval.start;
    var upper = lower;
    var low_base = try affine.at(source.a, source.b, lower);
    var high_base = low_base;
    // Each existing piece is monotone before clipping. Its endpoint extrema
    // suffice, and interior split points belong to the original closed source.
    for (plan.pieces[0..plan.count]) |piece| {
        for ([_]Fraction{ piece.power.interval.start, piece.power.interval.end }) |x| {
            const base = try affine.at(source.a, source.b, x);
            if (try @import("same_power_order.zig").compare(source.g, base, low_base) == .lt) {
                low_base = base;
                lower = x;
            }
            if (try @import("same_power_order.zig").compare(source.g, base, high_base) == .gt) {
                high_base = base;
                upper = x;
            }
        }
    }
    const low = (try endpoint(precision, source, lower)) orelse return .undecided;
    const high = (try endpoint(precision, source, upper)) orelse return .undecided;
    return .{ .range = .{ .source = source, .lower = low, .upper = high } };
}
