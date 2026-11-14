//! Authored synthetic cases only; no filesystem/corpus/root test imports.
const std = @import("std");
const api = @import("chart_create.zig");
const data: api.Data = .{
    .categories = &.{ " 첫&<범주>😀 ", "_x0041_\r끝" },
    .series = &.{
        .{ .name = "계열 & <A>", .values = &.{ "-0", "1.25e2" } },
        .{ .name = "_x0042_😀", .values = &.{ "-2.5", "0" } },
    },
};

fn payloadCase(a: std.mem.Allocator) !void {
    const xml = try @import("chart_create_xml.zig").create(a, data);
    defer a.free(xml);
    var tree = try @import("chart_tree.zig").parse(a, xml, 0, .{});
    defer tree.deinit(a);
    var points = try @import("chart_point_values.zig").collect(a, &tree, .{});
    defer points.deinit(a);
    var names = try @import("chart_series_text_values.zig").collect(a, &tree, .{});
    defer names.deinit(a);
    try std.testing.expectEqual(data.series.len, names.items.len);
    try std.testing.expectEqual(@as(usize, 8), points.points.len);
    var cursor: usize = 0;
    for (data.series, 0..) |series, ordinal| {
        try std.testing.expectEqualStrings(series.name, names.items[ordinal].text);
        for (data.categories, 0..) |category, index| {
            const point = points.points[cursor];
            try std.testing.expectEqual(.string_literal, point.kind);
            try std.testing.expectEqual(@as(u32, @intCast(index)), point.index);
            try std.testing.expectEqualStrings(category, point.value);
            cursor += 1;
        }
        for (series.values, 0..) |value, index| {
            const point = points.points[cursor];
            try std.testing.expectEqual(.numeric_literal, point.kind);
            try std.testing.expectEqual(@as(u32, @intCast(index)), point.index);
            try std.testing.expectEqualStrings(value, point.value);
            cursor += 1;
        }
    }
    const ole = try @import("chart_create_ole.zig").create(a, xml);
    defer a.free(ole);
    try std.testing.expectEqual(ole.len - 4, @as(usize, std.mem.readInt(u32, ole[0..4], .little)));
    var cfb = try @import("../ole/container.zig").open(a, ole, .observed_size_prefix, .{ .strict = true });
    defer cfb.deinit();
    const stream = (try cfb.findExact("/OOXMLChartContents")).?;
    try std.testing.expectEqualStrings(xml, cfb.entries[stream].content);
    try std.testing.expect(std.mem.indexOf(u8, xml, "<c:barDir val=\"col\"/>") != null);
    try std.testing.expect(std.mem.indexOf(u8, xml, "<c:grouping val=\"clustered\"/>") != null);
    try std.testing.expect(std.mem.indexOf(u8, xml, "strRef") == null);
    try std.testing.expect(std.mem.indexOf(u8, xml, "externalData") == null);
}

test "HWPX chart create synthetic literals names UTF8 Xstring and strict CFB equality" {
    try payloadCase(std.testing.allocator);
}
test "HWPX chart create synthetic payload allocation failure sweep" {
    try @import("../testing/allocation_failures.zig").check(payloadCase, .{});
}
test "HWPX chart create rejects ragged nonfinite invalid text and size" {
    const validate = @import("chart_create_data.zig").validate;
    try std.testing.expectError(error.InvalidChartCreateShape, validate(.{ .categories = &.{}, .series = data.series }));
    try std.testing.expectError(error.InvalidChartCreateShape, validate(.{ .categories = data.categories, .series = &.{.{ .name = "x", .values = &.{"1"} }} }));
    for ([_][]const u8{ "NaN", "inf", "1e999", "", "1,000", "=A1", "1 2" }) |value| {
        try std.testing.expectError(error.InvalidChartNumericValue, validate(.{ .categories = &.{"x"}, .series = &.{.{ .name = "n", .values = &.{value} }} }));
    }
    try std.testing.expectError(error.InvalidUtf8, validate(.{ .categories = &.{"\xff"}, .series = &.{.{ .name = "n", .values = &.{"0"} }} }));
    try std.testing.expectError(error.InvalidChartCreateText, validate(.{ .categories = &.{"\x00"}, .series = &.{.{ .name = "n", .values = &.{"0"} }} }));
    try std.testing.expectError(error.InvalidChartCreateSize, @import("chart_create_host.zig").validateSize(.{ .width = 0, .height = 1 }));
}

