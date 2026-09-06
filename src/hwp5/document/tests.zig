const std = @import("std");
const t = std.testing;
const d = @import("validation.zig");
const f = @import("test_fixture.zig");
const options: d.Options = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } };
test "decoded document counts physical records once and borrows DocInfo only" {
    const h = f.header();
    const doc = try f.docInfo(t.allocator, 2);
    defer t.allocator.free(doc);
    const section = try f.section(t.allocator);
    defer t.allocator.free(section);
    const input: d.Input = .{ .header = &h, .doc_info = doc, .sections = &.{ .{ .index = 1, .bytes = section }, .{ .index = 0, .bytes = section } } };
    var exact = options;
    exact.max_total_records = 21;
    exact.max_total_bytes = h.len + doc.len + section.len * 2;
    var report = try d.inspectDecoded(t.allocator, input, exact);
    defer report.deinit(t.allocator);
    try t.expectEqual(21, report.total_records);
    try t.expectEqual(exact.max_total_bytes, report.total_bytes);
    try t.expectEqual(13, report.doc_info.records);
    try t.expectEqual(2, report.sections.len);
    try t.expectEqual(1, report.sections[0].control_types.checked);
    try t.expectEqual(1, report.sections[1].definition.numbering_deferred);
    try t.expect(report.doc_info.properties.extra.ptr == doc[30..].ptr);
    doc[30] = 0x5a;
    try t.expectEqual(0x5a, report.doc_info.properties.extra[0]);
    exact.max_total_records -= 1;
    try t.expectError(error.LimitExceeded, d.inspectDecoded(t.allocator, input, exact));
    exact.max_total_records += 1;
    exact.max_total_bytes -= 1;
    try t.expectError(error.LimitExceeded, d.inspectDecoded(t.allocator, input, exact));
    exact = options;
    exact.framing.max_records = 12;
    try t.expectError(error.LimitExceeded, d.inspectDecoded(t.allocator, input, exact));
}
test "zero declared sections and parameter option validation even without sources" {
    var h = f.header();
    const doc = try f.docInfo(t.allocator, 0);
    defer t.allocator.free(doc);
    const input: d.Input = .{ .header = &h, .doc_info = doc, .sections = &.{} };
    // A decoded input never re-applies the header compression flag.
    f.put(&h, 36, u32, 1);
    var report = try d.inspectDecoded(t.allocator, input, options);
    defer report.deinit(t.allocator);
    try t.expectEqual(0, report.sections.len);
    var bad = options;
    bad.parameters.max_nodes = 0;
    try t.expectError(error.InvalidParameterLimit, d.inspectDecoded(t.allocator, input, bad));
    inline for (.{ "max_sections", "max_total_bytes", "max_total_records" }) |name| {
        bad = options;
        @field(bad, name) = 0;
        try t.expectError(error.InvalidDocumentLimit, d.inspectDecoded(t.allocator, input, bad));
    }
}
fn allocationCase(a: std.mem.Allocator, input: d.Input) !void {
    var report = try d.inspectDecoded(a, input, options);
    defer report.deinit(a);
    try t.expectEqual(2, report.sections.len);
}
test "section definition belongs to first root paragraph, not first physical record" {
    const h = f.header();
    const doc = try f.docInfo(t.allocator, 1);
    defer t.allocator.free(doc);
    const section = try f.section(t.allocator);
    defer t.allocator.free(section);
    var prefix = [_]u8{0} ** 28;
    f.put(&prefix, 0, u32, 66 | (24 << 20));
    const shifted = try std.mem.concat(t.allocator, u8, &.{ &prefix, section });
    defer t.allocator.free(shifted);
    const input: d.Input = .{ .header = &h, .doc_info = doc, .sections = &.{.{ .index = 0, .bytes = shifted }} };
    try t.expectError(error.MisplacedSectionDefinition, d.inspectDecoded(t.allocator, input, options));
    // Same-sized unknown root prefix isn't a paragraph; keep it visible.
    f.put(shifted, 0, u32, 999 | (24 << 20));
    var report = try d.inspectDecoded(t.allocator, input, options);
    defer report.deinit(t.allocator);
    try t.expectEqual(1, report.sections[0].paragraphs.unknown_records);
}
fn lateFailure(a: std.mem.Allocator, input: d.Input) !void {
    var report = d.inspectDecoded(a, input, options) catch |err| switch (err) {
        error.MissingSectionDefinition => return,
        else => return err,
    };
    defer report.deinit(a);
    return error.ExpectedDocumentFailure;
}
test "all allocation failures clean partial document reports and later section failures" {
    const h = f.header();
    const doc = try f.docInfo(t.allocator, 2);
    defer t.allocator.free(doc);
    const section = try f.section(t.allocator);
    defer t.allocator.free(section);
    const input: d.Input = .{ .header = &h, .doc_info = doc, .sections = &.{ .{ .index = 0, .bytes = section }, .{ .index = 1, .bytes = section } } };
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{input});
    var bad = input;
    bad.sections = &.{ input.sections[0], .{ .index = 1, .bytes = &.{} } };
    try t.checkAllAllocationFailures(t.allocator, lateFailure, .{bad});
}
