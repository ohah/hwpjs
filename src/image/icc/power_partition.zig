const Curve = @import("parametric_curve.zig").Curve;
const segments = @import("parametric_segments.zig");
const splitter = @import("interval_split.zig");
const root = @import("affine_root.zig");
pub const Direction = @import("curve_direction.zig").Direction;
pub const Piece = struct { power: segments.Power, direction: Direction };
pub const Result = struct { pieces: [2]Piece = undefined, count: usize = 0 };
fn classify(power: segments.Power) !Piece {
    const interval = power.interval;
    if (power.a == 0 or power.g == 0 or try interval.start.order(interval.end) == .eq) return .{ .power = power, .direction = .constant };
    const n = @as(i128, interval.start.numerator) + interval.end.numerator;
    const d = @as(i128, interval.start.denominator) + interval.end.denominator;
    const base = @as(i128, power.a) * n + @as(i128, power.b) * d;
    var increasing = (power.a > 0) == (power.g > 0);
    if (base < 0 and @import("fixed16_exponent.zig").classify(power.g) == .even_integer) increasing = !increasing;
    return .{ .power = power, .direction = if (increasing) .increasing else .decreasing };
}
/// Split at the exact base root and report PRE-clipping direction only.
/// The entire curve's real domain is validated by the shared branch assembler.
pub fn partition(curve: Curve) !Result {
    const power = (try segments.assemble(curve)).power orelse return .{};
    var result: Result = .{};
    if (root.solve(power.a, power.b, 0)) |cut| {
        const parts = try splitter.split(power.interval, cut);
        for ([_]?segments.Interval{ parts.left, parts.right }) |part| if (part) |interval| {
            var p = power;
            p.interval = interval;
            result.pieces[result.count] = try classify(p);
            result.count += 1;
        };
    } else {
        result.pieces[0] = try classify(power);
        result.count = 1;
    }
    return result;
}
