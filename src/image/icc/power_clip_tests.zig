const std = @import("std");
const Curve = @import("parametric_curve.zig").Curve;
const clip = @import("power_clip.zig");
const Kind = clip.types.Kind;
test "power clipping covers both sides of a fold with six ordered pieces" {
    for ([_]bool{ false, true }) |reverse| {
        const curve = Curve{ .function = .type4, .values = .{ 131072, if (reverse) -262144 else 262144, if (reverse) 131072 else -131072, 0, 0, -32768, 0 } };
        const plan = (try clip.partition(256, curve)).plan;
        try std.testing.expectEqual(@as(usize, 6), plan.count);
        for ([_]Kind{ .one, .power, .zero, .zero, .power, .one }, 0..) |kind, i| {
            const piece = plan.pieces[i];
            try std.testing.expectEqual(kind, piece.kind);
            try std.testing.expect(piece.interval.start_included);
            try std.testing.expectEqual(i == 5, piece.interval.end_included);
        }
        try std.testing.expectEqual(.decreasing, plan.pieces[1].direction);
        try std.testing.expectEqual(.increasing, plan.pieces[4].direction);
        try std.testing.expectEqual(.one, plan.pieces[0].interval.end.level_root.level);
        try std.testing.expectEqual(.zero, plan.pieces[1].interval.end.level_root.level);
        try std.testing.expectEqual(.eq, try plan.pieces[2].interval.end.rational.order(.{ .numerator = 1, .denominator = 2 }));
    }
}
test "power clipping owns terminal threshold as a singleton and keeps raw source" {
    const curve = Curve{ .function = .type0, .values = .{ 65536, 0, 0, 0, 0, 0, 0 } };
    const plan = (try clip.partition(256, curve)).plan;
    try std.testing.expectEqual(@as(usize, 2), plan.count);
    try std.testing.expectEqual(.power, plan.pieces[0].kind);
    try std.testing.expect(!plan.pieces[0].interval.end_included);
    try std.testing.expectEqual(.one, plan.pieces[1].kind);
    try std.testing.expectEqual(.eq, try plan.pieces[1].interval.start.rational.order(plan.pieces[1].interval.end.rational));
    try std.testing.expect(plan.pieces[1].interval.start_included and plan.pieces[1].interval.end_included);
    try std.testing.expectEqual(@as(i32, 65536), plan.source.a);
}
test "clipping folds can be entirely constant without losing domain errors" {
    var curve = Curve{ .function = .type4, .values = .{ 131072, 131072, -65536, 0, 0, 65536, 0 } };
    var plan = (try clip.partition(256, curve)).plan;
    for (plan.pieces[0..plan.count]) |piece| {
        try std.testing.expectEqual(.one, piece.kind);
        try std.testing.expectEqual(.constant, piece.direction);
    }
    curve.values[5] = -65536;
    plan = (try clip.partition(256, curve)).plan;
    for (plan.pieces[0..plan.count]) |piece| try std.testing.expectEqual(.zero, piece.kind);
    curve.values[0] = -65536;
    try std.testing.expectError(error.UndefinedIccCurvePower, clip.partition(256, curve));
    curve.values[4] = 65537;
    try std.testing.expect((try clip.partition(256, curve)) == .inactive);
}
