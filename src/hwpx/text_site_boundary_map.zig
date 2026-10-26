//! Map an exterior point between two projections of the same owned text sites.
const std = @import("std");
const Segment = @import("paragraph_text_positions.zig").Segment;
pub const Affinity = enum { before, after };
/// Request-local only: site indices belong to these projections, not a cache.
pub const Point = struct { site_index: usize, offset: usize, width: usize };

pub fn map(from: []const Segment, to: []const Segment, unit: u32) !u32 {
    return resolve(to, try capture(from, to, unit, .before));
}

pub fn capture(from: []const Segment, to: []const Segment, unit: u32, affinity: Affinity) !Point {
    var chosen: ?Point = null;
    segment_loop: for (from) |segment| {
        if (segment.kind != .text or unit < segment.start_unit or unit > segment.end_unit) continue;
        var found: ?Segment = null;
        for (to) |target| {
            if (target.kind != .text or target.index != segment.index) continue;
            if (found != null) return error.SourceBindingMismatch;
            found = target;
        }
        const target = found orelse return error.SourceBindingMismatch;
        if (target.end_unit < target.start_unit) return error.InvalidTextPosition;
        // At shared boundaries use unchanged exterior text, not the result
        // site whose displayed width changed.
        const width = segment.end_unit - segment.start_unit;
        if (target.end_unit - target.start_unit != width) continue :segment_loop;
        chosen = .{ .site_index = segment.index, .offset = unit - segment.start_unit, .width = width };
        if (affinity == .before) return chosen.?;
    }
    return chosen orelse error.InvalidTextPosition;
}

pub fn resolve(to: []const Segment, point: Point) !u32 {
    var found: ?Segment = null;
    for (to) |target| {
        if (target.kind != .text or target.index != point.site_index) continue;
        if (found != null) return error.SourceBindingMismatch;
        found = target;
    }
    const target = found orelse return error.SourceBindingMismatch;
    if (target.end_unit < target.start_unit) return error.InvalidTextPosition;
    if (target.end_unit - target.start_unit != point.width or point.offset > point.width) return error.ProtectedFieldRange;
    return std.math.cast(u32, std.math.add(usize, target.start_unit, point.offset) catch return error.LimitExceeded) orelse error.LimitExceeded;
}

test "exterior site affinity retains both boundaries through an empty result and rejects stale sites" {
    const original = [_]Segment{
        .{ .kind = .text, .index = 0, .source_start = 0, .start_unit = 0, .end_unit = 7 },
        .{ .kind = .text, .index = 1, .source_start = 1, .start_unit = 7, .end_unit = 11 },
        .{ .kind = .text, .index = 2, .source_start = 2, .start_unit = 11, .end_unit = 16 },
    };
    var empty = original;
    empty[1].end_unit = 7;
    empty[2].start_unit = 7;
    empty[2].end_unit = 12;
    const before = try capture(&empty, &original, 7, .before);
    const after = try capture(&empty, &original, 7, .after);
    try std.testing.expectEqual(@as(usize, 0), before.site_index);
    try std.testing.expectEqual(@as(usize, 2), after.site_index);
    try std.testing.expectEqual(@as(u32, 7), try resolve(&original, before));
    try std.testing.expectEqual(@as(u32, 11), try resolve(&original, after));
    for ([_]usize{ 0, 1, 4, 10 }) |width| {
        var changed = original;
        changed[1].end_unit = 7 + width;
        changed[2].start_unit = 7 + width;
        changed[2].end_unit = 12 + width;
        try std.testing.expectEqual(@as(u32, 7), try resolve(&changed, before));
        try std.testing.expectEqual(@as(u32, @intCast(7 + width)), try resolve(&changed, after));
    }
    var missing = original;
    missing[2].index = 99;
    try std.testing.expectError(error.SourceBindingMismatch, resolve(&missing, after));
    var resized = original;
    resized[2].end_unit += 1;
    try std.testing.expectError(error.ProtectedFieldRange, resolve(&resized, after));
    const duplicate = [_]Segment{ original[2], original[2] };
    try std.testing.expectError(error.SourceBindingMismatch, resolve(&duplicate, after));
    try std.testing.expectError(error.SourceBindingMismatch, capture(original[2..], &duplicate, 11, .after));
}

test "exterior site boundary mapping handles growth shrink and empty display affinity" {
    const original = [_]Segment{
        .{ .kind = .text, .index = 0, .source_start = 0, .start_unit = 0, .end_unit = 7 },
        .{ .kind = .text, .index = 1, .source_start = 1, .start_unit = 7, .end_unit = 11 },
        .{ .kind = .text, .index = 2, .source_start = 2, .start_unit = 11, .end_unit = 16 },
    };
    for ([_]usize{ 0, 1, 5, 10 }) |width| {
        var displayed = original;
        displayed[1].end_unit = 7 + width;
        displayed[2].start_unit = 7 + width;
        displayed[2].end_unit = 12 + width;
        for (11..17) |point| {
            const source: u32 = @intCast(point);
            const translated = try map(&original, &displayed, source);
            try std.testing.expectEqual(@as(u32, @intCast(point - 4 + width)), translated);
            // An empty result collapses its two exterior boundaries. The
            // existing first-site affinity cannot recover the suffix boundary
            // from the number alone; interior suffix points remain reversible.
            const reversed = try map(&displayed, &original, translated);
            try std.testing.expectEqual(if (width == 0 and point == 11) @as(u32, 7) else source, reversed);
        }
        try std.testing.expectError(error.InvalidTextPosition, map(&original, &displayed, 9));
    }
    var orphan = original;
    orphan[2].index = 99;
    try std.testing.expectError(error.SourceBindingMismatch, map(&original, &orphan, 12));
}
