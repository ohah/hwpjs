const std = @import("std");
const t = std.testing;
const c = @import("validation.zig");
const f = @import("../document/test_fixture.zig");
const writer = @import("../../cfb/writer.zig");
const opts: c.Options = .{ .document = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } } };
fn inspect(a: std.mem.Allocator, bytes: []const u8, bad: bool) !void {
    var report = c.inspect(a, bytes, opts) catch |err| {
        if (bad and err == error.InvalidScriptEndFlag) return;
        return err;
    };
    defer report.deinit(a);
    if (bad) return error.ExpectedScriptFailure;
    try t.expectEqual(1, report.scripts.version.?.high);
    try t.expectEqual(0, report.scripts.source_units.?[3]);
    try t.expectEqual(28, report.scripts.decoded_bytes);
    try t.expectEqual(0, report.uninspected_streams);
}
test "script success and late failure release every allocation point" {
    const h = f.header();
    const doc = try f.docInfo(t.allocator, 0);
    defer t.allocator.free(doc);
    var source = [_]u8{0} ** 20;
    @memset(source[16..], 255);
    const nodes = [_]writer.Node{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = &h },
        .{ .name = "DocInfo", .parent = 0, .content = doc },
        .{ .name = "BodyText", .parent = 0, .kind = 1 },
        .{ .name = "Scripts", .parent = 0, .kind = 1 },
        .{ .name = "JScriptVersion", .parent = 4, .content = &.{ 1, 0, 0, 0, 0, 0, 0, 0 } },
        .{ .name = "DefaultJScript", .parent = 4, .content = &source },
    };
    const good = try writer.write(t.allocator, &nodes, .{});
    defer t.allocator.free(good);
    try t.checkAllAllocationFailures(t.allocator, inspect, .{ good, false });
    source[16] = 0;
    const bad = try writer.write(t.allocator, &nodes, .{});
    defer t.allocator.free(bad);
    try t.checkAllAllocationFailures(t.allocator, inspect, .{ bad, true });
}
