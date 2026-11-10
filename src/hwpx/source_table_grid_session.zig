//! Live SOURCE grid adapter. ZIPs are temporary validation artifacts only.
const std = @import("std");
const editor = @import("editor_session.zig");
const file = @import("source_table_grid_file.zig");
const fields = @import("table_xml_fields.zig");
pub const Command = file.Command;
pub const Request = struct { section: usize, node: usize, expected_rows: u32, expected_columns: u32, action: Command };

/// Match Session's direct managed-write guard; history owns its transaction.
pub fn apply(session: *editor.Session, request: Request) !bool {
    if (!session.history_delta_managed or session.history_transaction_active) return body(session, request);
    if (session.mutation_serial == std.math.maxInt(u64)) return error.HistoryRevisionExhausted;
    try @import("suffix_text_delta.zig").normalize(session);
    session.history_transaction_active = true;
    defer session.history_transaction_active = false;
    const changed = try body(session, request);
    if (changed) session.mutation_serial += 1;
    return changed;
}
const Selection = struct { ordinal: usize, count: usize };
fn select(tree: *const @import("xml_part_tree.zig").Tree, node: usize) !Selection {
    var selected: ?usize = null;
    var count: usize = 0;
    for (tree.elements, 0..) |_, i| {
        if (!fields.childIs(tree, i, "tbl")) continue;
        if (i == node) selected = count;
        count += 1;
    }
    return .{ .ordinal = selected orelse return error.InvalidSourceTableTarget, .count = count };
}
fn resolve(tree: *const @import("xml_part_tree.zig").Tree, selection: Selection) !usize {
    var count: usize = 0;
    var node: ?usize = null;
    for (tree.elements, 0..) |_, i| {
        if (!fields.childIs(tree, i, "tbl")) continue;
        if (count == selection.ordinal) node = i;
        count += 1;
    }
    if (count != selection.count) return error.SourceBindingMismatch;
    return node orelse error.InvalidSourceTableTarget;
}
fn body(session: *editor.Session, request: Request) !bool {
    if (request.section >= session.sections.len) return error.InvalidSectionIndex;
    const old = &session.sections[request.section];
    try old.validateSourceBasis();
    if (old.original_basis == null) return error.SourceBindingMismatch;
    if (old.created_tables.entries.items.len != 0) return error.UnsupportedSourceTablePendingIntent;
    for (session.cell_backgrounds.items) |entry| if (entry.section == request.section) return error.UnsupportedSourceTablePendingIntent;
    _ = try @import("../model/table_grid_edit_plan.zig").create(request.expected_rows, request.expected_columns, request.action, @min(4096, session.options.max_sites));
    const selection = try select(&old.tree, request.node);
    const a = session.allocator;
    const saved = try session.save();
    defer a.free(saved);
    var current = try editor.open(a, saved, session.options);
    defer current.deinit();
    if (current.sections.len != session.sections.len) return error.SourceBindingMismatch;
    const node = try resolve(&current.sections[request.section].tree, selection);
    const changed = try file.transform(a, saved, .{ .section = request.section, .target = .{ .element = node }, .expected_rows = request.expected_rows, .expected_columns = request.expected_columns, .command = request.action }, .{
        .max_input_bytes = session.options.max_output_bytes,
        .max_output_bytes = session.options.max_output_bytes,
        .max_xml_bytes = session.options.max_xml_bytes,
        .max_total_xml_bytes = session.options.max_xml_bytes,
        .max_sections = session.options.max_sections,
        .max_cells = @min(4096, session.options.max_sites),
    });
    defer a.free(changed);
    var candidate = try editor.open(a, changed, session.options);
    defer candidate.deinit();
    if (candidate.sections.len != session.sections.len) return error.SourceBindingMismatch;
    // Reparse owns all XML bytes, names, locations and text independently of
    // either temporary Session, using the LIVE global ordinal and item owner.
    const rebased = try @import("section_source_basis.zig").prepare(a, candidate.sections[request.section].tree.source, request.section, old.tree.item_index, old.first_paragraph, session.options);
    var staged: editor.Section = .{
        .original_basis = old.original_basis,
        .owned_rebased_basis = rebased.basis,
        .tree = rebased.basis.tree,
        .sites = rebased.sites,
        .locations = rebased.basis.locations,
        .entry_index = old.entry_index,
        .first_paragraph = old.first_paragraph,
        .source_first_paragraph = old.first_paragraph,
        .last_paragraph = rebased.basis.last_paragraph,
    };
    var installed = false;
    defer if (!installed) staged.deinitCurrent(a);
    try session.installSectionSourceBasis(request.section, &staged);
    installed = true;
    return true;
}
