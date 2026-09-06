const std = @import("std");
const t = std.testing;
const ranges = @import("memo_ranges.zig");
const Event = ranges.Event;
fn event(section: usize, scope: usize, paragraph: usize, unit: usize, value: @FieldType(Event, "value")) Event {
    return .{ .section = section, .scope = scope, .paragraph = paragraph, .unit = unit, .value = value };
}
fn exercise(a: std.mem.Allocator) !void {
    const max = std.math.maxInt(u32);
    const input = [_]Event{
        event(1, 0, 0, 1, .{ .end = 0 }),
        event(0, 0, 0, 1, .{ .start = 0 }),
        event(0, 5, 2, 0, .{ .start = max }),
        event(0, 5, 2, 1, .{ .start = null }),
        event(0, 5, 2, 2, .{ .end = 7 }),
        event(0, 5, 3, 0, .{ .end = max }),
        event(1, 5, 2, 0, .{ .end = max }),
        event(0, 6, 2, 0, .{ .start = max }),
    };
    const expected: ranges.Report = .{ .starts = 4, .ends = 4, .pairs = 3, .unindexed_pairs = 1, .cross_paragraph_pairs = 2, .cross_section_pairs = 1, .orphan_ends = 1, .unclosed_starts = 1 };
    try t.expectEqualDeep(expected, try ranges.inspect(a, &input));
    var reversed = input;
    std.mem.reverse(Event, &reversed);
    try t.expectEqualDeep(expected, try ranges.inspect(a, &reversed));
    try t.expectEqualDeep(input[0], reversed[reversed.len - 1]);
    try t.expectEqualDeep(expected, try ranges.inspect(a, &input));
}
test "memo range scopes order null zero maximum and allocation cleanup" {
    try t.checkAllAllocationFailures(t.allocator, exercise, .{});
}
test "memo range crossing is diagnosed without searching for a matching ID" {
    const input = [_]Event{
        event(0, 0, 0, 0, .{ .start = 1 }),
        event(0, 0, 0, 1, .{ .start = 2 }),
        event(0, 0, 0, 2, .{ .end = 1 }),
        event(0, 0, 0, 3, .{ .end = 2 }),
        event(0, 0, 0, 4, .{ .end = 2 }),
    };
    try t.expectEqualDeep(ranges.Report{ .starts = 2, .ends = 3, .pairs = 2, .id_mismatches = 2, .orphan_ends = 1 }, try ranges.inspect(t.allocator, &input));
    try t.expectEqualDeep(ranges.Report{}, try ranges.inspect(t.allocator, &.{}));
}
test "memo range duplicate positions and maximum scope do not select a winner or allocate by ID" {
    const s = event(0, std.math.maxInt(usize), 0, 0, .{ .start = 0 });
    var e = s;
    e.value = .{ .end = 0 };
    try t.expectError(error.DuplicateMemoRangePosition, ranges.inspect(t.allocator, &.{ s, e }));
    try t.expectError(error.DuplicateMemoRangePosition, ranges.inspect(t.allocator, &.{ s, s }));
    e.unit = 1;
    try t.expectEqualDeep(ranges.Report{ .starts = 1, .ends = 1, .pairs = 1 }, try ranges.inspect(t.allocator, &.{ e, s }));
}

test "memo range exhaustive short sequences match independent backward depth oracle" {
    // Four symbols: start 0, start 1, end 0, end 1. No product stack reuse.
    for (0..16384) |bits| {
        var input: [7]Event = undefined;
        var expected: ranges.Report = .{};
        for (&input, 0..) |*e, i| {
            const symbol = (bits >> @intCast(2 * i)) & 3;
            e.* = event(0, 0, 0, i, if (symbol < 2) .{ .start = @intCast(symbol) } else .{ .end = @intCast(symbol - 2) });
            if (symbol < 2) {
                expected.starts += 1;
                continue;
            }
            expected.ends += 1;
            var depth: usize = 1;
            var j = i;
            while (j > 0) {
                j -= 1;
                const previous = (bits >> @intCast(2 * j)) & 3;
                if (previous >= 2) {
                    depth += 1;
                } else {
                    depth -= 1;
                    if (depth == 0) {
                        expected.pairs += 1;
                        expected.id_mismatches += @intFromBool(previous != symbol - 2);
                        break;
                    }
                }
            }
            expected.orphan_ends += @intFromBool(depth != 0);
        }
        expected.unclosed_starts = expected.starts - expected.pairs;
        try t.expectEqualDeep(expected, try ranges.inspect(t.allocator, &input));
    }
}
