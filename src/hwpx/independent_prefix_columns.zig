//! Admit the fixed section prefix used by an authored single-column body.
//! The existing column writer remains responsible for preserving source XML.
const std = @import("std");
const editor = @import("editor_session.zig");
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const xml = @import("document_xml.zig");

pub const Source = struct {
    column: ?usize = null,
    section_properties: ?usize = null,
    multiple: bool = false,

    pub fn observe(self: *Source, element: @import("xml_part_tree.zig").Element, index: usize) void {
        const slot = if (element.is(xml.paragraph_uri, "colPr"))
            &self.column
        else if (element.is(xml.paragraph_uri, "secPr"))
            &self.section_properties
        else
            return;
        if (slot.* == null) slot.* = index else self.multiple = true;
    }
};

const Budget = struct {
    pub fn copy(_: Budget, a: std.mem.Allocator, bytes: []const u8) ![]const u8 {
        return a.dupe(u8, bytes);
    }
};

pub fn validate(a: std.mem.Allocator, section: *const editor.Section, paragraph: *const Paragraph, ordinal: usize, source: Source) !void {
    const tree = &section.tree;
    const col = source.column orelse return error.UnsupportedIndependentColumnMetadata;
    const sec_pr = source.section_properties orelse return error.UnsupportedIndependentColumnMetadata;
    const owner = paragraph.template_element;
    if (source.multiple or paragraph.column_structure_changed or paragraph.generated_id != null or paragraph.pieces != null or
        paragraph.source_ordinal != (section.source_first_paragraph orelse section.first_paragraph) or ordinal != section.first_paragraph or
        paragraph.protected_positions != null or tree.elements[owner].parent != 0 or tree.elements[0].first_child != owner)
        return error.UnsupportedIndependentColumnMetadata;
    const ctrl = @import("column_boundary_xml.zig").control(tree, col) catch return error.UnsupportedIndependentColumnMetadata;
    const run = tree.elements[ctrl].parent.?;
    if (tree.elements[run].parent != owner or tree.elements[owner].first_child != run or
        tree.elements[run].first_child != sec_pr or tree.elements[sec_pr].next_sibling != ctrl or
        tree.elements[col].end != tree.elements[col].start_tag.end)
        return error.UnsupportedIndependentColumnMetadata;
    const retained = @import("retained_run_metadata.zig");
    if (!retained.runChildSupported(tree, sec_pr) or !retained.supported(tree, ctrl))
        return error.UnsupportedIndependentColumnMetadata;
    // Inline-control serializers do not own secPr in their run. A later run
    // can still use the existing protected tab/anchor path independently.
    var child = tree.elements[ctrl].next_sibling;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        const node = tree.elements[index];
        if (!node.is(xml.paragraph_uri, "t") or node.first_child != null)
            return error.UnsupportedIndependentColumnMetadata;
    }
    for (paragraph.sites.items) |site| {
        if (site.start < tree.elements[ctrl].end) return error.UnsupportedIndependentColumnMetadata;
    }
    if (paragraph.column_boundaries) |rows| {
        if (rows.len != 1 or rows[0].source_element != col or rows[0].unit != 0 or rows[0].affinity != .left)
            return error.UnsupportedIndependentColumnMetadata;
    }

    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const fields = @import("column_fields.zig").readColumn(a, arena.allocator(), tree, col, 4096, Budget{}) catch |err| switch (err) {
        error.OutOfMemory, error.LimitExceeded => return err,
        else => return error.UnsupportedIndependentColumnMetadata,
    };
    const id = fields.get(.id) orelse return error.UnsupportedIndependentColumnMetadata;
    _ = @import("xml_values.zig").unsigned32(id) catch return error.UnsupportedIndependentColumnMetadata;
    if (fields.col_count != 1 or fields.same_sz != true or fields.same_gap != 0 or fields.other_attributes != 0 or
        !std.mem.eql(u8, fields.get(.type) orelse "", "NEWSPAPER") or !std.mem.eql(u8, fields.get(.layout) orelse "", "LEFT"))
        return error.UnsupportedIndependentColumnMetadata;
}
