//! Original-cell property edit through the existing managed parked-document transaction.
//! The candidate serializer preserves all prior current styles/intents; it never installs live state.
const std = @import("std");
const editor = @import("editor_session.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const source = @import("original_cell_insets_plan.zig");
const epoch = @import("../model/history_mutation_epoch.zig");
const alignment = @import("../model/original_cell_insets.zig");
pub const Request = struct { section: usize, paragraph: usize, revision: u32, before: source.Observation, value: alignment.Patch };
fn paragraph(tree: *const Tree, list: usize) !usize {
    if (list >= tree.elements.len or !fields.childIs(tree, list, "subList")) return error.InvalidCellDisplayOwner;
    var child = tree.elements[list].first_child;
    while (child) |node| : (child = tree.elements[node].next_sibling) {
        if (fields.childIs(tree, node, "p")) return node;
    }
    return error.InvalidCellDisplayOwner;
}
pub fn observe(a: std.mem.Allocator, session: *const editor.Session, section: usize, selected_paragraph: usize, ticket: epoch.Ticket) !source.Observation {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    for (session.sections) |current| if (current.created_tables.entries.items.len != 0) return error.UnsupportedInsertPendingTable;
    const bindings = try @import("table_display_bindings.zig").read(a, session, section);
    defer a.free(bindings);
    var selected: ?@import("table_display_owner.zig").Owner = null;
    for (bindings) |binding| if (binding.paragraph == selected_paragraph) {
        if (selected != null) return error.InvalidCellDisplayOwner;
        selected = binding.owner;
    };
    const owner = selected orelse return error.InvalidCellDisplayOwner;
    // A cell property affects every paragraph in that cell, not merely the cursor range.
    for (bindings) |binding| {
        if (binding.owner.table_node != owner.table_node or binding.owner.list_node != owner.list_node) continue;
        const positions = try @import("field_source_outside_positions.zig").prepareAction(session, section, binding.paragraph, 0, 0, .whole_anchored);
        if (positions) |owned| session.allocator.free(owned);
    }
    const tree = &session.sections[section].tree;
    const template = try paragraph(tree, owner.list_node);
    var result = try source.observe(a, tree, template, ticket, false);
    if (result.table_node != owner.table_node or result.list_node != owner.list_node or result.cell_node != owner.cell_node) {
        var owned = result;
        owned.deinit(a);
        return error.InvalidCellDisplayOwner;
    }
    result.frame = .{ .width = owner.cell.width orelse return error.UnknownCellInsets, .height = owner.cell.height orelse return error.UnknownCellInsets };
    return result;
}
pub fn validate(a: std.mem.Allocator, session: *const editor.Session, request: Request, ticket: epoch.Ticket, revision: u32) !bool {
    if (request.section != request.before.section or request.revision != revision) return error.StaleOriginalCellInsets;
    var current = try observe(a, session, request.section, request.paragraph, ticket);
    defer current.deinit(a);
    if (!source.matches(current, request.before)) return error.StaleOriginalCellInsets;
    if (current.read_only) return error.OriginalCellInsetsReadOnly;
    return (try alignment.prepare(current.source, current.frame, request.value)).changed;
}
fn identity(tree: *const Tree, node: usize) bool {
    if (!fields.childIs(tree, node, "subList")) return false;
    const parent = tree.elements[node].parent orelse return false;
    return fields.childIs(tree, parent, "tc");
}
fn sameCell(left: @import("table_display_owner.zig").Owner, right: @import("table_display_owner.zig").Owner) bool {
    return left.rows == right.rows and left.columns == right.columns and left.cell.row == right.cell.row and left.cell.column == right.cell.column and left.cell.row_span == right.cell.row_span and left.cell.column_span == right.cell.column_span;
}
pub fn prepare(a: std.mem.Allocator, live: *const editor.Session, before: []const u8, request: Request, ticket: epoch.Ticket, revision: u32) !?editor.Session {
    if (!try validate(a, live, request, ticket, revision)) return null;
    var saved = try editor.open(a, before, live.options);
    defer saved.deinit();
    if (request.section >= saved.sections.len) return error.InvalidSectionIndex;
    const original = &live.sections[request.section].tree;
    const tree = &saved.sections[request.section].tree;
    // Sizes, text, fills and border references may already be materialized. Only
    // cell subList lexical identity and its nesting define the unchanged owner map.
    var mapping = try @import("xml_identity_binding.zig").bind(a, original, tree, identity);
    defer mapping.deinit(a);
    const list = mapping.get(request.before.list_node) orelse return error.SourceBindingMismatch;
    const template = try paragraph(tree, list);
    const old_owner = (try @import("table_display_owner.zig").resolve(a, original, request.before.paragraph_template)) orelse return error.InvalidCellDisplayOwner;
    const new_owner = (try @import("table_display_owner.zig").resolve(a, tree, template)) orelse return error.InvalidCellDisplayOwner;
    if (new_owner.list_node != list or !sameCell(old_owner, new_owner)) return error.SourceBindingMismatch;
    var observed = try source.observe(a, tree, template, ticket, false);
    defer observed.deinit(a);
    if (!std.meta.eql(observed.source, request.before.source) or !std.meta.eql(observed.frame, request.before.frame) or observed.read_only) return error.StaleOriginalCellInsets;
    const edited = (try source.write(a, tree, .{ .before = observed, .value = request.value }, ticket, false, live.options.max_xml_bytes)) orelse return null;
    defer a.free(edited);
    const cleared = try @import("cell_vertical_alignment_cache.zig").remove(a, edited, request.section, tree.item_index, list, live.options.max_xml_bytes);
    defer a.free(cleared);
    const package = try @import("../zip/replace_writer.zig").write(a, before, &.{.{ .entry_index = saved.sections[request.section].entry_index, .bytes = cleared }}, .{ .max_output_bytes = live.options.max_output_bytes });
    defer a.free(package);
    return try editor.open(a, package, live.options);
}
