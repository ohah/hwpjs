const body = @import("reader.zig");
const Tree = @import("tree.zig").Tree;
const Version = @import("../version.zig").Version;
const rules = @import("../docinfo/reference_rules.zig");
pub const Report = struct { definitions: usize = 0, pages: usize = 0, borders: usize = 0, numbering_deferred: usize = 0, notes_pending: usize = 0 };
pub fn inspect(tree: Tree, version: Version, numbering_count: usize, border_count: usize) !Report {
    var report: Report = .{};
    var section: ?usize = null;
    for (tree.nodes, 0..) |node, index| {
        const v = node.record.value;
        if (v != .control_header or v.control_header.id != body.section_def.control_id) continue;
        if (section != null) return error.DuplicateSectionDefinition;
        const parent = node.parent orelse return error.OrphanSectionDefinition;
        if (tree.nodes[parent].record.value != .header or tree.nodes[parent].parent != null) return error.OrphanSectionDefinition;
        const d = try body.section_def.Definition.parse(v.control_header.properties, version);
        if (d.numbering_id == 0) {
            report.numbering_deferred += 1;
        } else if (rules.resolve(.one_based, d.numbering_id, numbering_count) == .invalid) return error.InvalidResourceReference;
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
        else => {
            if (node.record.framing.tag == 74) {
                if (node.parent != owner) return error.OrphanSectionRecord;
                report.notes_pending += 1;
            }
        },
    };
    if (report.pages == 0) return error.MissingPageDefinition;
    return report;
}
