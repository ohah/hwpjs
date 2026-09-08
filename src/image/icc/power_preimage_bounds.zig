const std = @import("std");
const Fraction = @import("fraction.zig").Fraction;
const Root = @import("normalized_power_level.zig").Root;
const Power = @import("parametric_segments.zig").Power;
pub const Coordinate = union(enum) { rational: Fraction, root: Root };
pub const Endpoint = struct { coordinate: Coordinate, attained: bool };
pub const Bounds = struct { lower: Endpoint, upper: Endpoint };
pub const Result = union(enum) { empty, undecided, bounds: Bounds };

fn fromClip(b: @import("power_clip_types.zig").Boundary) !Coordinate {
    return switch (b) {
        .rational => |r| .{ .rational = r },
        .level_root => |r| .{ .root = try @import("power_level.zig").widen(r.value) },
    };
}

fn rootAgainst(comptime precision: u16, r: Root, x: Fraction, source: Power) !?std.math.Order {
    if (source.a == 0) return error.NonIsolatedIccAffineRoot;
    const order = (try @import("normalized_power_root_compare.zig").at(precision, r, source.a, source.b, x)) orelse return null;
    return if (source.a > 0) order else order.invert();
}

fn compare(comptime precision: u16, a: Coordinate, b: Coordinate, source: Power) !?std.math.Order {
    return switch (a) {
        .rational => |x| switch (b) {
            .rational => |y| try x.order(y),
            .root => |r| if (try rootAgainst(precision, r, x, source)) |o| o.invert() else null,
        },
        .root => |r| switch (b) {
            .rational => |x| try rootAgainst(precision, r, x, source),
            .root => |s| try @import("normalized_root_order.zig").inAffine(r, s, source.a),
        },
    };
}

fn merge(comptime precision: u16, current: *Endpoint, candidate: Endpoint, desired: std.math.Order, source: Power) !bool {
    const order = (try compare(precision, candidate.coordinate, current.coordinate, source)) orelse return false;
    if (order == desired) current.* = candidate;
    if (order == .eq) {
        current.attained = current.attained or candidate.attained;
        // Preserve an exact rational endpoint when equality proves it available.
        if (candidate.coordinate == .rational) current.coordinate = candidate.coordinate;
    }
    return true;
}

/// Internal input contract: a complete, factory-produced power_preimage Set.
/// This does not validate arbitrary forged sets or return partial bounds.
pub fn inspect(comptime precision: u16, set: @import("power_preimage_types.zig").Set) !Result {
    var result: ?Bounds = null;
    for (set.intervals[0..set.interval_count]) |interval| {
        const lower = Endpoint{ .coordinate = try fromClip(interval.start), .attained = interval.start_included };
        const upper = Endpoint{ .coordinate = try fromClip(interval.end), .attained = interval.end_included };
        if (result) |*b| {
            if (!try merge(precision, &b.lower, lower, .lt, set.source)) return .undecided;
            if (!try merge(precision, &b.upper, upper, .gt, set.source)) return .undecided;
        } else result = .{ .lower = lower, .upper = upper };
    }
    for (set.points[0..set.point_count]) |point| {
        const coordinate: Coordinate = switch (point.location) {
            .start, .singleton => .{ .rational = set.source.interval.start },
            .end => .{ .rational = set.source.interval.end },
            .interior => .{ .root = point.root },
            else => return error.InvalidIccPreimageLocation,
        };
        const endpoint = Endpoint{ .coordinate = coordinate, .attained = true };
        if (result) |*b| {
            if (!try merge(precision, &b.lower, endpoint, .lt, set.source)) return .undecided;
            if (!try merge(precision, &b.upper, endpoint, .gt, set.source)) return .undecided;
        } else result = .{ .lower = endpoint, .upper = endpoint };
    }
    return if (result) |b| .{ .bounds = b } else .empty;
}
