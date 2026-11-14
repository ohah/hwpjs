//! Atomic package preparation for a genuinely new chart, never source insertion.
const std = @import("std");
const api = @import("chart_create.zig");
const inline_insert = @import("inline_object_insert.zig");
const package = @import("package.zig");
const security = @import("file_transform_security.zig");
const source_writer = @import("xml_source_writer.zig");
const store = @import("../zip/store_writer.zig");
const xml_limit = 16 * 1024 * 1024;
const total_limit = 96 * 1024 * 1024;
const output_limit = 128 * 1024 * 1024;
const opf_uri = "http://www.idpf.org/2007/opf/";

const ManifestEnd = struct {
    source: []const u8,
    at: ?usize = null,
    fn tag(raw: *anyopaque, value: @import("../xml/root.zig").tags.Tag, scope: *const @import("../xml/root.zig").namespaces.State, depth: usize) anyerror!void {
        const self: *@This() = @ptrCast(@alignCast(raw));
        if (depth != 2 or value.kind != .end or !try @import("xml_attributes.zig").element(value, scope, opf_uri, "manifest")) return;
        if (self.at != null) return error.AmbiguousContentManifest;
        self.at = @intFromPtr(value.raw.ptr) - @intFromPtr(self.source.ptr);
    }
};

pub fn prepare(a: std.mem.Allocator, input: []const u8, request: api.Request) !api.Result {
    if (input.len == 0 or input.len > 64 * 1024 * 1024) return error.LimitExceeded;
    try inline_insert.verifySource(input, request.expected_source_sha256);
    if (request.target.section != 0) return error.UnsupportedInsertSections;
    if (request.target.expected_text.len > @import("../image/image_insertion.zig").max_text_bytes) return error.LimitExceeded;
    _ = try @import("../image/image_insertion.zig").byteOffset(request.target.expected_text, request.target.unit);
    try @import("chart_create_data.zig").validate(request.data);
    try @import("chart_create_host.zig").validateSize(request.size);
    var doc = try package.inspectDocument(a, input, .{});
    defer doc.deinit(a);
    try security.validate(a, &doc, xml_limit);
    var trees = try doc.readXmlTrees(a, .{ .max_total_owned_xml_bytes = total_limit, .header = .{ .max_xml_bytes = xml_limit }, .section = .{ .max_xml_bytes = xml_limit } });
    defer trees.deinit(a);
    try security.validateTree(&trees.header);
    if (request.target.section >= trees.sections.len) return error.InvalidSectionIndex;
    var counters: @import("section_text.zig").Report = .{};
    var selected: ?usize = null;
    for (trees.sections) |*tree| {
        try security.validateTree(tree);
        if (try inline_insert.locate(a, tree, request.target, &counters)) |node| {
            if (selected != null) return error.SourceBindingMismatch;
            selected = node;
        }
    }
    const paragraph = selected orelse return error.InvalidParagraphIndex;
    // Shared scanner includes every physical XML part, all branches and orphans.
    const allocated = try inline_insert.nextPackageIds(a, &doc, 4, xml_limit, total_limit);
    defer a.free(allocated);
    const ids: @import("chart_create_host.zig").Identity = .{ .chart = allocated[0], .chart_instance = allocated[1], .ole = allocated[2], .ole_instance = allocated[3] };
    var names: std.StringHashMapUnmanaged(void) = .empty;
    defer names.deinit(a);
    for (doc.archive.entries) |entry| try names.put(a, entry.name, {});
    for (doc.manifest.items) |item| {
        try names.put(a, item.id, {});
        try names.put(a, item.href, {});
    }
    var index: u32 = 0;
    var chart_path: []u8 = undefined;
    var ole_path: []u8 = undefined;
    var chart_id: []u8 = undefined;
    var ole_id: []u8 = undefined;
    while (true) {
        chart_path = try std.fmt.allocPrint(a, "Chart/hwpjs-created-{d}.xml", .{index});
        ole_path = std.fmt.allocPrint(a, "BinData/hwpjs-created-chart-{d}.ole", .{index}) catch |err| {
            a.free(chart_path);
            return err;
        };
        chart_id = std.fmt.allocPrint(a, "hwpjs-created-chart-{d}", .{index}) catch |err| {
            a.free(chart_path);
            a.free(ole_path);
            return err;
        };
        ole_id = std.fmt.allocPrint(a, "hwpjs-created-chart-ole-{d}", .{index}) catch |err| {
            a.free(chart_path);
            a.free(ole_path);
            a.free(chart_id);
            return err;
        };
        if (!names.contains(chart_path) and !names.contains(ole_path) and !names.contains(chart_id) and !names.contains(ole_id)) break;
        a.free(chart_path);
        a.free(ole_path);
        a.free(chart_id);
        a.free(ole_id);
        index = std.math.add(u32, index, 1) catch return error.LimitExceeded;
    }
    defer a.free(chart_path);
    defer a.free(ole_path);
    defer a.free(chart_id);
    defer a.free(ole_id);
    const chart = try @import("chart_create_xml.zig").create(a, request.data);
    defer a.free(chart);
    const ole = try @import("chart_create_ole.zig").create(a, chart);
    defer a.free(ole);
    const host = try @import("chart_create_host.zig").create(a, request.size, ids, chart_path, ole_id);
    defer a.free(host);
    const tree = &trees.sections[request.target.section];
    const section = try inline_insert.write(a, tree, paragraph, request.target, host, xml_limit);
    defer a.free(section);
    const opf_entry = doc.archive.find(doc.container.path) orelse return error.MissingContentManifest;
    const old_opf = try doc.archive.decode(opf_entry, xml_limit);
    defer a.free(old_opf);
    var locator: ManifestEnd = .{ .source = old_opf };
    _ = try @import("document_xml.zig").visitBytes(a, old_opf, xml_limit, .{}, .{ .context = &locator, .on_tag = ManifestEnd.tag });
    const at = locator.at orelse return error.MissingContentManifest;
    const items = try std.fmt.allocPrint(a, "<item xmlns=\"{s}\" id=\"{s}\" href=\"{s}\" media-type=\"application/xml\" isEmbeded=\"1\"/><item xmlns=\"{s}\" id=\"{s}\" href=\"{s}\" media-type=\"application/ole\" isEmbeded=\"1\"/>", .{ opf_uri, chart_id, chart_path, opf_uri, ole_id, ole_path });
    defer a.free(items);
    const manifest = try source_writer.write(a, old_opf, &.{.{ .start = at, .end = at, .text = "", .serialized_xml = items }}, xml_limit);
    defer a.free(manifest);
    var sources: std.ArrayList(store.Source) = .empty;
    defer sources.deinit(a);
    var decoded: std.ArrayList([]u8) = .empty;
    defer {
        for (decoded.items) |bytes| a.free(bytes);
        decoded.deinit(a);
    }
    const section_path = doc.manifest.items[tree.item_index].href;
    var total = try std.math.add(usize, chart.len, ole.len);
    for (doc.archive.entries) |entry| {
        const bytes = if (std.mem.eql(u8, entry.name, section_path)) section else if (std.mem.eql(u8, entry.name, doc.container.path)) manifest else blk: {
            const owned = try doc.archive.decode(entry, @min(xml_limit, total_limit -| total));
            decoded.append(a, owned) catch |err| {
                a.free(owned);
                return err;
            };
            break :blk owned;
        };
        if (bytes.len > total_limit -| total) return error.LimitExceeded;
        total += bytes.len;
        try sources.append(a, .{ .name = entry.name, .bytes = bytes });
    }
    try sources.append(a, .{ .name = chart_path, .bytes = chart });
    try sources.append(a, .{ .name = ole_path, .bytes = ole });
    const output = try store.write(a, sources.items, .{ .max_output_bytes = output_limit });
    errdefer a.free(output);
    try verify(a, output, request.target.section, ids, chart_path, ole_path, chart);
    return .{ .bytes = output, .ids = ids, .resource_index = index };
}

