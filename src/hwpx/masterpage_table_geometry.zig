const std = @import("std");
const zip = @import("../zip/archive.zig");
const part_tree = @import("xml_part_tree.zig");
const masterpage_parts = @import("masterpage_parts.zig");
const table_geometry = @import("table_geometry.zig");
const header_resources = @import("header_resources.zig");
const selection = @import("compatibility_selection.zig");

pub const Options = struct {
    max_parts: usize = 4096,
    max_part_xml_bytes: usize = 32 * 1024 * 1024,
    max_total_xml_bytes: usize = 128 * 1024 * 1024,
    max_total_elements: usize = 4_000_000,
    tree: part_tree.Options = .{},
    geometry: table_geometry.Options = .{},
};

pub const Report = struct {
    parts: usize = 0,
    sub_lists: usize = 0,
    xml_bytes: usize = 0,
    elements: usize = 0,
    geometry: table_geometry.Report = .{},
};

/// Decodes one selected master-page part at a time. The owned XML tree is
/// transient; returned numbers use the section table geometry rules unchanged.
pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, parts: []const masterpage_parts.Part, border_fills: ?*const header_resources.Table, options: Options, branch_policy: selection.Policy) !Report {
    try selection.validate(branch_policy);
    if (parts.len > options.max_parts) return error.LimitExceeded;
    var result: Report = .{ .geometry = table_geometry.initReport(border_fills) };
    var remaining_bytes = options.max_total_xml_bytes;
    var remaining_elements = options.max_total_elements;
    for (parts, 0..) |part, ordinal| {
        if (part.entry_index >= archive.entries.len) return error.InvalidManifestEntryIndex;
        const max_bytes = @min(@min(options.max_part_xml_bytes, options.tree.max_xml_bytes), remaining_bytes);
        const bytes = try archive.decode(archive.entries[part.entry_index], max_bytes);
        defer archive.allocator.free(bytes);
        var tree = try part_tree.parse(a, bytes, .master_page, ordinal, part.item_index, .{
            .max_xml_bytes = max_bytes,
            .max_nodes = @min(options.tree.max_nodes, remaining_elements),
            .xml = options.tree.xml,
        });
        defer tree.deinit(a);
        const direct_elements = std.math.add(usize, part.sub_lists.len, part.other_direct_elements) catch return error.LimitExceeded;
        const child_elements = std.math.add(usize, direct_elements, part.descendant_elements) catch return error.LimitExceeded;
        const expected_elements = std.math.add(usize, 1, child_elements) catch return error.LimitExceeded;
        if (tree.elements.len != expected_elements) return error.InconsistentMasterPageSelection;
        const sub_lists = if (branch_policy.mode == .selected)
            try table_geometry.inspectSelectedMasterPage(a, &tree, options.geometry, border_fills, branch_policy.supported_namespaces, &result.geometry)
        else
            try table_geometry.inspectMasterPage(a, &tree, options.geometry, border_fills, &result.geometry);
        if (sub_lists != part.sub_lists.len) return error.InconsistentMasterPageSelection;
        result.parts += 1;
        result.sub_lists += sub_lists;
        result.xml_bytes = std.math.add(usize, result.xml_bytes, bytes.len) catch return error.LimitExceeded;
        result.elements = std.math.add(usize, result.elements, tree.elements.len) catch return error.LimitExceeded;
        remaining_bytes -= bytes.len;
        remaining_elements -= tree.elements.len;
    }
    return result;
}