fn requestFor(input: []const u8) api.Request {
    var hash: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(input, &hash, .{});
    return .{ .expected_source_sha256 = hash, .target = .{ .section = 0, .paragraph = 1, .unit = 0, .expected_text = "" }, .size = .{ .width = 21600, .height = 14400 }, .data = data };
}

fn packageCase(a: std.mem.Allocator, input: []const u8) !void {
    var result = try api.prepare(a, input, requestFor(input));
    defer result.deinit(a);
    var before = try @import("../zip/archive.zig").open(a, input, .{});
    defer before.deinit();
    var after = try @import("../zip/archive.zig").open(a, result.bytes, .{});
    defer after.deinit();
    try std.testing.expectEqual(before.entries.len + 2, after.entries.len);
    for (before.entries) |entry| {
        if (std.mem.eql(u8, entry.name, "Contents/section0.xml") or std.mem.eql(u8, entry.name, "Contents/content.hpf")) continue;
        const old = try before.decode(entry, 16 * 1024 * 1024);
        defer a.free(old);
        const current = try after.decode(after.find(entry.name).?, 16 * 1024 * 1024);
        defer a.free(current);
        try std.testing.expectEqualSlices(u8, old, current);
    }
    const section = try after.decode(after.find("Contents/section0.xml").?, 16 * 1024 * 1024);
    defer a.free(section);
    try std.testing.expect(std.mem.indexOf(u8, section, "<hp:chart ") != null);
    try std.testing.expect(std.mem.indexOf(u8, section, "<hp:ole ") != null);
    try std.testing.expect(std.mem.indexOf(u8, section, "<hp:pic") == null);
    try std.testing.expect(result.ids.chart != result.ids.ole);
    try std.testing.expect(result.ids.chart_instance != result.ids.ole_instance);
}

test "HWPX chart create synthetic package preserves unrelated decoded parts" {
    const a = std.testing.allocator;
    const input = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(input);
    try packageCase(a, input);
}
test "HWPX chart create synthetic package OOM sweep leaves immutable input unchanged" {
    const a = std.testing.allocator;
    const input = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(input);
    const copy = try a.dupe(u8, input);
    defer a.free(copy);
    try @import("../testing/allocation_failures.zig").check(packageCase, .{input});
    try std.testing.expectEqualSlices(u8, copy, input);
}
test "HWPX chart create stale source and text refusals do not mutate input" {
    const a = std.testing.allocator;
    const input = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(input);
    var request = requestFor(input);
    request.expected_source_sha256[0] ^= 1;
    try std.testing.expectError(error.SourceHashMismatch, api.prepare(a, input, request));
    request = requestFor(input);
    request.target.expected_text = "stale";
    try std.testing.expectError(error.InlineObjectTextMismatch, api.prepare(a, input, request));
    request = requestFor(input);
    request.target.section = 1;
    try std.testing.expectError(error.UnsupportedInsertSections, api.prepare(a, input, request));
}

test "HWPX chart create reserves orphan physical XML ids and unmanifested ZIP paths" {
    const a = std.testing.allocator;
    const input = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(input);
    var archive = try @import("../zip/archive.zig").open(a, input, .{});
    defer archive.deinit();
    const store = @import("../zip/store_writer.zig");
    var sources: std.ArrayList(store.Source) = .empty;
    defer sources.deinit(a);
    var decoded: std.ArrayList([]u8) = .empty;
    defer {
        for (decoded.items) |bytes| a.free(bytes);
        decoded.deinit(a);
    }
    for (archive.entries) |entry| {
        const bytes = try archive.decode(entry, 16 * 1024 * 1024);
        decoded.append(a, bytes) catch |err| {
            a.free(bytes);
            return err;
        };
        try sources.append(a, .{ .name = entry.name, .bytes = bytes });
    }
    try sources.append(a, .{ .name = "Orphans/inactive.XML", .bytes = "<orphan><inactive id='1' instid='2'/><master id='3' instid='4'/></orphan>" });
    try sources.append(a, .{ .name = "Chart/hwpjs-created-0.xml", .bytes = "<unused/>" });
    const with_orphan = try store.write(a, sources.items, .{});
    defer a.free(with_orphan);
    var result = try api.prepare(a, with_orphan, requestFor(with_orphan));
    defer result.deinit(a);
    try std.testing.expectEqual(@as(u32, 1), result.resource_index);
    for ([_]u32{ result.ids.chart, result.ids.chart_instance, result.ids.ole, result.ids.ole_instance }) |id| try std.testing.expect(id > 4);
}
