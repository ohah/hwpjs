//! Physical insertion admission. Display owner strings grant no permission.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const names = @import("document_xml.zig");

pub fn validate(a: std.mem.Allocator, tree: *const Tree, paragraph: usize) !void {
    const parent = tree.elements[paragraph].parent orelse return error.UnsupportedInlineObjectOwner;
    if (tree.elements[parent].parent == null and tree.elements[parent].is(names.section_uri, "sec")) return;
    // Require the complete physical cell path, including ancestors of nested
    // tables. A matching descendant name below an opaque wrapper is insufficient.
    @import("source_table_grid_owner_path.zig").admitCacheParagraph(tree, paragraph) catch return error.UnsupportedInlineObjectOwner;
    if ((try @import("table_display_owner.zig").resolve(a, tree, paragraph)) == null) return error.UnsupportedInlineObjectOwner;
    var node: ?usize = parent;
    while (node) |index| : (node = tree.elements[index].parent) {
        const field: ?[]const u8 = if (tree.elements[index].is(names.paragraph_uri, "tc")) "protect" else if (tree.elements[index].is(names.paragraph_uri, "tbl")) "lock" else null;
        if (field) |key| if (try tree.attributeValue(a, index, "", key)) |value| {
            const text = try value.toUtf8(a, 4096);
            defer a.free(text);
            if (try @import("xml_values.zig").boolean(text)) return error.ProtectedInlineObjectOwner;
        };
    }
}
