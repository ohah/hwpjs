const std = @import("std");
test "actual chart OLE candidate preserves siblings and original with explicit diagnostics" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx", a, .limited(4000000));
    defer a.free(input);
    var archive = try @import("../zip/archive.zig").open(a, input, .{});
    defer archive.deinit();
    const xml = try archive.decode(archive.find("Chart/chart1.xml").?, 4000000);
    defer a.free(xml);
    const ole = try archive.decode(archive.find("BinData/ole1.ole").?, 4000000);
    defer a.free(ole);
    const original = try a.dupe(u8, ole);
    defer a.free(original);
    var tree = try @import("chart_tree.zig").parse(a, xml, 0, .{});
    defer tree.deinit(a);
    var values = try @import("chart_point_values.zig").collect(a, &tree, .{});
    defer values.deinit(a);
    var ordinal: ?usize = null;
    for (values.points, 0..) |point, index| if (point.kind == .numeric_cache) {
        ordinal = index;
        break;
    };
    const changed = try @import("chart_numeric_point_write.zig").write(a, &tree, &values, &.{.{ .point = ordinal.?, .value = "314.159" }}, 4000000);
    defer a.free(changed);
    var result = try @import("chart_ole_candidate.zig").prepare(a, ole, xml, changed, .{ .allow_observed_deviations = true });
    defer result.deinit(a);
    try std.testing.expect(result.changed);
    if (result.original_error) |err| {
        try std.testing.expect(err == error.InvalidRoot or err == error.InvalidFat);
        try std.testing.expect(result.deviations != null);
        try std.testing.expectError(err, @import("chart_ole_candidate.zig").prepare(a, ole, xml, changed, .{}));
    }
    var noop = try @import("chart_ole_candidate.zig").prepare(a, ole, xml, xml, .{ .allow_observed_deviations = true });
    defer noop.deinit(a);
    try std.testing.expect(!noop.changed);
    try std.testing.expectEqualSlices(u8, ole, noop.bytes);
    try std.testing.expectError(error.ChartRepresentationMismatch, @import("chart_ole_candidate.zig").prepare(a, ole, "wrong", changed, .{ .allow_observed_deviations = true }));
    try std.testing.expectEqualSlices(u8, original, ole);
    // The real chart corpus is strict-valid. Exercise compatibility explicitly
    // with a derived root timestamp, without modifying the fixture.
    var strict_file = try @import("../ole/container.zig").open(a, ole, .observed_size_prefix, .{});
    defer strict_file.deinit();
    const derived = try a.dupe(u8, ole);
    defer a.free(derived);
    const root_offset = 4 + (@as(usize, strict_file.header.directory_start) + 1) * strict_file.header.sector_size;
    std.mem.writeInt(u64, derived[root_offset + 100 ..][0..8], 1, .little);
    try std.testing.expectError(error.InvalidRoot, @import("chart_ole_candidate.zig").prepare(a, derived, xml, changed, .{}));
    var normalized = try @import("chart_ole_candidate.zig").prepare(a, derived, xml, changed, .{ .allow_observed_deviations = true });
    defer normalized.deinit(a);
    try std.testing.expectEqual(error.InvalidRoot, normalized.original_error.?);
    try std.testing.expectEqual(@as(u64, 1), normalized.deviations.?.original_root_created);
    derived[root_offset] = 'X';
    try std.testing.expectError(error.UnsupportedObservedDeviation, @import("chart_ole_candidate.zig").prepare(a, derived, xml, changed, .{ .allow_observed_deviations = true }));
}
