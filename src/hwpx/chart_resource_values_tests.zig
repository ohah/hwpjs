const std = @import("std");
const model = @import("chart_resource_values.zig");
const Pair = @import("chart_pair_target.zig").Pair;

fn pair(chart: []u8, ole: []u8) Pair {
    return .{ .chart_path = chart, .ole_path = ole, .wrapper_node = 0, .section_ordinal = 0, .section_sha256 = @splat(0), .declared_external = false };
}

test "chart resource aliases clone one owner and account for every path under allocation failures" {
    var c1 = [_]u8{'a'};
    var c2 = [_]u8{'b'};
    var o1 = [_]u8{'c'};
    var o2 = [_]u8{'d'};
    const pairs = [_]Pair{ pair(&c1, &o1), pair(&c1, &o2), pair(&c2, &o2) };
    const points: @import("chart_point_values.zig").Values = .{ .points = &.{}, .source_sha256 = @splat(0) };
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator, source: []const Pair, initial: *const @import("chart_point_values.zig").Values) !void {
            var values: model.Values = .{};
            defer values.deinit(a);
            const owner = try values.add(a, &source[0], initial);
            try model.Values.bindAliases(a, owner, source);
            for (source) |row| try std.testing.expect(owner == (try values.find(row.chart_path, row.ole_path)).?);
            const size = try values.byteSize(std.math.maxInt(usize));
            try std.testing.expectError(error.LimitExceeded, values.byteSize(size - 1));
            try std.testing.expectEqual(size, try values.byteSize(size));
            var cloned = try values.clone(a);
            defer cloned.deinit(a);
            try std.testing.expectEqual(@as(usize, 1), cloned.entries.items.len);
            try std.testing.expectEqual(@as(usize, 3), cloned.entries.items[0].aliases.len);
            for (source, cloned.entries.items[0].aliases) |row, alias| {
                try std.testing.expectEqualStrings(row.chart_path, alias.chart_path);
                try std.testing.expect(row.chart_path.ptr != alias.chart_path.ptr);
            }
            values.deinit(a);
            for (source) |row| try std.testing.expect((try cloned.find(row.chart_path, row.ole_path)) != null);
        }
    }.run, .{ @as([]const Pair, &pairs), &points });
}
