//! Prove source owners and repeated non-owning bindings without folding text.
const Tree = @import("xml_part_tree.zig").Tree;
const Joined = @import("paragraph_joined_values.zig").Joined;

pub fn validate(tree: *const Tree, joined: *const Joined) !void {
    try joined.validate();
    if (!joined.pieces[0].owns_source) return error.SourceBindingMismatch;
    var previous_owner: ?usize = null;
    for (joined.pieces, 0..) |piece, index| {
        if (piece.template_element >= tree.elements.len) return error.SourceBindingMismatch;
        if (piece.owns_source) {
            if (piece.generated_id != null or piece.source_ordinal == null) return error.SourceBindingMismatch;
            if (previous_owner) |previous| {
                if (tree.elements[previous].parent != tree.elements[piece.template_element].parent or tree.elements[previous].next_sibling != piece.template_element) return error.InvalidParagraphAdjacency;
            }
            previous_owner = piece.template_element;
            continue;
        }
        if (piece.generated_id == null or piece.generated_id.? == 0 or piece.source_ordinal != null) return error.SourceBindingMismatch;
        const current = try joined.paragraph(index);
        var proven = false;
        for (joined.pieces[0..index], 0..) |original, ordinal| {
            if (!original.owns_source or original.template_element != piece.template_element or original.site_count != piece.site_count) continue;
            const source = try joined.paragraph(ordinal);
            if (sameBindings(&source, &current)) proven = true;
        }
        if (!proven) return error.SourceBindingMismatch;
    }
}

pub fn validateContinuation(original: *const Joined, continuation: *const Joined, id: u32) !void {
    try continuation.validate();
    if (id == 0) return error.SourceBindingMismatch;
    for (continuation.pieces, 0..) |piece, index| {
        if (piece.owns_source or piece.source_ordinal != null or piece.generated_id != id) return error.SourceBindingMismatch;
        const current = try continuation.paragraph(index);
        var proven = false;
        for (original.pieces, 0..) |source, ordinal| {
            if (!source.owns_source or source.template_element != piece.template_element or source.site_count != piece.site_count) continue;
            const owner = try original.paragraph(ordinal);
            if (sameBindings(&owner, &current)) proven = true;
        }
        if (!proven) return error.SourceBindingMismatch;
    }
}

fn sameBindings(left: *const @import("paragraph_structure_values.zig").Paragraph, right: *const @import("paragraph_structure_values.zig").Paragraph) bool {
    if (left.sites.items.len != right.sites.items.len) return false;
    for (left.sites.items, right.sites.items) |one, two| {
        if (one.element_index != two.element_index or one.start != two.start or one.end != two.end or one.empty_element != two.empty_element or one.missing_text != two.missing_text or one.anchor_boundary != two.anchor_boundary) return false;
    }
    return true;
}
