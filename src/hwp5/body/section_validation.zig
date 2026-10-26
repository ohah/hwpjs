const body = @import("reader.zig");
const Tree = @import("tree.zig").Tree;
const Version = @import("../version.zig").Version;
const rules = @import("../docinfo/reference_rules.zig");
pub const Report = struct { definitions: usize = 0, pages: usize = 0, borders: usize = 0, numbering_deferred: usize = 0, note_shapes: usize = 0, columns: usize = 0, memo_references: usize = 0, memo_references_deferred: usize = 0 };
pub fn definitionOwner(tree: Tree) !usize {
    var first: ?usize = null;
    var owner: ?usize = null;
    for (tree.nodes, 0..) |node, index| {
        if (node.record.value == .header and node.parent == null and first == null) first = index;
        if (node.record.value != .control_header or node.record.value.control_header.id != body.section_def.control_id) continue;
        if (owner != null) return error.DuplicateSectionDefinition;
        try validateDefinitionOwner(tree, index, first);
        owner = index;
    }
    return owner orelse error.MissingSectionDefinition;
}
pub fn validateDefinitionOwner(tree: Tree, index: usize, first_paragraph: ?usize) !void {
    const parent = tree.nodes[index].parent orelse return error.OrphanSectionDefinition;
    if (tree.nodes[parent].record.value != .header or tree.nodes[parent].parent != null) return error.OrphanSectionDefinition;
    if (parent != first_paragraph) return error.MisplacedSectionDefinition;
}
pub fn columnOwner(tree: Tree, index: usize) !usize {
    const parent = tree.nodes[index].parent orelse return error.OrphanColumnDefinition;
    if (tree.nodes[parent].record.value != .header) return error.OrphanColumnDefinition;
    return parent;
}
pub fn inspect(tree: Tree, version: Version, numbering_count: usize, border_count: usize) !Report {
    return inspectWithMemoShapes(tree, version, numbering_count, border_count, null);
}
/// A null count is uninspected, not an empty resource table.
pub fn inspectWithMemoShapes(tree: Tree, version: Version, numbering_count: usize, border_count: usize, memo_shape_count: ?usize) !Report {
    var report: Report = .{};
    var section: ?usize = null;
    var first_paragraph: ?usize = null;
    for (tree.nodes, 0..) |node, index| {
        const v = node.record.value;
        if (v == .header and node.parent == null and first_paragraph == null) first_paragraph = index;
        if (v == .control_header and v.control_header.id == body.column_def.control_id) {
            _ = try columnOwner(tree, index);
            _ = try body.column_def.Definition.parse(v.control_header.properties);
            report.columns += 1;
        }
        if (v != .control_header or v.control_header.id != body.section_def.control_id) continue;
        if (section != null) return error.DuplicateSectionDefinition;
        try validateDefinitionOwner(tree, index, first_paragraph);
        const d = try body.section_def.Definition.parse(v.control_header.properties, version);
        if (d.numbering_id == 0) {
            report.numbering_deferred += 1;
        } else if (rules.resolve(.one_based, d.numbering_id, numbering_count) == .invalid) return error.InvalidResourceReference;
        if (d.observed_extension) |extension| if (extension.memo_shape_id_ref != 0) {
            report.memo_references += 1;
            if (memo_shape_count) |count| {
                if (rules.resolve(.optional_one_based, extension.memo_shape_id_ref, count) == .invalid) return error.InvalidResourceReference;
            } else report.memo_references_deferred += 1;
        };
        section = index;
        report.definitions += 1;
    }
    const owner = section orelse return error.MissingSectionDefinition;
    for (tree.nodes) |node| switch (node.record.value) {
        .page_definition => {
            if (node.parent != owner) return error.OrphanSectionRecord;
            report.pages += 1;
            if (report.pages > 1) return error.DuplicatePageDefinition;
        },
        .page_border => |d| {
            if (node.parent != owner) return error.OrphanSectionRecord;
            if (rules.resolve(.optional_one_based, d.border_fill_id, border_count) == .invalid) return error.InvalidResourceReference;
            report.borders += 1;
        },
        .note_shape => {
            if (node.parent != owner) return error.OrphanSectionRecord;
            report.note_shapes += 1;
            if (report.note_shapes > 2) return error.ExcessNoteShapes;
        },
        else => {},
    };
    if (report.pages == 0) return error.MissingPageDefinition;
    return report;
}