fn verify(a: std.mem.Allocator, output: []const u8, ordinal: usize, ids: @import("chart_create_host.zig").Identity, chart_path: []const u8, ole_path: []const u8, expected: []const u8) !void {
    var doc = try package.inspectDocument(a, output, .{});
    defer doc.deinit(a);
    var chart_items: usize = 0;
    var ole_items: usize = 0;
    for (doc.manifest.items) |item| {
        if (std.mem.eql(u8, item.href, chart_path)) {
            if (item.embedded != true or item.entry_index == null or !std.mem.eql(u8, item.media_type, "application/xml")) return error.ChartCreateVerificationFailed;
            chart_items += 1;
        }
        if (std.mem.eql(u8, item.href, ole_path)) {
            if (item.embedded != true or item.entry_index == null or !std.mem.eql(u8, item.media_type, "application/ole")) return error.ChartCreateVerificationFailed;
            ole_items += 1;
        }
    }
    if (chart_items != 1 or ole_items != 1) return error.ChartCreateVerificationFailed;
    var tree = try doc.readSectionTree(a, ordinal, .{});
    defer tree.deinit(a);
    var matches: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "switch")) continue;
        const owners = @import("chart_pair_target.zig").objects(&tree, node) catch continue;
        const raw = try tree.attributeValue(a, owners.chart, "", "id") orelse continue;
        const value = try raw.toUtf8(a, 32);
        defer a.free(value);
        const id = std.fmt.parseInt(u32, value, 10) catch continue;
        if (id != ids.chart) continue;
        var pair = try @import("chart_pair_target.zig").resolve(a, &doc, &tree, node);
        defer pair.deinit(a);
        if (!std.mem.eql(u8, pair.chart_path, chart_path) or !std.mem.eql(u8, pair.ole_path, ole_path) or pair.declared_external) return error.ChartCreateVerificationFailed;
        matches += 1;
    }
    if (matches != 1) return error.ChartCreateVerificationFailed;
    const chart_entry = doc.archive.find(chart_path) orelse return error.ChartCreateVerificationFailed;
    const chart = try doc.archive.decode(chart_entry, xml_limit);
    defer a.free(chart);
    if (!std.mem.eql(u8, chart, expected)) return error.ChartCreateVerificationFailed;
    var chart_tree = try @import("chart_tree.zig").parse(a, chart, 0, .{ .max_xml_bytes = xml_limit });
    defer chart_tree.deinit(a);
    var values = try @import("chart_point_values.zig").collect(a, &chart_tree, .{});
    defer values.deinit(a);
    const ole_entry = doc.archive.find(ole_path) orelse return error.ChartCreateVerificationFailed;
    const ole = try doc.archive.decode(ole_entry, 2 * xml_limit);
    defer a.free(ole);
    var cfb = try @import("../ole/container.zig").open(a, ole, .observed_size_prefix, .{ .strict = true, .max_input_bytes = 2 * xml_limit, .max_stream_bytes = xml_limit });
    defer cfb.deinit();
    const stream = try cfb.findExact("/OOXMLChartContents") orelse return error.ChartCreateVerificationFailed;
    if (!std.mem.eql(u8, cfb.entries[stream].content, chart)) return error.ChartCreateVerificationFailed;
}
