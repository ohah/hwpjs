const std = @import("std");
const tags = @import("range_tags.zig");
pub const default_max_ranges = 100_000;
pub const Span = struct { start: u32, end: u32, removed_before: u32 = 0 };
pub const Boundary = struct { offset: u32, removed_unit: bool };
fn less(_: void, a: Span, b: Span) bool {
    return a.start < b.start or (a.start == b.start and a.end < b.end);
}
/// Owned observed 0x11 union. No text pointer or source range reference survives.
pub const Map = struct {
    storage: []Span,
    count: usize,
    source_units: u32,
    projected_units: u32,
    pub fn deinit(self: *Map, a: std.mem.Allocator) void {
        a.free(self.storage);
        self.* = undefined;
    }
    pub fn spans(self: Map) []const Span {
        return self.storage[0..self.count];
    }
    pub fn buildObserved(a: std.mem.Allocator, units: u32, ranges: tags.Ranges, max_ranges: usize) !Map {
        _ = try tags.Ranges.parse(ranges.raw);
        if (ranges.count() > max_ranges) return error.RevisionProjectionRangeLimit;
        var count: usize = 0;
        for (0..ranges.count()) |i| {
            const r = ranges.get(i).?;
            try r.validateBounds(units);
            if (r.kind() == 0x11 and r.start != r.end) count += 1;
        }
        const selected = try a.alloc(Span, count);
        var at: usize = 0;
        for (0..ranges.count()) |i| {
            const r = ranges.get(i).?;
            if (r.kind() == 0x11 and r.start != r.end) {
                selected[at] = .{ .start = r.start, .end = r.end };
                at += 1;
            }
        }
        std.mem.sort(Span, selected, {}, less);
        var merged: usize = 0;
        for (selected) |r| {
            if (merged > 0 and r.start <= selected[merged - 1].end) {
                selected[merged - 1].end = @max(selected[merged - 1].end, r.end);
            } else {
                selected[merged] = r;
                merged += 1;
            }
        }
        var removed: u32 = 0;
        for (selected[0..merged]) |*r| {
            r.removed_before = removed;
            removed += r.end - r.start;
        }
        return .{ .storage = selected, .count = merged, .source_units = units, .projected_units = units - removed };
    }
    /// Source boundary in [0,source_units]. One-past-end is not a removed unit.
    pub fn mapBoundary(self: Map, source: u32) !Boundary {
        if (source > self.source_units) return error.RevisionCoordinateOutOfBounds;
        var lo: usize = 0;
        var hi = self.count;
        while (lo < hi) {
            const mid = lo + (hi - lo) / 2;
            if (self.storage[mid].start <= source) lo = mid + 1 else hi = mid;
        }
        if (lo == 0) return .{ .offset = source, .removed_unit = false };
        const r = self.storage[lo - 1];
        return .{ .offset = source - r.removed_before - (@min(source, r.end) - r.start), .removed_unit = source < r.end };
    }
};
