const std = @import("std");
const t = std.testing;
const c = @import("validation.zig");
const f = @import("../document/test_fixture.zig");
const writer = @import("../../cfb/writer.zig");
const options: c.Options = .{
    .history = .{ .encoding = .decoded, .item = .{ .start_layout = .spec_flag_first } },
    .document = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } },
};
fn fixture(a: std.mem.Allocator) ![]u8 {
    const doc = try f.docInfo(a, 1);
    defer a.free(doc);
    const section = try f.section(a);
    defer a.free(section);
    var raw = [_]u8{ 16, 6, 0, 0, 0, 0, 0, 10, 0, 0, 0, 17, 0, 0, 0, 0 };
    var second = raw;
    f.put(&second, 7, u32, 20);
    var third = raw;
    f.put(&third, 7, u32, 30);
    const nodes = [_]writer.Node{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = &f.header() },
        .{ .name = "DocInfo", .parent = 0, .content = doc },
        .{ .name = "BodyText", .parent = 0, .kind = 1 },
        .{ .name = "Section0", .parent = 3, .content = section },
        .{ .name = "DocHistory", .parent = 0, .kind = 1 },
        .{ .name = "VersionLog10", .parent = 5, .content = &third },
        .{ .name = "HistoryLastDoc", .parent = 5, .content = &.{ 49, 2, 0, 0, 0, 'x', 0 } },
        .{ .name = "VersionLog2", .parent = 5, .content = &second },
        .{ .name = "VersionLog0", .parent = 5, .content = &raw },
    };
    return writer.write(a, &nodes, .{});
}
fn exercise(a: std.mem.Allocator, bytes: []const u8, late: bool) !void {
    var opts = options;
    if (late) opts.history.?.item.framing.max_records = 5;
    var result = c.inspect(a, bytes, opts) catch |err| {
        if (late and err == error.LimitExceeded) return;
        return err;
    };
    defer result.deinit(a);
    if (late) return error.ExpectedHistoryLimitFailure;
    const h = result.history.?;
    try t.expectEqual(@as(usize, 3), h.entries.len);
    for ([_]u32{ 0, 2, 10 }, 0..) |index, i| {
        try t.expectEqual(index, h.entries[i].index);
        try t.expectEqual(@as(u32, @intCast((i + 1) * 10)), h.entries[i].option);
    }
    try t.expectEqual(@as(usize, 6), h.records);
    try t.expectEqual(@as(usize, 48), h.decoded_bytes);
    try t.expectEqual(@as(usize, 1), result.uninspected_streams);
    try t.expect(h.last_doc_present);
    try t.expect(!h.declared);
}
test "history container owns scalar entries and releases all allocations on late budget failure" {
    const bytes = try fixture(t.allocator);
    defer t.allocator.free(bytes);
    const before = try t.allocator.dupe(u8, bytes);
    defer t.allocator.free(before);
    try t.checkAllAllocationFailures(t.allocator, exercise, .{ bytes, false });
    try t.checkAllAllocationFailures(t.allocator, exercise, .{ bytes, true });
    try t.expectEqualSlices(u8, before, bytes);
    var off = options;
    off.history = null;
    var result = try c.inspect(t.allocator, bytes, off);
    defer result.deinit(t.allocator);
    try t.expect(result.history == null);
    try t.expectEqual(@as(usize, 4), result.uninspected_streams);
}
test "numbered stream grammar preserves section errors and bounds history indices independently" {
    const index = @import("numbered_stream.zig").index;
    try t.expectEqual(@as(?u32, 4294967295), try index(u32, "VersionLog", "vErSiOnLoG4294967295"));
    for ([_][]const u8{ "VersionLog", "VersionLog00", "VersionLog-1", "VersionLog+1", "VersionLog4294967296", "VersionLog999999999999999999" }) |name| try t.expectError(error.InvalidNumberedStreamName, index(u32, "VersionLog", name));
    try t.expectEqual(@as(?u32, null), try index(u32, "VersionLog", "OtherVersionLog0"));
    try t.expectEqual(@as(?u16, 65535), try @import("paths.zig").sectionIndex("Section65535"));
    try t.expectError(error.InvalidSectionName, @import("paths.zig").sectionIndex("Section65536"));
}
fn lastDocument(a: std.mem.Allocator, bytes: []const u8, late: bool) !void {
    var opts = options;
    opts.history.?.last_document = .observed_record;
    opts.history.?.max_decoded_bytes = 55;
    opts.history.?.item.framing.max_records = if (late) 6 else 7;
    var result = c.inspect(a, bytes, opts) catch |err| {
        if (late and err == error.LimitExceeded) return;
        return err;
    };
    defer result.deinit(a);
    if (late) return error.ExpectedLastDocumentFailure;
    const h = result.history.?;
    try t.expectEqual(55, h.decoded_bytes);
    try t.expectEqual(7, h.records);
    try t.expectEqual(1, h.last_document.?.text_units);
    try t.expectEqual(0, result.uninspected_streams);
}
test "last document shares history limits and frees allocations on final stream failure" {
    const bytes = try fixture(t.allocator);
    defer t.allocator.free(bytes);
    const before = try t.allocator.dupe(u8, bytes);
    defer t.allocator.free(before);
    try t.checkAllAllocationFailures(t.allocator, lastDocument, .{ bytes, false });
    try t.checkAllAllocationFailures(t.allocator, lastDocument, .{ bytes, true });
    try t.expectEqualSlices(u8, before, bytes);
}
