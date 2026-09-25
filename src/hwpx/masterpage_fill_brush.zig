const std = @import("std");
const zip = @import("../zip/archive.zig");
const part_tree = @import("xml_part_tree.zig");
const masterpage_parts = @import("masterpage_parts.zig");
const fill_brush = @import("fill_brush.zig");

pub const Options = struct {
    max_parts: usize = 4096,
    max_part_xml_bytes: usize = 32 * 1024 * 1024,
    max_total_xml_bytes: usize = 128 * 1024 * 1024,
    max_total_elements: usize = 4_000_000,
    tree: part_tree.Options = .{},
    brush: fill_brush.Options = .{},
};

pub const Report = fill_brush.Report;

/// The manifest-selected part inventory owns selection. Only decoded XML
/// trees and aggregate budgets live here; field semantics stay in fill_brush.
pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, parts: []const masterpage_parts.Part, options: Options) !Report {
    if (parts.len > options.max_parts) return error.LimitExceeded;
    const trees = try a.alloc(part_tree.Tree, parts.len);
    defer a.free(trees);
    var built: usize = 0;
    defer {
        for (trees[0..built]) |*tree| tree.deinit(a);
    }
    var remaining_bytes = options.max_total_xml_bytes;
    var remaining_elements = options.max_total_elements;
    for (parts, 0..) |part, ordinal| {
        if (part.entry_index >= archive.entries.len) return error.InvalidManifestEntryIndex;
        const max_bytes = @min(@min(options.max_part_xml_bytes, options.tree.max_xml_bytes), remaining_bytes);
        const bytes = try archive.decode(archive.entries[part.entry_index], max_bytes);
        defer archive.allocator.free(bytes);
        const tree = try part_tree.parse(a, bytes, .master_page, ordinal, part.item_index, .{
            .max_xml_bytes = max_bytes,
            .max_nodes = @min(options.tree.max_nodes, remaining_elements),
            .xml = options.tree.xml,
        });
        trees[built] = tree;
        built += 1;
        const direct_elements = std.math.add(usize, part.sub_lists.len, part.other_direct_elements) catch return error.LimitExceeded;
        const child_elements = std.math.add(usize, direct_elements, part.descendant_elements) catch return error.LimitExceeded;
        const expected_elements = std.math.add(usize, 1, child_elements) catch return error.LimitExceeded;
        if (tree.elements.len != expected_elements) return error.InconsistentMasterPageSelection;
        remaining_bytes -= bytes.len;
        remaining_elements -= tree.elements.len;
    }
    return fill_brush.inspectMasterTrees(a, trees, options.brush);
}
