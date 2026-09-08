const Curve = @import("parametric_curve.zig").Curve;
const Evidence = @import("trend_evidence.zig").Evidence;
pub const Trend = @import("trend_evidence.zig").Trend;
/// Classify the entire clipped curve on [0,1]. No strictness or inverse certificate.
pub fn inspect(comptime precision: u16, curve: Curve) !Trend {
    const plan = try @import("parametric_segments.zig").assemble(curve);
    var evidence: Evidence = .{};
    if (plan.linear) |linear| {
        const pieces = try @import("linear_clip.zig").partition(linear);
        for (pieces.pieces[0..pieces.count]) |piece| evidence.add(piece.direction);
    }
    const power = try @import("power_clip.zig").partition(precision, curve);
    switch (power) {
        .inactive => {},
        .undecided => evidence.unknown = true,
        .plan => |pieces| for (pieces.pieces[0..pieces.count]) |piece| evidence.add(piece.direction),
    }
    const boundary = try @import("parametric_jump.zig").inspect(precision, curve);
    if (boundary == .boundary) evidence.jump(boundary.boundary.order);
    return evidence.finish();
}
