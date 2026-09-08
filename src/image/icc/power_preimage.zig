const Curve = @import("parametric_curve.zig").Curve;
const segments = @import("parametric_segments.zig");
const locations = @import("normalized_level_locations.zig");
const clip = @import("power_clip.zig");
pub const types = @import("power_preimage_types.zig");
pub const Result = types.Result;
pub const Wide = types.Wide;
/// Complete attained preimage of ONE clipped active power branch, or undecided.
/// Lower linear branch, canonical union, inverse selection and nearest-y are separate.
pub fn solve(comptime precision: u16, curve: Curve, n: u128, d: u128) !Result {
    return solveFor(128, precision, curve, n, d);
}
pub fn solveWide(comptime precision: u16, curve: Curve, n: u512, d: u512) !Wide.Result {
    return solveFor(512, precision, curve, n, d);
}
fn solveFor(comptime bits: u16, comptime precision: u16, curve: Curve, n: @import("std").meta.Int(.unsigned, bits), d: @import("std").meta.Int(.unsigned, bits)) !types.Of(bits).Result {
    const inspect = if (bits == 128) locations.inspect else locations.inspectWide;
    const located = try inspect(precision, curve, n, d);
    if (located == .inactive) return .inactive;
    const source = (try segments.assemble(curve)).power orelse return error.InvalidIccPowerPartitionInvariant;
    var result = types.Of(bits).Set{ .source = source };
    if (located == .entire) {
        result.intervals[0] = .{
            .start = .{ .rational = source.interval.start },
            .end = .{ .rational = source.interval.end },
            .start_included = source.interval.start_included,
            .end_included = source.interval.end_included,
        };
        result.interval_count = 1;
        return .{ .set = result };
    }
    for (located.roots.entries[0..located.roots.count]) |entry| {
        if (entry.location == .undecided) return .undecided;
        result.points[result.point_count] = entry;
        result.point_count += 1;
    }
    // At an interior target, clipping introduces no additional solutions.
    if (n != 0 and n != d) return .{ .set = result };
    const clipped = try clip.partition(precision, curve);
    const plan = switch (clipped) {
        .inactive => return error.InvalidIccPowerPartitionInvariant,
        .undecided => return .undecided,
        .plan => |p| p,
    };
    const target: clip.types.Kind = if (n == 0) .zero else .one;
    for (plan.pieces[0..plan.count]) |piece| {
        if (piece.kind != target) continue;
        if (result.interval_count == result.intervals.len) return error.InvalidIccPowerPartitionInvariant;
        result.intervals[result.interval_count] = piece.interval;
        result.interval_count += 1;
    }
    return .{ .set = result };
}
