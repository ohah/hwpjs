//! Coverage only, never permission or source-change admission. The final writer
//! still rejects duplicate/overlapping/invalid source patches independently.
const std = @import("std");
const Change = @import("xml_source_writer.zig").Change;
const Interval = struct { start: usize, end: usize };
pub const Cursor = struct {
    intervals: []Interval,
    next: usize = 0,
    maximum_end: usize = 0,
    previous_query: usize = 0,
    work: struct { radix_items: usize = 0, consumed: usize = 0, queries: usize = 0 } = .{},

    pub fn init(a: std.mem.Allocator, changes: []const Change) !Cursor {
        const radix_items = try std.math.mul(usize, changes.len, 2 * @sizeOf(usize));
        var sorted = try a.alloc(Interval, changes.len);
        errdefer a.free(sorted);
        for (changes, sorted) |change, *interval| {
            if (change.start > change.end) return error.InvalidSourceSpan;
            interval.* = .{ .start = change.start, .end = change.end };
        }
        if (sorted.len <= 1) return .{ .intervals = sorted };
        var temporary = try a.alloc(Interval, changes.len);
        defer a.free(temporary);
        // Fixed-width stable radix: no comparison sort and no loop to the
        // largest source address. Legitimate sparse offsets cost no extra work.
        for (0..@sizeOf(usize)) |pass| {
            const shift: std.math.Log2Int(usize) = @intCast(pass * 8);
            var counts: [256]usize = @splat(0);
            for (sorted) |interval| counts[(interval.start >> shift) & 255] += 1;
            var offset: usize = 0;
            for (&counts) |*count| {
                const amount = count.*;
                count.* = offset;
                offset += amount;
            }
            for (sorted) |interval| {
                const bucket = (interval.start >> shift) & 255;
                temporary[counts[bucket]] = interval;
                counts[bucket] += 1;
            }
            std.mem.swap([]Interval, &sorted, &temporary);
        }
        return .{ .intervals = sorted, .work = .{ .radix_items = radix_items } };
    }
    pub fn deinit(self: *Cursor, a: std.mem.Allocator) void {
        a.free(self.intervals);
        self.* = undefined;
    }
    /// Native source-order queries only. A descending query is rejected rather
    /// than silently restarting the cursor or sorting malformed owner input.
    pub fn covers(self: *Cursor, start: usize, end: usize) !bool {
        if (start > end or start < self.previous_query) return error.InvalidSourceSpan;
        self.previous_query = start;
        self.work.queries +|= 1;
        while (self.next < self.intervals.len and self.intervals[self.next].start <= start) : (self.next += 1) {
            self.maximum_end = @max(self.maximum_end, self.intervals[self.next].end);
            self.work.consumed += 1;
        }
        return self.next != 0 and self.maximum_end >= end;
    }
};
