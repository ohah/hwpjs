//! Exact source-wrapper/OPF association, separate from XML edits and ZIP publication.
const std = @import("std");
const Document = @import("package.zig").Document;
const Tree = @import("xml_part_tree.zig").Tree;
const links = @import("binary_reference_links.zig");
const uri = @import("document_xml.zig").paragraph_uri;
pub const Pair = struct {
    chart_path: []u8,
    ole_path: []u8,
    wrapper_node: usize,
    section_ordinal: usize,
    section_sha256: [32]u8,
    declared_external: bool,
    pub fn deinit(self: *Pair, a: std.mem.Allocator) void {
        a.free(self.chart_path);
        a.free(self.ole_path);
        self.* = undefined;
    }
    pub fn validateSource(self: *const Pair, tree: *const Tree) !void {
        var hash: [32]u8 = undefined;
        std.crypto.hash.sha2.Sha256.hash(tree.source, &hash, .{});
        if (tree.part_kind != .section or tree.section_ordinal != self.section_ordinal or !std.mem.eql(u8, &hash, &self.section_sha256)) return error.SourceBindingMismatch;
    }
};

pub const Objects = struct { chart: usize, ole: usize };

/// Exact direct case/default owners shared by resource binding and display.
pub fn objects(tree: *const Tree, wrapper: usize) !Objects {
    if (tree.part_kind != .section or !@import("run_switch_anchor.zig").supported(tree, wrapper)) return error.InvalidChartPair;
    var chart: ?usize = null;
    var fallback: ?usize = null;
    var branch = tree.elements[wrapper].first_child;
    while (branch) |node| {
        if (tree.elements[node].is(uri, "case")) {
            if (chart != null) return error.AmbiguousChartPair;
            chart = tree.elements[node].first_child.?;
        } else fallback = tree.elements[node].first_child.?;
        branch = tree.elements[node].next_sibling;
    }
    return .{ .chart = chart orelse return error.InvalidChartPair, .ole = fallback orelse return error.InvalidChartPair };
}

fn attribute(a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8) ![]u8 {
    const value = try tree.attributeValue(a, node, "", name) orelse return error.MissingChartPairReference;
    const text = try value.toUtf8(a, 4096);
    errdefer a.free(text);
    if (text.len == 0) return error.MissingChartPairReference;
    return text;
}

pub fn resolve(a: std.mem.Allocator, document: *const Document, tree: *const Tree, wrapper: usize) !Pair {
    if (tree.part_kind != .section or tree.section_ordinal == null or !@import("run_switch_anchor.zig").supported(tree, wrapper)) return error.InvalidChartPair;
    var structure = try document.inspectStructure(a, .{});
    defer structure.deinit(a);
    const ordinal = tree.section_ordinal.?;
    if (ordinal >= structure.sections.len or structure.sections[ordinal].item_index != tree.item_index) return error.SourceBindingMismatch;
    const section_entry = document.manifest.items[tree.item_index].entry_index orelse return error.SourceBindingMismatch;
    if (document.archive.entries[section_entry].uncompressed_size != tree.source.len) return error.SourceBindingMismatch;
    const original_xml = try document.archive.decode(document.archive.entries[section_entry], tree.source.len);
    defer document.archive.allocator.free(original_xml);
    if (!std.mem.eql(u8, original_xml, tree.source)) return error.SourceBindingMismatch;
    const owners = try objects(tree, wrapper);
    const chart_ref = try attribute(a, tree, owners.chart, "chartIDRef");
    defer a.free(chart_ref);
    if (!@import("../zip/archive.zig").validPath(chart_ref)) return error.InvalidChartPair;
    const chart_entry = document.archive.find(chart_ref) orelse return error.MissingChartEntry;
    const ole_ref = try attribute(a, tree, owners.ole, "binaryItemIDRef");
    defer a.free(ole_ref);
    var index = try links.Index.init(a, document.manifest);
    defer index.deinit(a);
    const target = links.resolve(&index, document.manifest, ole_ref);
    const item_index = target.item_index orelse return error.MissingOleEntry;
    const item = document.manifest.items[item_index];
    const ole_index = try @import("ole_payloads.zig").packagedEntry(document.archive, item) orelse return if (target.state == .external) error.ExternalChartOle else error.MissingOleEntry;
    const ole_entry = document.archive.entries[ole_index];
    if (std.mem.eql(u8, chart_entry.name, ole_entry.name)) return error.InvalidChartPair;
    const chart_path = try a.dupe(u8, chart_entry.name);
    errdefer a.free(chart_path);
    const ole_path = try a.dupe(u8, ole_entry.name);
    var hash: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(tree.source, &hash, .{});
    return .{ .chart_path = chart_path, .ole_path = ole_path, .wrapper_node = wrapper, .section_ordinal = tree.section_ordinal.?, .section_sha256 = hash, .declared_external = item.embedded == false };
}
