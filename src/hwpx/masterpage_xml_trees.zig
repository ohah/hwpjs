const std = @import("std");
const zip = @import("../zip/archive.zig");
const part_tree = @import("xml_part_tree.zig");
const parts = @import("masterpage_parts.zig");

pub const Options = struct {
    max_parts: usize = 4096,
    max_part_xml_bytes: usize = 32 * 1024 * 1024,
    max_total_xml_bytes: usize = 128 * 1024 * 1024,
    max_total_elements: usize = 4_000_000,
    tree: part_tree.Options = .{},
};

pub const Report = struct {
    trees: []part_tree.Tree,

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        for (self.trees) |*tree| tree.deinit(a);
        a.free(self.trees);
        self.* = undefined;
    }
};

/// One owner for decoding and indexing selected master-page XML. Consumers
/// supply independent semantic budgets but reuse this exact part boundary.
pub fn read(a: std.mem.Allocator, archive: zip.Archive, selected: []const parts.Part, options: Options) !Report {
    if (selected.len > options.max_parts) return error.LimitExceeded;
    const trees = try a.alloc(part_tree.Tree, selected.len);
    errdefer a.free(trees);
    var built: usize = 0;
    errdefer for (trees[0..built]) |*tree| tree.deinit(a);
    var remaining_bytes = options.max_total_xml_bytes;
    var remaining_elements = options.max_total_elements;
    for (selected, 0..) |part, ordinal| {
        if (part.entry_index >= archive.entries.len) return error.InvalidManifestEntryIndex;
        if (!std.mem.eql(u8, archive.entries[part.entry_index].name, part.href)) return error.InvalidManifestEntryIndex;
        const max_bytes = @min(@min(options.max_part_xml_bytes, options.tree.max_xml_bytes), remaining_bytes);
        const bytes = try archive.decode(archive.entries[part.entry_index], max_bytes);
        defer archive.allocator.free(bytes);
        var tree = try part_tree.parse(a, bytes, .master_page, ordinal, part.item_index, .{
            .max_xml_bytes = max_bytes,
            .max_nodes = @min(options.tree.max_nodes, remaining_elements),
            .xml = options.tree.xml,
        });
        errdefer tree.deinit(a);
        const direct_elements = std.math.add(usize, part.sub_lists.len, part.other_direct_elements) catch return error.LimitExceeded;
        const child_elements = std.math.add(usize, direct_elements, part.descendant_elements) catch return error.LimitExceeded;
        const expected_elements = std.math.add(usize, 1, child_elements) catch return error.LimitExceeded;
        if (tree.elements.len != expected_elements) return error.InconsistentMasterPageSelection;
        trees[built] = tree;
        built += 1;
        remaining_bytes -= bytes.len;
        remaining_elements -= tree.elements.len;
    }
    return .{ .trees = trees };
}
