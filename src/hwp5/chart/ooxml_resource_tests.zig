const std = @import("std");
const api = @import("ooxml_resource.zig");
const a = std.testing.allocator;
const xml = "<c:chartSpace xmlns:c='http://schemas.openxmlformats.org/drawingml/2006/chart'><c:chart><c:plotArea/></c:chart></c:chartSpace>";
fn readOwned(allocator: std.mem.Allocator, bytes: []const u8) !void {
    var snapshot = try api.read(allocator, bytes, .raw_cfb);
    defer snapshot.deinit(allocator);
    try std.testing.expect(snapshot.legacy_backup_present);
    try std.testing.expectEqual(@as(usize, 1), snapshot.presentation_streams);
    try std.testing.expectEqualStrings(xml, snapshot.tree.source);
}
test "H5 OOXML resource reads owned tree and reports backups without interpreting or changing them" {
    const bytes = try @import("../../cfb/writer.zig").write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "OOXMLChartContents", .parent = 0, .content = xml },
        .{ .name = "Contents", .parent = 0, .content = "opaque backup" },
        .{ .name = "\x02OlePres000", .parent = 0, .content = "opaque preview" },
        .{ .name = "unknown", .parent = 0, .content = "preserve" },
    }, .{});
    defer a.free(bytes);
    const copy = try a.dupe(u8, bytes);
    defer a.free(copy);
    try readOwned(a, bytes);
    try @import("../../testing/allocation_failures.zig").check(readOwned, .{bytes});
    try std.testing.expectEqualSlices(u8, copy, bytes);
}
test "H5 OOXML resource rejects missing modern stream and foreign chart namespace without fallback" {
    const missing = try @import("../../cfb/writer.zig").write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "Contents", .parent = 0, .content = "not a modern chart" },
    }, .{});
    defer a.free(missing);
    try std.testing.expectError(error.ChartOOXMLUnavailable, api.read(a, missing, .raw_cfb));
    const foreign = try @import("../../cfb/writer.zig").write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "OOXMLChartContents", .parent = 0, .content = "<chartSpace xmlns='urn:foreign'/>" },
    }, .{});
    defer a.free(foreign);
    try std.testing.expectError(error.InvalidChartRoot, api.read(a, foreign, .raw_cfb));
    const fresh = try @import("../../hwpx/chart_create_ole.zig").create(a, xml);
    defer a.free(fresh);
    var read = try api.read(a, fresh, .observed_size_prefix);
    defer read.deinit(a);
    try std.testing.expect(!read.legacy_backup_present);
    try std.testing.expectEqual(@as(usize, 0), read.presentation_streams);
    try std.testing.expectEqualStrings(xml, read.tree.source);
}

test "H5 OOXML presentation observations use direct root ownership across display names and reject nested and similar decoys" {
    for ([_][]const u8{ "Root Entry", "Chart Root", "다른 루트" }) |root_name| {
        const prepared = @import("../../cfb/writer.zig").write(a, &.{
            .{ .name = root_name, .kind = 5 },
            .{ .name = "OOXMLChartContents", .parent = 0, .content = xml },
            .{ .name = "Contents", .parent = 0, .content = "opaque backup" },
            .{ .name = "\x02OlePres000", .parent = 0, .content = "root preview" },
            .{ .name = "Nested", .parent = 0, .kind = 1 },
            .{ .name = "\x02OlePres001", .parent = 4, .content = "nested decoy" },
            .{ .name = "OlePres000", .parent = 0, .content = "missing marker decoy" },
            .{ .name = "\x02OlePre000", .parent = 0, .content = "similar name decoy" },
            .{ .name = "prefix\x02OlePres000", .parent = 0, .content = "non-prefix decoy" },
            .{ .name = "\x02OlePresStore", .parent = 0, .kind = 1 },
            .{ .name = "data", .parent = 9, .content = "storage decoy" },
        }, .{});
        if (!std.mem.eql(u8, root_name, @import("../../cfb/format.zig").root_name)) {
            if (prepared) |unexpected_bytes| {
                defer a.free(unexpected_bytes);
                return error.TestExpectedError;
            } else |err| {
                if (err == error.OutOfMemory) return err;
                try std.testing.expect(err == error.InvalidRoot);
            }
            continue;
        }
        const bytes = try prepared;
        defer a.free(bytes);
        const copy = try a.dupe(u8, bytes);
        defer a.free(copy);
        try readOwned(a, bytes);
        try @import("../../testing/allocation_failures.zig").check(readOwned, .{bytes});
        try std.testing.expectEqualSlices(u8, copy, bytes);
    }
}
