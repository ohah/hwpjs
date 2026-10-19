//! Assign logical identities and source coverage to a joined text split.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");

pub fn prepare(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const model.Values, index: usize, at: u32, end: u32, id: u32, limit: usize) !model.Values {
    const selected = &current.paragraphs[index];
    const joined = selected.joined() orelse return error.SourceBindingMismatch;
    var draft = try @import("paragraph_joined_split.zig").prepare(a, tree, &joined, at, end, limit);
    defer draft.deinit(a);
    return assemble(a, current, index, id, limit, &draft, null, null);
}

pub fn assemble(a: std.mem.Allocator, current: *const model.Values, index: usize, id: u32, limit: usize, draft: *@import("paragraph_joined_split.zig").Draft, left_positions: ?[]const model.ProtectedPosition, right_positions: ?[]const model.ProtectedPosition) !model.Values {
    const selected = &current.paragraphs[index];
    for (draft.right.pieces) |*piece| {
        piece.owns_source = false;
        piece.generated_id = id;
        piece.source_ordinal = null;
    }
    const count = std.math.add(usize, current.paragraphs.len, 1) catch return error.LimitExceeded;
    const paragraphs = try a.alloc(model.Paragraph, count);
    var initialized: usize = 0;
    errdefer {
        for (paragraphs[0..initialized]) |*paragraph| paragraph.deinit(a);
        a.free(paragraphs);
    }
    for (current.paragraphs, 0..) |*paragraph, ordinal| {
        if (ordinal == index) {
            const left = try draft.left.clone(a);
            paragraphs[initialized] = .{ .template_element = selected.template_element, .source_ordinal = selected.source_ordinal, .generated_id = selected.generated_id, .break_before = selected.break_before, .paragraph_shape_id = selected.paragraph_shape_id, .sites = left.sites, .pieces = left.pieces, .character_styles = left.character_styles };
            initialized += 1;
            if (left_positions) |items| paragraphs[initialized - 1].protected_positions = try a.dupe(model.ProtectedPosition, items);
            const right = try draft.right.clone(a);
            paragraphs[initialized] = .{ .template_element = selected.template_element, .source_ordinal = null, .generated_id = id, .paragraph_shape_id = selected.paragraph_shape_id, .sites = right.sites, .pieces = right.pieces, .character_styles = right.character_styles };
            initialized += 1;
            if (right_positions) |items| paragraphs[initialized - 1].protected_positions = try a.dupe(model.ProtectedPosition, items);
        } else {
            paragraphs[initialized] = try paragraph.clone(a);
            initialized += 1;
        }
    }
    const output: model.Values = .{ .paragraphs = paragraphs };
    _ = try output.byteSize(limit);
    return output;
}
