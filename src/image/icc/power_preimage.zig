const Curve = @import("parametric_curve.zig").Curve;
const segments = @import("parametric_segments.zig");
const locations = @import("normalized_level_locations.zig");
const clip = @import("power_clip.zig");
pub const types = @import("power_preimage_types.zig");
pub const Result = types.Result;
/// Complete attained preimage of ONE clipped active power branch, or undecided.
/// Lower linear branch, canonical union, inverse selection and nearest-y are separate.
pub fn solve(comptime precision: u16, curve: Curve, n: u128, d: u128) !Result {
    const located = try locations.inspect(precision, curve, n, d);
    if (located == .inactive) return .inactive;
    const source = (try segments.assemble(curve)).power orelse return error.InvalidIccPowerPartitionInvariant;
    var result = types.Set{ .source = source };
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
