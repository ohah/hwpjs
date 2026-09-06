const Tree = @import("tree.zig").Tree;
const rules = @import("../docinfo/reference_rules.zig");
pub const Resources = struct { char_shapes: usize, para_shapes: usize, styles: usize };
pub const Report = struct {
    paragraphs: usize = 0,
    texts: usize = 0,
    missing_texts: usize = 0,
    controls_pending: usize = 0,
    lists_pending: usize = 0,
    unknown_records: usize = 0,
};
/// Validates paragraph-local ownership and references, not whole-document validity.
/// Lists group siblings under controls; never turn LIST_HEADER into a fake parent.
pub fn inspect(tree: Tree, resources: Resources) !Report {
    var report: Report = .{};
    for (tree.nodes, 0..) |node, index| {
        const value = node.record.value;
        switch (value) {
            .text, .char_runs, .line_segments, .range_tags => {
                const parent = node.parent orelse return error.OrphanParagraphRecord;
                if (tree.nodes[parent].record.value != .header) return error.OrphanParagraphRecord;
            },
            .control_header => report.controls_pending += 1,
            .list_header => report.lists_pending += 1,
            .unknown => report.unknown_records += 1,
            .header => {},
            .page_definition, .page_border, .note_shape, .table => {},
        }
        if (value != .header) continue;
        const h = value.header;
        if (rules.resolve(.zero_based, h.para_shape_id, resources.para_shapes) == .invalid or
            rules.resolve(.zero_based, h.style_id, resources.styles) == .invalid) return error.InvalidResourceReference;
        const contents = try @import("paragraph_children.zig").collect(tree, index);
        try contents.metadata.validate(h, resources.char_shapes);
        if (contents.text_node) |text_node| {
            const t = tree.nodes[text_node].record.value.text;
            try t.validateCount(h);
            report.texts += 1;
        } else report.missing_texts += 1;
        report.paragraphs += 1;
    }
    return report;
}
