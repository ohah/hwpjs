const std = @import("std");
const points = @import("drawing_curve_points.zig");
test "HWP5 curve source actual grouped samples retain duplicates segment bytes and allocation ownership" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/3-09월_교육_통합_2022.hwp", a, .limited(8_000_000));
    defer a.free(bytes);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const rows = try points.read(a, raw, source.header.version(), .observed_i32_points);
    defer points.free(a, rows);
    try std.testing.expectEqual(@as(usize, 1), rows.len);
    const row = rows[0];
    // Independent CFB.js/record inventory: node922, payload3769, count418, tail4.
    try std.testing.expectEqual(@as(usize, 916), row.component_node);
    try std.testing.expectEqual(@as(usize, 922), row.curve_node);
    try std.testing.expectEqual(@as(usize, 418), row.raw_points.len);
    try std.testing.expectEqual(@as(usize, 417), row.segments.len);
    try std.testing.expectEqualDeep([2]i32{ 190, 50 }, row.raw_points[0]);
    try std.testing.expectEqualDeep(row.raw_points[0], row.raw_points[1]);
    try std.testing.expectEqualDeep(row.raw_points[0], row.raw_points[417]);
    try std.testing.expectEqual(@as(u16, 1), row.segments[0]);
    try std.testing.expectEqual(@as(usize, 4), row.extra_bytes);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: []const u8, version: @import("../version.zig").Version, expected: []const points.Source) !void {
            const actual = try points.read(allocator, input, version, .observed_i32_points);
            defer points.free(allocator, actual);
            try std.testing.expectEqualDeep(expected, actual);
        }
    }.run, .{ raw, source.header.version(), rows });
    var tree = try @import("source_tree.zig").parse(a, raw, source.header.version(), .{});
    defer tree.deinit(a);
    const payload = tree.nodes[row.curve_node].record.framing.payload;
    const offset = @intFromPtr(payload.ptr) - @intFromPtr(raw.ptr);
    const corrupt = try a.dupe(u8, raw);
    defer a.free(corrupt);
    std.mem.writeInt(i32, corrupt[offset..][0..4], -1, .little);
    try std.testing.expectError(error.NegativePointCount, points.read(a, corrupt, source.header.version(), .observed_i32_points));
    std.mem.writeInt(i32, corrupt[offset..][0..4], std.math.maxInt(i32), .little);
    try std.testing.expectError(error.UnexpectedEnd, points.read(a, corrupt, source.header.version(), .observed_i32_points));
    std.mem.writeInt(i32, raw[offset + 4 ..][0..4], 999, .little);
    raw[offset + 4 + row.raw_points.len * 8] = 255;
    try std.testing.expectEqual(@as(i32, 190), row.raw_points[0][0]);
    try std.testing.expectEqual(@as(u16, 1), row.segments[0]);
}
