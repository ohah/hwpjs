const std = @import("std");
const t = std.testing;
const c = @import("validation.zig");
const f = @import("../document/test_fixture.zig");
const writer = @import("../../cfb/writer.zig");
const options: c.Options = .{
    .xml_template = .{ .encoding = .decoded, .max_decoded_bytes = 18 },
    .history = .{ .encoding = .decoded, .item = .{ .start_layout = .spec_flag_first } },
    .document = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } },
};
fn fixture(a: std.mem.Allocator) ![]u8 {
    const doc = try f.docInfo(a, 1);
    defer a.free(doc);
    const section = try f.section(a);
    defer a.free(section);
    return writer.write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = &f.header() },
        .{ .name = "DocInfo", .parent = 0, .content = doc },
        .{ .name = "BodyText", .parent = 0, .kind = 1 },
        .{ .name = "Section0", .parent = 3, .content = section },
        .{ .name = "XMLTemplate", .parent = 0, .kind = 1 },
        .{ .name = "Instance", .parent = 5, .content = &.{ 2, 0, 0, 0, 'i', 0, 'x', 0 } },
        .{ .name = "_SchemaName", .parent = 5, .content = &.{ 0, 0, 0, 0 } },
        .{ .name = "Schema", .parent = 5, .content = &.{ 1, 0, 0, 0, 's', 0 } },
        .{ .name = "DocHistory", .parent = 0, .kind = 1 },
        .{ .name = "VersionLog0", .parent = 9, .content = &.{ 16, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 17, 0, 0, 0, 0 } },
    }, .{});
}
fn exercise(a: std.mem.Allocator, bytes: []const u8, max: usize, late: bool, xml_limit: bool) !void {
    var opts = options;
    opts.document.max_total_bytes = max;
    if (xml_limit) opts.xml_template.?.max_decoded_bytes = 17;
    var result = c.inspect(a, bytes, opts) catch |err| {
        if (late and err == error.LimitExceeded) return;
        return err;
    };
    defer result.deinit(a);
    if (late) return error.ExpectedLimitFailure;
    const xml = result.xml_template.?;
    try t.expect(xml.present and !xml.declared);
    try t.expectEqual(@as(?usize, 0), xml.schema_name_units);
    try t.expectEqual(@as(?usize, 1), xml.schema_units);
    try t.expectEqual(@as(?usize, 2), xml.instance_units);
    try t.expectEqual(18, xml.decoded_bytes);
    try t.expectEqual(0, result.uninspected_streams);
    try t.expectEqual(2, result.history.?.records);
}
test "XMLTemplate and history share global bytes and release allocations on late failure" {
    const bytes = try fixture(t.allocator);
    defer t.allocator.free(bytes);
    const before = try t.allocator.dupe(u8, bytes);
    defer t.allocator.free(before);
    var result = try c.inspect(t.allocator, bytes, options);
    const total = result.total_decoded_bytes;
    result.deinit(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, exercise, .{ bytes, total, false, false });
    try t.checkAllAllocationFailures(t.allocator, exercise, .{ bytes, total - 1, true, false });
    try t.checkAllAllocationFailures(t.allocator, exercise, .{ bytes, total, true, true });
    var off = options;
    off.xml_template = null;
    var ordinary = try c.inspect(t.allocator, bytes, off);
    defer ordinary.deinit(t.allocator);
    try t.expect(ordinary.xml_template == null);
    try t.expectEqual(3, ordinary.uninspected_streams);
    try t.expectEqual(total - 18, ordinary.total_decoded_bytes);
    try t.expectEqualSlices(u8, before, bytes);
}
