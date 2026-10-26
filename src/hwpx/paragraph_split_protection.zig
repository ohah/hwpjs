//! Prepare the new paragraph's style intent; caller commits it with topology.
const std = @import("std");
const Resources = @import("paragraph_resource_values.zig").Values;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
pub fn prepare(session: *const @import("editor_session.zig").Session, section: usize, paragraph: usize, right: *Paragraph) !?Resources {
    for (right.sites.items) |site| if (site.text.len != 0) return null;
    if (right.protected_positions) |positions| if (positions.len != 0) return null;
    const a = session.allocator;
    const current = session.paragraphShapeId(section, paragraph) catch |err| switch (err) {
        error.MissingParagraphShapeReference => return null,
        else => return err,
    };
    const shapes = try session.paragraphShapes();
    defer @import("paragraph_display_resources.zig").deinit(a, shapes);
    for (shapes) |shape| if (shape.id == current) {
        if (shape.break_settings == null or shape.break_settings.?.keep_lines != true) return null;
        var alignment: ?@import("paragraph_resource_clone.zig").Alignment = null;
        var source_id = current;
        var margins: @import("paragraph_margin_patch.zig").Patch = .{};
        var spacing: ?@import("paragraph_spacing_patch.zig").Spacing = null;
        for (session.paragraph_resources.entries.items) |entry| if (entry.id == current) {
            source_id = entry.source_id;
            alignment = entry.alignment;
            margins = entry.margins;
            spacing = entry.spacing;
            break;
        };
        var original = session.*;
        original.paragraph_resources = .{};
        const ids = try original.paragraphShapeIds();
        defer a.free(ids);
        var pending = try session.paragraph_resources.clone(a);
        errdefer pending.deinit(a);
        right.paragraph_shape_id = try pending.addWithBreakProperties(a, ids, source_id, alignment, margins, spacing, false);
        return pending;
    };
    return error.InvalidParagraphShapeReference;
}
