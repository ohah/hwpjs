const std = @import("std");
const Fraction = @import("fraction.zig").Fraction;
const Power = @import("parametric_segments.zig").Power;
/// One implementation of bound merging for both target widths.
pub fn Of(comptime bits: u16) type {
    const Root = if (bits == 128) @import("normalized_power_level.zig").Root else @import("normalized_power_level.zig").Wide.Root;
    const Set = @import("power_preimage_types.zig").Of(bits).Set;
    const comparison = if (bits == 128) @import("normalized_power_root_compare.zig") else @import("normalized_power_root_compare.zig").Wide;
    const ordering = if (bits == 128) @import("normalized_root_order.zig") else @import("normalized_root_order.zig").Wide;
    const widen = if (bits == 128) @import("power_level.zig").widen else @import("power_level.zig").widenExtended;
    return struct {
        pub const Coordinate = union(enum) { rational: Fraction, root: Root };
        pub const Endpoint = struct { coordinate: Coordinate, attained: bool };
        pub const Bounds = struct { lower: Endpoint, upper: Endpoint };
        pub const Result = union(enum) { empty, undecided, bounds: Bounds };

        fn fromClip(b: @import("power_clip_types.zig").Boundary) !Coordinate {
            return switch (b) {
                .rational => |r| .{ .rational = r },
                .level_root => |r| .{ .root = try widen(r.value) },
            };
        }

        fn rootAgainst(comptime precision: u16, r: Root, x: Fraction, source: Power) !?std.math.Order {
            if (source.a == 0) return error.NonIsolatedIccAffineRoot;
            const order = (try comparison.at(precision, r, source.a, source.b, x)) orelse return null;
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
                    .root => |s| try ordering.inAffine(r, s, source.a),
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
        pub fn inspect(comptime precision: u16, set: Set) !Result {
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
    };
}
