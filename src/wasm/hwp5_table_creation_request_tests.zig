const std = @import("std");
const request = @import("hwp5_table_creation_request.zig");
const a = std.testing.allocator;
const value: request.Request = .{
    .version = 1,
    .section = 0,
    .paragraph = 1,
    .unit = 0,
    .rows = 1,
    .columns = 2,
    .width = 21600,
    .row_height = 3600,
    .resources = .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 },
    .options = .{
        .common = .{ .flags = 0x6a2211, .offset_x = 0, .offset_y = 0, .z_order = 0, .margins = .{ 0, 0, 0, 0 }, .prevent_page_break = false, .description = "표😀" },
        .table = .{ .page_break = 1, .repeat_header = false, .cell_spacing = 0, .margins = .{ 0, 0, 0, 0 } },
        .cell = .{ .layout = .observed8, .unknown = 0, .attributes = 0, .margins = .{ 0, 0, 0, 0 } },
    },
};
fn parseOwned(allocator: std.mem.Allocator, bytes: []const u8) !void {
    const parsed = try request.parse(allocator, bytes);
    defer parsed.deinit();
    try std.testing.expectEqualDeep(value, parsed.value);
}
fn prepareOwned(allocator: std.mem.Allocator, session: *const @import("../hwp5/edit/style_preservation.zig").Session, bytes: []const u8) !void {
    var prepared = try request.prepare(allocator, session, bytes);
    defer prepared.deinit(allocator);
    try std.testing.expectEqual(@as(usize, 2), prepared.table.cells.len);
}
test "table creation wire owns explicit policy through allocation failures and rejects every truncation" {
    const bytes = try std.json.Stringify.valueAlloc(a, value, .{});
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, parseOwned, .{bytes});
    for (0..bytes.len) |length| try std.testing.expectError(error.InvalidTableCreationRequest, request.parse(a, bytes[0..length]));
    const duplicate = try std.mem.concat(a, u8, &.{ "{\"version\":1,", bytes[1..] });
    defer a.free(duplicate);
    try std.testing.expectError(error.InvalidTableCreationRequest, request.parse(a, duplicate));
}
test "table creation wire prepares and commits an actual HWP table without borrowed buffer state" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const Session = @import("../hwp5/edit/style_preservation.zig").Session;
    const session = try Session.open(a, input);
    defer session.close();
    const bytes = try std.json.Stringify.valueAlloc(a, value, .{});
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, prepareOwned, .{ session, bytes });
    try std.testing.expectEqual(@as(usize, 0), try session.pendingTableCount(0));
    const unchanged = try session.save(a, .{});
    defer a.free(unchanged.bytes);
    try std.testing.expectEqualSlices(u8, input, unchanged.bytes);
    {
        var prepared = try request.prepare(a, session, bytes);
        defer prepared.deinit(a);
        try session.apply(prepared.command());
    }
    try std.testing.expectEqual(@as(usize, 1), try session.pendingTableCount(0));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try Session.open(a, saved.bytes);
    defer reopened.close();
    try std.testing.expectEqual(try session.paragraphCount(0) + 2, try reopened.paragraphCount(0));
}
