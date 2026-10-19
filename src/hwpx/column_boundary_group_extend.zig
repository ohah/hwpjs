//! Extend the final continuation with the next source without changing earlier text.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const model = @import("paragraph_structure_values.zig");

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, original: *const model.Values, index: usize, limit: usize) !model.Values {
    const left = try @import("column_boundary_group.zig").locate(original, index);
    if (index == left.start or index + 1 != left.end or left.end >= original.paragraphs.len) return error.UnsupportedColumnBoundaryEdit;
    const right = try @import("column_boundary_group.zig").locate(original, left.end);
    if (right.end != right.start + 1) return error.UnsupportedColumnBoundaryEdit;
    const lengths = try a.alloc(u32, index - left.start);
    defer a.free(lengths);
    for (original.paragraphs[left.start..left.end], 0..) |*paragraph, ordinal| {
        if (paragraph.protected_positions != null) return error.UnsupportedColumnBoundaryEdit;
        if (ordinal < lengths.len) {
            lengths[ordinal] = try @import("paragraph_current_units.zig").read(a, tree, paragraph);
        }
    }
    var current = try original.clone(a);
    errdefer current.deinit(a);
    for (0..left.end - left.start - 1) |_| {
        const next = try @import("paragraph_structure_merge.zig").prepare(a, tree, &current, left.start, limit);
        current.deinit(a);
        current = next;
    }
    const old_pieces = current.paragraphs[left.start].pieces;
    const old_templates = try a.alloc(usize, if (old_pieces) |pieces| pieces.len else 1);
    defer a.free(old_templates);
    if (old_pieces) |pieces| {
        for (pieces, old_templates) |piece, *template| template.* = piece.template_element;
    } else old_templates[0] = current.paragraphs[left.start].template_element;
    const extended = try @import("column_boundary_source_merge.zig").prepare(a, tree, &current, left.start, limit);
    current.deinit(a);
    current = extended;
    for (lengths, 0..) |length, ordinal| {
        const id = original.paragraphs[left.start + ordinal + 1].generated_id orelse return error.SourceBindingMismatch;
        const next = try @import("paragraph_structure_split.zig").prepare(a, tree, &current, left.start + ordinal, length, length, id, limit);
        current.deinit(a);
        current = next;
        const paragraph = &current.paragraphs[left.start + ordinal];
        paragraph.paragraph_shape_id = original.paragraphs[left.start + ordinal].paragraph_shape_id;
        paragraph.break_before = original.paragraphs[left.start + ordinal].break_before;
        for (paragraph.pieces.?) |*piece| {
            var previous = false;
            for (old_templates) |template| if (template == piece.template_element) {
                previous = true;
                break;
            };
            piece.output = if (previous)
                try priorRole(&original.paragraphs[left.start + ordinal], piece.template_element)
            else
                .inventory_only;
        }
        try @import("column_boundary_extension_prefix.zig").restore(a, &original.paragraphs[left.start + ordinal], paragraph);
    }
    current.paragraphs[index].paragraph_shape_id = original.paragraphs[index].paragraph_shape_id;
    current.paragraphs[index].break_before = original.paragraphs[index].break_before;
    for (current.paragraphs[index].pieces.?) |*piece| {
        var previous = false;
        for (old_templates) |template| if (template == piece.template_element) {
            previous = true;
            break;
        };
        piece.output = if (previous) try priorRole(&original.paragraphs[index], piece.template_element) else .source_runs;
    }
    try @import("column_boundary_extension_prefix.zig").appendSource(a, tree, &original.paragraphs[index], &original.paragraphs[right.start], &current.paragraphs[index]);
    try @import("column_boundary_joined_group.zig").validate(a, tree, current.paragraphs[left.start .. index + 1]);
    _ = try current.byteSize(limit);
    return current;
}

fn priorRole(paragraph: *const model.Paragraph, template: usize) !@TypeOf(@as(@import("paragraph_joined_values.zig").Piece, undefined).output) {
    const Role = @TypeOf(@as(@import("paragraph_joined_values.zig").Piece, undefined).output);
    var role: ?Role = null;
    for (paragraph.pieces orelse return .current_runs) |piece| {
        if (piece.template_element != template) continue;
        if (role) |previous| {
            if (previous != piece.output) return error.UnsupportedColumnBoundaryEdit;
        }
        role = piece.output;
    }
    return role orelse error.SourceBindingMismatch;
}
