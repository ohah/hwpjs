const Tree = @import("tree.zig").Tree;
const payload = @import("char_overlap.zig");
const rules = @import("control_rules.zig");
const refs = @import("../docinfo/reference_rules.zig");
pub const Report = struct { controls: usize = 0, text_units: usize = 0, shape_refs: usize = 0, inherited_refs: usize = 0, text_only: usize = 0, extra_bytes: usize = 0 };
pub fn inspect(tree: Tree, layout: payload.Layout, char_shapes: usize) !Report {
    var report: Report = .{};
    for (tree.nodes) |node| {
        if (node.record.value != .control_header) continue;
        const h = node.record.value.control_header;
        if (h.id != rules.id("tcps")) continue;
        const p = try payload.Properties.parse(h.properties, layout);
        report.controls += 1;
        report.text_units += p.text.len / 2;
        report.extra_bytes += p.extra.len;
        if (p.attributes) |attr| {
            for (0..attr.shapes.count()) |i| {
                switch (refs.resolve(.inherited_char_shape, attr.shapes.get(i).?.id, char_shapes)) {
                    .invalid => return error.InvalidResourceReference,
                    .absent => report.inherited_refs += 1,
                    .ordinal => report.shape_refs += 1,
                }
            }
        } else report.text_only += 1;
    }
    return report;
}
