const std = @import("std");
const Tree = @import("tree.zig").Tree;
const Links = @import("control_links.zig").Links;
pub const Options = @import("form_control.zig").Options;
pub const Report = struct {
    controls: usize = 0,
    objects: usize = 0,
    unselected_controls: usize = 0,
    unselected_objects: usize = 0,
    inspected_forms: usize = 0,
    unknown_types: usize = 0,
    property_bytes: usize = 0,
    property_nodes: usize = 0,
    known_property_nodes: usize = 0,
    deferred_property_nodes: usize = 0,
    char_shape_valid: usize = 0,
    char_shape_invalid: usize = 0,
    char_shape_absent: usize = 0,
    char_shape_deferred: usize = 0,
};
/// Same Tree and Links.build result. Null selection counts raw presence only.
/// Returns scalars, never slices into the temporary form/property arrays.
pub fn inspect(a: std.mem.Allocator, tree: Tree, links: Links, selection: ?Options, char_shapes: usize) !Report {
    var report: Report = .{};
    for (tree.nodes) |node| {
        if (node.record.framing.tag == @import("form_object.zig").tag) report.objects += 1;
        if (node.record.value == .control_header and node.record.value.control_header.id == @import("control_rules.zig").form_id) report.controls += 1;
    }
    const options = selection orelse {
        report.unselected_controls = report.controls;
        report.unselected_objects = report.objects;
        return report;
    };
    var assembled = try @import("form_links.zig").collectWithLinksObservedUnits(a, tree, options, links);
    defer assembled.deinit(a);
    report.inspected_forms = assembled.forms.forms.len;
    report.property_bytes = assembled.forms.total_property_bytes;
    report.property_nodes = assembled.forms.total_property_nodes;
    for (assembled.forms.forms) |form| {
        const kind = form.envelope.kind();
        const schema = try @import("form_schema.zig").inspectObserved(form.properties, kind);
        report.known_property_nodes += schema.known_nodes;
        report.deferred_property_nodes += schema.deferred_nodes;
        if (kind == .unknown) {
            report.unknown_types += 1;
            report.char_shape_deferred += 1;
            continue;
        }
        switch (try @import("form_references.zig").storedCharShapeObserved(form.properties, schema, char_shapes)) {
            .ordinal => report.char_shape_valid += 1,
            .invalid => report.char_shape_invalid += 1,
            .absent => report.char_shape_absent += 1,
        }
    }
    return report;
}
