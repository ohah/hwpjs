const Linear = @import("parametric_segments.zig").Linear;
const Interval = @import("unit_interval.zig").Interval;
const Fraction = @import("fraction.zig").Fraction;
const root = @import("affine_root.zig");
const splitter = @import("interval_split.zig");
pub const Direction = @import("curve_direction.zig").Direction;
pub const Kind = enum(u32) { zero, affine, one };
pub const Piece = struct { interval: Interval, kind: Kind, direction: Direction };
pub const Result = struct { pieces: [3]Piece = undefined, count: usize = 0 };
fn classify(line: Linear, interval: Interval) !Piece {
    // The mediant lies strictly between distinct rational endpoints. Sums use i128.
    const n = @as(i128, interval.start.numerator) + interval.end.numerator;
    const d = @as(i128, interval.start.denominator) + interval.end.denominator;
    const value = @as(i128, line.slope) * n + @as(i128, line.offset) * d;
    const kind: Kind = if (value <= 0) .zero else if (value >= 65536 * d) .one else .affine;
    const direction: Direction = if (kind != .affine or line.slope == 0 or try interval.start.order(interval.end) == .eq) .constant else if (line.slope > 0) .increasing else .decreasing;
    return .{ .interval = interval, .kind = kind, .direction = direction };
}
/// Exact clipping partition of a signed 16.16 affine branch; no sampling/rounding.
pub fn partition(line: Linear) !Result {
    try line.interval.validate();
    var cuts: [2]Fraction = undefined;
    var count: usize = 0;
    for ([_]i32{ 0, 65536 }) |target| if (root.solve(line.slope, line.offset, target)) |cut| {
        cuts[count] = cut;
        count += 1;
    };
    if (count == 2 and try cuts[0].order(cuts[1]) == .gt) {
        const tmp = cuts[0];
        cuts[0] = cuts[1];
        cuts[1] = tmp;
    }
    var result: Result = .{};
    var remaining: ?Interval = line.interval;
    for (cuts[0..count]) |cut| {
        const interval = remaining orelse break;
        const parts = try splitter.split(interval, cut);
        if (parts.left) |left| {
            result.pieces[result.count] = try classify(line, left);
            result.count += 1;
        }
        remaining = parts.right;
    }
    if (remaining) |interval| {
        result.pieces[result.count] = try classify(line, interval);
        result.count += 1;
    }
    return result;
}
