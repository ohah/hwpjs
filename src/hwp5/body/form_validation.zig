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
    explicit_char_shape_valid: usize = 0,
    explicit_char_shape_invalid: usize = 0,
    explicit_char_shape_absent: usize = 0,
    surrounding_char_shape: usize = 0,
    undetermined_char_shape: usize = 0,
    choice_checked: usize = 0,
    choice_unchecked: usize = 0,
    choice_indeterminate: usize = 0,
    choice_invalid: usize = 0,
    choice_deferred: usize = 0,
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
        const stored: @import("form_references.zig").Resolution = if (kind == .unknown) unknown: {
            report.unknown_types += 1;
            report.char_shape_deferred += 1;
            break :unknown .absent;
        } else known: {
            const reference = try @import("form_references.zig").storedCharShapeObserved(form.properties, schema, char_shapes);
            switch (reference) {
                .ordinal => report.char_shape_valid += 1,
                .invalid => report.char_shape_invalid += 1,
                .absent => report.char_shape_absent += 1,
            }
            break :known reference;
        };
        const semantics = @import("form_semantics.zig").inspectObserved(form.properties, schema, kind, stored);
        switch (semantics.char_source) {
            .undetermined => report.undetermined_char_shape += 1,
            .surrounding => report.surrounding_char_shape += 1,
            .explicit => switch (semantics.active_reference) {
                .valid => report.explicit_char_shape_valid += 1,
                .invalid => report.explicit_char_shape_invalid += 1,
                .absent => report.explicit_char_shape_absent += 1,
                .deferred => unreachable,
            },
        }
        switch (semantics.choice) {
            .checked => report.choice_checked += 1,
            .unchecked => report.choice_unchecked += 1,
            .indeterminate => report.choice_indeterminate += 1,
            .invalid => report.choice_invalid += 1,
            .deferred => report.choice_deferred += 1,
            .not_applicable => {},
        }
    }
    return report;
}
