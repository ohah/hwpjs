const std = @import("std");
const t = std.testing;
const c = @import("validation.zig");
const f = @import("../document/test_fixture.zig");
const writer = @import("../../cfb/writer.zig");
const xml = @import("../xml_validation.zig");
const options: c.Options = .{
    .xml = .{},
    .xml_template = .{ .encoding = .decoded },
    .history = .{ .encoding = .decoded, .item = .{ .start_layout = .spec_flag_first }, .last_document = .observed_record },
    .document = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } },
};
fn wchar(comptime text: []const u8) [text.len * 2]u8 {
    var out: [text.len * 2]u8 = @splat(0);
    for (text, 0..) |ch, i| out[i * 2] = ch;
    return out;
}
fn envelope(a: std.mem.Allocator, text: []const u8) ![]u8 {
    const out = try a.alloc(u8, 4 + text.len);
    std.mem.writeInt(u32, out[0..4], @intCast(text.len / 2), .little);
    @memcpy(out[4..], text);
    return out;
}
fn record(a: std.mem.Allocator, out: *std.ArrayList(u8), tag: u8, payload: []const u8) !void {
    try out.append(a, tag);
    var size: [4]u8 = undefined;
    std.mem.writeInt(u32, &size, @intCast(payload.len), .little);
    try out.appendSlice(a, &size);
    try out.appendSlice(a, payload);
}
fn fixture(a: std.mem.Allocator, instance: []const u8) ![]u8 {
    const doc = try f.docInfo(a, 1);
    defer a.free(doc);
    const section = try f.section(a);
    defer a.free(section);
    const schema = try envelope(a, &wchar("<s/>"));
    defer a.free(schema);
    const inst = try envelope(a, instance);
    defer a.free(inst);
    const name = try envelope(a, &wchar("not XML"));
    defer a.free(name);
    var log: std.ArrayList(u8) = .empty;
    defer log.deinit(a);
    try record(a, &log, 16, &.{ 28, 0, 0, 0, 0, 0 });
    try record(a, &log, 34, &wchar("<"));
    try record(a, &log, 35, &.{ 0, 0xd8 }); // Metadata is not an XML entity.
    try record(a, &log, 48, &wchar("<d/>"));
    try record(a, &log, 17, &.{});
    var last: std.ArrayList(u8) = .empty;
    defer last.deinit(a);
    try record(a, &last, 49, &wchar("<l/>"));
    return writer.write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = &f.header() },
        .{ .name = "DocInfo", .parent = 0, .content = doc },
        .{ .name = "BodyText", .parent = 0, .kind = 1 },
        .{ .name = "Section0", .parent = 3, .content = section },
        .{ .name = "XMLTemplate", .parent = 0, .kind = 1 },
        .{ .name = "_SchemaName", .parent = 5, .content = name },
        .{ .name = "Schema", .parent = 5, .content = schema },
        .{ .name = "Instance", .parent = 5, .content = inst },
        .{ .name = "DocHistory", .parent = 0, .kind = 1 },
        .{ .name = "VersionLog0", .parent = 9, .content = log.items },
        .{ .name = "HistoryLastDoc", .parent = 9, .content = last.items },
    }, .{});
}
test "HWP container XML selection shares budgets across templates and history" {
    const bytes = try fixture(t.allocator, &wchar("<i/>"));
    defer t.allocator.free(bytes);
    var exact = options;
    exact.xml.?.max_documents = 4;
    exact.xml.?.document.prolog.input = .{ .max_bytes = 32, .max_characters = 16 };
    exact.xml.?.document.max_elements = 4;
    exact.xml.?.document.max_events = 4;
    exact.xml.?.document.max_attributes = 0;
    exact.xml.?.document.max_references = 0;
    var result = try c.inspect(t.allocator, bytes, exact);
    defer result.deinit(t.allocator);
    const report = result.xml.?;
    try t.expectEqual(@as(usize, 4), report.documents);
    inline for (.{ "schema", "instance", "diff", "last_document" }) |field| try t.expectEqual(@as(usize, 1), @field(report, field));
    try t.expectEqual(@as(usize, 32), report.totals.bytes);
    try t.expectEqual(@as(usize, 16), report.totals.characters);
    try t.expectEqual(@as(usize, 0), result.uninspected_streams);
    try t.expect(report.totals.namespaces_validated);
    for (0..5) |i| {
        var short = exact;
        switch (i) {
            0 => short.xml.?.max_documents -= 1,
            1 => short.xml.?.document.prolog.input.max_bytes -= 1,
            2 => short.xml.?.document.prolog.input.max_characters -= 1,
            3 => short.xml.?.document.max_elements -= 1,
            4 => short.xml.?.document.max_events -= 1,
            else => unreachable,
        }
        try t.expectError(error.LimitExceeded, c.inspect(t.allocator, bytes, short));
    }
    var selected = options;
    selected.history.?.last_document = .uninspected;
    var partial = try c.inspect(t.allocator, bytes, selected);
    defer partial.deinit(t.allocator);
    try t.expectEqual(@as(usize, 3), partial.xml.?.documents);
    try t.expectEqual(@as(usize, 1), partial.uninspected_streams);
    selected.history = null;
    selected.xml_template = null;
    selected.xml.?.max_documents = 0;
    var none = try c.inspect(t.allocator, bytes, selected);
    defer none.deinit(t.allocator);
    try t.expectEqual(@as(usize, 0), none.xml.?.documents);
    try t.expectEqual(@as(usize, 5), none.uninspected_streams);
}
test "HWP XML validation is opt in and never reinterprets malformed text as success" {
    const bytes = try fixture(t.allocator, &wchar("<i>"));
    defer t.allocator.free(bytes);
    try t.expectError(error.UnclosedXmlElement, c.inspect(t.allocator, bytes, options));
    var off = options;
    off.xml = null;
    var result = try c.inspect(t.allocator, bytes, off);
    defer result.deinit(t.allocator);
    try t.expect(result.xml == null);
    try t.expectEqual(@as(usize, 0), result.uninspected_streams);
}
fn exercise(a: std.mem.Allocator, bytes: []const u8, late: bool) !void {
    var selected = options;
    if (late) selected.xml.?.max_documents = 3;
    var result = c.inspect(a, bytes, selected) catch |err| {
        if (late and err == error.LimitExceeded) return;
        return err;
    };
    defer result.deinit(a);
    try t.expect(!late);
}
test "HWP XML connection releases container and decoded buffers on late allocation errors" {
    const bytes = try fixture(t.allocator, &wchar("<i/>"));
    defer t.allocator.free(bytes);
    try t.checkAllAllocationFailures(t.allocator, exercise, .{ bytes, false });
    try t.checkAllAllocationFailures(t.allocator, exercise, .{ bytes, true });
}
test "HWP XML budget uses WCHAR encoding and preserves totals after errors" {
    var budget = try xml.Budget.init(.{});
    try budget.inspect(t.allocator, &wchar("<r/>"), .schema);
    const before = budget.report;
    try t.expectError(error.UnboundXmlPrefix, budget.inspect(t.allocator, &wchar("<p:r/>"), .instance));
    try t.expectEqualDeep(before, budget.report);
    try budget.inspect(t.allocator, &wchar("<r/>"), .instance);
    try t.expectEqual(@as(usize, 2), budget.report.documents);
    try t.expectError(error.InvalidHwpXmlEncoding, xml.Budget.init(.{ .document = .{ .prolog = .{ .external_encoding = .utf8 } } }));
}
test "HWP VersionLog validates embedded last document without parsing writer metadata as XML" {
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(t.allocator);
    try record(t.allocator, &bytes, 16, &.{ 4, 0, 0, 0, 0, 0 });
    try record(t.allocator, &bytes, 34, &.{ 0, 0xd8 });
    try record(t.allocator, &bytes, 49, &wchar("<last/>"));
    try record(t.allocator, &bytes, 17, &.{});
    const parsed = try @import("../history/item.zig").Item.parse(bytes.items, .{ .start_layout = .spec_flag_first });
    var budget = try xml.Budget.init(.{});
    try @import("../history/xml.zig").inspect(t.allocator, parsed, .{}, &budget);
    try t.expectEqual(@as(usize, 1), budget.report.last_document);
    try t.expectEqual(@as(usize, 0), budget.report.diff);
    const before = budget.report;
    try t.expectError(error.MissingXmlRoot, budget.inspect(t.allocator, &.{}, .schema));
    try t.expectEqualDeep(before, budget.report);
}
