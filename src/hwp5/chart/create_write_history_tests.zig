//! Prepared tests, not evidence of executed Native chart creation.
const std = @import("std");
const a = std.testing.allocator;
const resources = @import("created_resources.zig");
const cp = @import("../edit/table_checkpoint.zig");
const model = @import("../../model/document.zig");
const Tables = @import("../edit/created_table_values.zig").Values;
const Backgrounds = @import("../edit/cell_background_values.zig").Values;
const fixture = @import("create_test_fixture.zig");
fn owned(allocator: std.mem.Allocator) !resources.Values {
    const entries = try allocator.alloc(resources.Entry, 1);
    errdefer allocator.free(entries);
    const path = try allocator.dupe(u8, "/BinData/BIN0001");
    errdefer allocator.free(path);
    const bytes = try allocator.dupe(u8, "OWN-OLE-TRANSPORT");
    errdefer allocator.free(bytes);
    const info = try allocator.dupe(u8, "OWN-DOCINFO");
    entries[0] = .{ .ordinal = 1, .physical = 1, .path = path, .bytes = bytes };
    return .{ .docinfo = info, .entries = entries };
}
test "H5 chart write history owned values clone exact cap and independent buffers" {
    var input = try owned(a);
    defer input.deinit(a);
    const bytes = try input.byteSize(4096);
    try std.testing.expectError(error.LimitExceeded, input.byteSize(bytes - 1));
    var copy = try input.clone(a, bytes);
    defer copy.deinit(a);
    try std.testing.expect(input.equals(copy));
    input.entries[0].bytes[0] = 'X';
    input.docinfo.?[0] = 'X';
    try std.testing.expect(!input.equals(copy));
    try std.testing.expectEqualStrings("OWN-OLE-TRANSPORT", copy.entries[0].bytes);
    try std.testing.expectEqualStrings("OWN-DOCINFO", copy.docinfo.?);
    try std.testing.expectError(error.LimitExceeded, copy.read(a, 1, copy.entries[0].bytes.len - 1));
    const read = (try copy.read(a, 1, copy.entries[0].bytes.len)).?;
    defer a.free(read);
    try std.testing.expectEqualSlices(u8, copy.entries[0].bytes, read);
}
test "H5 chart write history checkpoint exchange rollback clone owner and exact budget" {
    var document: model.Document = .{ .format = .hwp5, .sections = try a.alloc(model.Section, 0) };
    defer document.deinit(a);
    var tables = try a.alloc(Tables, 0);
    defer a.free(tables);
    var backgrounds: Backgrounds = .{};
    defer backgrounds.deinit(a);
    var charts = try owned(a);
    defer charts.deinit(a);
    var owner: u8 = 0;
    var other_owner: u8 = 0;
    const exact = try cp.sizeWithCharts(&document, tables, backgrounds, charts, 65536);
    try std.testing.expectError(error.LimitExceeded, cp.captureWithCharts(a, &owner, &document, tables, backgrounds, charts, exact - 1));
    const snapshot = try cp.captureWithCharts(a, &owner, &document, tables, backgrounds, charts, exact);
    defer snapshot.deinit();
    try std.testing.expectError(error.SourceBindingMismatch, cp.matchesWithCharts(snapshot, a, &other_owner, &document, tables, backgrounds, charts));
    try std.testing.expectError(error.SourceBindingMismatch, cp.exchangeWithCells(snapshot, a, &owner, &document, &tables, &backgrounds));
    try std.testing.expect(try cp.matchesWithCharts(snapshot, a, &owner, &document, tables, backgrounds, charts));
    const cloned = try cp.cloneTo(snapshot, a, &owner, exact);
    defer cloned.deinit();
    charts.entries[0].bytes[0] = 'X';
    try cp.exchangeWithCharts(snapshot, a, &owner, &document, &tables, &backgrounds, &charts);
    try std.testing.expectEqual(@as(u8, 'O'), charts.entries[0].bytes[0]);
    try cp.exchangeWithCharts(snapshot, a, &owner, &document, &tables, &backgrounds, &charts);
    try std.testing.expectEqual(@as(u8, 'X'), charts.entries[0].bytes[0]);
    try cp.rollbackWithCharts(cloned, a, &owner, &document, &tables, &backgrounds, &charts);
    try std.testing.expectEqual(@as(u8, 'O'), charts.entries[0].bytes[0]);
}
test "H5 chart write history checkpoint limit rejection preserves live values and stored snapshot" {
    var document: model.Document = .{ .format = .hwp5, .sections = try a.alloc(model.Section, 0) };
    defer document.deinit(a);
    var tables = try a.alloc(Tables, 0);
    defer a.free(tables);
    var backgrounds: Backgrounds = .{};
    defer backgrounds.deinit(a);
    var charts = try owned(a);
    defer charts.deinit(a);
    var owner: u8 = 0;
    const exact = try cp.sizeWithCharts(&document, tables, backgrounds, charts, 65536);
    const snapshot = try cp.captureWithCharts(a, &owner, &document, tables, backgrounds, charts, exact);
    defer snapshot.deinit();
    const larger = try a.dupe(u8, "OWN-OLE-TRANSPORT+");
    a.free(charts.entries[0].bytes);
    charts.entries[0].bytes = larger;
    try std.testing.expectError(error.LimitExceeded, cp.exchangeWithCharts(snapshot, a, &owner, &document, &tables, &backgrounds, &charts));
    try std.testing.expectEqualStrings("OWN-OLE-TRANSPORT+", charts.entries[0].bytes);
    try cp.rollbackWithCharts(snapshot, a, &owner, &document, &tables, &backgrounds, &charts);
    try std.testing.expectEqualStrings("OWN-OLE-TRANSPORT", charts.entries[0].bytes);
}
test "H5 chart write history resource-only full CFB reopen retains body and existing streams" {
    const source_bytes = try @import("../../new_document/hwp5.zig").create(a);
    defer a.free(source_bytes);
    var source = try @import("../text_source.zig").Source.open(a, source_bytes);
    defer source.deinit();
    const docinfo = try source.decodeDocInfo(a, 1048576);
    defer a.free(docinfo);
    var prepared = try @import("create_resources.zig").prepare(a, docinfo, source.header.version(), &.{}, fixture.data, fixture.fallback, .{});
    defer prepared.deinit(a);
    const pending = [_]resources.Entry{
        .{ .ordinal = prepared.docinfo.ids.ordinals.ole, .physical = prepared.docinfo.ids.physical.ole, .path = prepared.ole_path, .bytes = prepared.ole },
        .{ .ordinal = prepared.docinfo.ids.ordinals.fallback, .physical = prepared.docinfo.ids.physical.fallback, .path = prepared.fallback_path, .bytes = prepared.fallback },
    };
    const output = try @import("created_resource_write.zig").rebuild(a, &source.file, &.{.{ .path = "/DocInfo", .content = prepared.docinfo.bytes }}, &pending, .{});
    defer a.free(output);
    var reopened = try @import("../text_source.zig").Source.open(a, output);
    defer reopened.deinit();
    for ([_][]const u8{ "/FileHeader", "/BodyText/Section0" }) |path| {
        const before = try source.file.findExact(path) orelse return error.MissingHwpEntry;
        const after = try reopened.file.findExact(path) orelse return error.MissingHwpEntry;
        try std.testing.expectEqualSlices(u8, source.file.entries[before].content, reopened.file.entries[after].content);
    }
    for (pending) |entry| {
        const index = try reopened.file.findExact(entry.path) orelse return error.MissingHwpEntry;
        try std.testing.expectEqualSlices(u8, entry.bytes, reopened.file.entries[index].content);
    }
    // This is deliberately resource transport, not a chart: no body owner was inserted.
    try std.testing.expectError(error.DuplicateDirectoryName, @import("created_resource_write.zig").rebuild(a, &reopened.file, &.{}, &pending, .{}));
}
test "H5 chart write history value clone propagates allocation failures" {
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator) !void {
            var input = try owned(allocator);
            defer input.deinit(allocator);
            var copy = try input.clone(allocator, 4096);
            defer copy.deinit(allocator);
            try std.testing.expect(input.equals(copy));
        }
    }.run, .{});
}
test "H5 chart write history preview values bind exact authored XML and enforce output cap" {
    const output = try @import("create_preview.zig").write(a, fixture.data, 1048576);
    defer a.free(output);
    var json = try std.json.parseFromSlice(std.json.Value, a, output, .{});
    defer json.deinit();
    const xml = try @import("../../hwpx/chart_create_xml.zig").create(a, fixture.data);
    defer a.free(xml);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(xml, &digest, .{});
    const values = json.value.object.get("xml_sha256").?.array.items;
    try std.testing.expectEqual(@as(usize, 32), values.len);
    for (digest, values) |byte, value| try std.testing.expectEqual(@as(i64, byte), value.integer);
    try std.testing.expectEqualStrings("hwp5-chart-create-preview", json.value.object.get("scope").?.string);
    try std.testing.expectEqual(false, json.value.object.get("executionAuthority").?.bool);
    const exact = try @import("create_preview.zig").write(a, fixture.data, output.len);
    defer a.free(exact);
    try std.testing.expectEqualSlices(u8, output, exact);
    try std.testing.expectError(error.LimitExceeded, @import("create_preview.zig").write(a, fixture.data, output.len - 1));
}

test "H5 chart write history product admission refuses stale payload and test-only tiny raster" {
    const input = try fixture.docinfo(a);
    defer a.free(input);
    const xml = try @import("../../hwpx/chart_create_xml.zig").create(a, fixture.data);
    defer a.free(xml);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(xml, &digest, .{});
    const render = @import("create_rendered_resources.zig");
    try std.testing.expectError(error.ChartCreatePreviewPixelLimit, render.prepare(a, input, fixture.version, fixture.names, fixture.data, .{
        .source_xml_sha256 = digest,
        .pixel_width = 2,
        .pixel_height = 1,
        .bytes = fixture.fallback,
    }, .{}));
    digest[0] ^= 1;
    try std.testing.expectError(error.StaleChartCreatePreview, render.prepare(a, input, fixture.version, fixture.names, fixture.data, .{
        .source_xml_sha256 = digest,
        .pixel_width = 128,
        .pixel_height = 96,
        .bytes = fixture.fallback,
    }, .{}));
}
