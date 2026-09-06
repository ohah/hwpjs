const std = @import("std");
const t = std.testing;
const c = @import("validation.zig");
const f = @import("../document/test_fixture.zig");
const writer = @import("../../cfb/writer.zig");
const opts: c.Options = .{ .document = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } } };
fn fixture(a: std.mem.Allocator, late_failure: bool) ![]u8 {
    const h = f.header();
    const summary = @import("../summary/tests.zig").fixture();
    const doc = try f.docInfo(a, if (late_failure) 2 else 1);
    defer a.free(doc);
    const section = try f.section(a);
    defer a.free(section);
    const nodes = [_]writer.Node{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = &h },
        .{ .name = "DocInfo", .parent = 0, .content = doc },
        .{ .name = "BodyText", .parent = 0, .kind = 1 },
        .{ .name = "Section0", .parent = 3, .content = section },
        .{ .name = "PrvText", .parent = 0, .content = &.{ 0xff, 0xfe, 'A', 0 } },
        .{ .name = "\x05HwpSummaryInformation", .parent = 0, .content = &summary },
        .{ .name = "Section1", .parent = 3, .content = &.{} },
    };
    return writer.write(a, nodes[0..if (late_failure) 8 else 7], .{});
}
fn success(a: std.mem.Allocator, bytes: []const u8) !void {
    var report = try c.inspect(a, bytes, opts);
    defer report.deinit(a);
    try t.expectEqual(1, report.document.sections.len);
    try t.expectEqual(0, report.uninspected_streams);
    try t.expectEqual(1, report.preview_text.?.bom_units);
    try t.expectEqual(2, report.summary_information.?.properties);
    try t.expectEqual(0xa5, report.document.doc_info.properties.extra[0]);
}
fn failure(a: std.mem.Allocator, bytes: []const u8) !void {
    var report = c.inspect(a, bytes, opts) catch |err| switch (err) {
        error.MissingSectionDefinition => return,
        else => return err,
    };
    defer report.deinit(a);
    return error.ExpectedContainerFailure;
}
fn malformedPreview(a: std.mem.Allocator, bytes: []const u8) !void {
    var report = c.inspect(a, bytes, opts) catch |err| switch (err) {
        error.InvalidPreviewTextSize => return,
        else => return err,
    };
    defer report.deinit(a);
    return error.ExpectedPreviewFailure;
}
fn malformedSummary(a: std.mem.Allocator, bytes: []const u8) !void {
    var report = c.inspect(a, bytes, opts) catch |err| switch (err) {
        error.DuplicateSummaryProperty => return,
        else => return err,
    };
    defer report.deinit(a);
    return error.ExpectedSummaryFailure;
}
test "late summary failure releases earlier document, preview and partial property allocations" {
    const good = try fixture(t.allocator, false);
    defer t.allocator.free(good);
    var file = try @import("../../cfb/reader.zig").File.open(t.allocator, good, .{ .strict = true });
    defer file.deinit();
    const nodes = try file.toNodes(t.allocator);
    defer t.allocator.free(nodes);
    var summary = @import("../summary/tests.zig").fixture();
    f.put(&summary, 64, u32, 14);
    for (nodes) |*node| if (std.mem.eql(u8, node.name, "\x05HwpSummaryInformation")) {
        node.content = &summary;
    };
    const bad = try writer.write(t.allocator, nodes, .{});
    defer t.allocator.free(bad);
    try t.checkAllAllocationFailures(t.allocator, malformedSummary, .{bad});
}
test "late malformed preview cleans successful document and every allocation failure" {
    const good = try fixture(t.allocator, false);
    defer t.allocator.free(good);
    var file = try @import("../../cfb/reader.zig").File.open(t.allocator, good, .{ .strict = true });
    defer file.deinit();
    const nodes = try file.toNodes(t.allocator);
    defer t.allocator.free(nodes);
    for (nodes) |*node| if (std.mem.eql(u8, node.name, "PrvText")) {
        node.content = &.{1};
    };
    const bad = try writer.write(t.allocator, nodes, .{});
    defer t.allocator.free(bad);
    try t.checkAllAllocationFailures(t.allocator, malformedPreview, .{bad});
}
test "container success and partial section failure clean every allocation point" {
    const good = try fixture(t.allocator, false);
    defer t.allocator.free(good);
    try t.checkAllAllocationFailures(t.allocator, success, .{good});
    const bad = try fixture(t.allocator, true);
    defer t.allocator.free(bad);
    try t.checkAllAllocationFailures(t.allocator, failure, .{bad});
}
test "container report outlives input CFB and respects independent encoded limits" {
    const bytes = try fixture(t.allocator, false);
    var report = try c.inspect(t.allocator, bytes, opts);
    defer report.deinit(t.allocator);
    var limited = opts;
    limited.cfb.max_input_bytes = bytes.len - 1;
    try t.expectError(error.LimitExceeded, c.inspect(t.allocator, bytes, limited));
    t.allocator.free(bytes);
    try t.expectEqual(0xa5, report.document.doc_info.properties.extra[0]);
    try t.expectEqual(1, report.document.doc_info.resources.count(.style));
    try t.expectEqual(1, report.document.sections[0].control_types.checked);
    try t.expectEqual(report.document.total_bytes + 4 + 92, report.total_decoded_bytes);
    try t.expectEqual(2, report.preview_text.?.scalar_values);
}
test "canonical section namespace and bounded UTF16 BinData paths" {
    const paths = @import("paths.zig");
    try t.expectEqual(@as(?u16, 65535), try paths.sectionIndex("sEcTiOn65535"));
    try t.expectEqual(@as(?u16, null), try paths.sectionIndex("Other"));
    for ([_][]const u8{ "Section", "Section01", "Section65536", "Section-1", "Section99999999999999999999999999" }) |name| try t.expectError(error.InvalidSectionName, paths.sectionIndex(name));
    const p = try paths.binary(t.allocator, 0xffff, &.{ 0, 0xac });
    defer t.allocator.free(p);
    try t.expectEqualStrings("/BinData/BINffff.가", p);
    var max_ext: [46]u8 = undefined;
    for (0..23) |i| f.put(&max_ext, i * 2, u16, 'a');
    const longest = try paths.binary(t.allocator, 1, &max_ext);
    defer t.allocator.free(longest);
    try t.expectEqual(40, longest.len); // /BinData/ plus 31-unit component.
    for ([_][]const u8{ &.{0}, &.{ 0, 0 }, &.{ 0, 0xd8 }, &.{ '/', 0 }, &.{ '\\', 0 }, &([_]u8{0} ** 48) }) |ext| try t.expectError(error.InvalidBinDataExtension, paths.binary(t.allocator, 1, ext));
}
fn binaryCase(a: std.mem.Allocator, bytes: []const u8, missing: bool) !void {
    var report = c.inspect(a, bytes, opts) catch |err| switch (err) {
        error.MissingHwpEntry => if (missing) return else return err,
        else => return err,
    };
    defer report.deinit(a);
    try t.expect(!missing);
    try t.expectEqual(1, report.binary_data.decoded);
    try t.expectEqual(3, report.binary_data.decoded_bytes);
}
test "binary resolution success and missing stream unwind after document success" {
    const h = f.header();
    const base = try f.docInfo(t.allocator, 0);
    defer t.allocator.free(base);
    f.put(base, 35, u32, 1); // Mapping's first slot: BinData count, not storage id.
    var record = [_]u8{0} ** 16;
    f.put(&record, 0, u32, 18 | (1 << 10) | (12 << 20));
    @memcpy(record[4..], &[_]u8{ 0x21, 0, 9, 0, 3, 0, 'p', 0, 'n', 0, 'g', 0 });
    const doc = try std.mem.concat(t.allocator, u8, &.{ base, &record });
    defer t.allocator.free(doc);
    var nodes = [_]writer.Node{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = &h },
        .{ .name = "DocInfo", .parent = 0, .content = doc },
        .{ .name = "BodyText", .parent = 0, .kind = 1 },
        .{ .name = "BinData", .parent = 0, .kind = 1 },
        .{ .name = "BIN0009.png", .parent = 4, .content = "abc" },
    };
    for ([_]bool{ false, true }) |missing| {
        nodes[5].name = if (missing) "Wrong" else "BIN0009.png";
        const bytes = try writer.write(t.allocator, &nodes, .{ .version = 4 });
        defer t.allocator.free(bytes);
        try t.checkAllAllocationFailures(t.allocator, binaryCase, .{ bytes, missing });
    }
}
