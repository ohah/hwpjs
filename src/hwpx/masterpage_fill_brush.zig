const std = @import("std");
const zip = @import("../zip/archive.zig");
const part_tree = @import("xml_part_tree.zig");
const masterpage_parts = @import("masterpage_parts.zig");
const masterpage_trees = @import("masterpage_xml_trees.zig");
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
    var trees = try masterpage_trees.read(a, archive, parts, .{
        .max_parts = options.max_parts,
        .max_part_xml_bytes = options.max_part_xml_bytes,
        .max_total_xml_bytes = options.max_total_xml_bytes,
        .max_total_elements = options.max_total_elements,
        .tree = options.tree,
    });
    defer trees.deinit(a);
    return fill_brush.inspectMasterTrees(a, trees.trees, options.brush);
}
