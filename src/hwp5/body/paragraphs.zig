const body = @import("reader.zig");
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
            .page_definition, .page_border, .note_shape => {},
        }
        if (value != .header) continue;
        const h = value.header;
        if (rules.resolve(.zero_based, h.para_shape_id, resources.para_shapes) == .invalid or
            rules.resolve(.zero_based, h.style_id, resources.styles) == .invalid) return error.InvalidResourceReference;
        var m: body.Metadata = .{};
        var text: ?body.Text = null;
        var child = index + 1;
        while (child < node.subtree_end) {
            const entry = tree.nodes[child];
            switch (entry.record.value) {
                .text => |v| {
                    if (text != null) return error.DuplicateParagraphRecord;
                    text = v;
                },
                .char_runs => |v| {
                    if (m.runs != null) return error.DuplicateParagraphRecord;
                    m.runs = v;
                },
                .line_segments => |v| {
                    if (m.lines != null) return error.DuplicateParagraphRecord;
                    m.lines = v;
                },
                .range_tags => |v| {
                    if (m.ranges != null) return error.DuplicateParagraphRecord;
                    m.ranges = v;
                },
                else => {},
            }
            child = entry.subtree_end;
        }
        try m.validate(h, resources.char_shapes);
        if (text) |t| {
            try t.validateCount(h);
            report.texts += 1;
        } else report.missing_texts += 1;
        report.paragraphs += 1;
    }
    return report;
}
