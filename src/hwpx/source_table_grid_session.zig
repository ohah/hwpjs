//! Live SOURCE grid adapter. ZIPs are temporary validation artifacts only.
const std = @import("std");
const editor = @import("editor_session.zig");
const file = @import("source_table_grid_file.zig");
const fields = @import("table_xml_fields.zig");
pub const Command = file.Command;
pub const Request = struct { section: usize, node: usize, expected_rows: u32, expected_columns: u32, action: Command };

pub const Rectangle = file.Rectangle;
pub const MergeRequest = struct { section: usize, node: usize, expected_rows: u32, expected_columns: u32, rectangle: Rectangle };
const Operation = union(enum) { edit: Command, merge: Rectangle };
const Target = struct { section: usize, node: usize, expected_rows: u32, expected_columns: u32, operation: Operation };

pub fn merge(session: *editor.Session, request: MergeRequest) !bool {
    return applyOperation(session, .{ .section = request.section, .node = request.node, .expected_rows = request.expected_rows, .expected_columns = request.expected_columns, .operation = .{ .merge = request.rectangle } });
}

/// Match Session's direct managed-write guard; history owns its transaction.
pub fn apply(session: *editor.Session, request: Request) !bool {
    return applyOperation(session, .{ .section = request.section, .node = request.node, .expected_rows = request.expected_rows, .expected_columns = request.expected_columns, .operation = .{ .edit = request.action } });
}
fn applyOperation(session: *editor.Session, request: Target) !bool {
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
// Check the current source object before and after save materializes pending
// text/formatting. An ordinal alone cannot prove the same physical owner.
fn uniqueTableIdentity(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, node: usize) !u32 {
    const id = try fields.optionalUnsigned(a, tree, node, "id", 4096) orelse return error.UnsupportedSourceTableIdentity;
    var occurrences: usize = 0;
    for (tree.elements, 0..) |_, i| {
        if (!fields.childIs(tree, i, "tbl")) continue;
        if ((try fields.optionalUnsigned(a, tree, i, "id", 4096)) == id) occurrences += 1;
    }
    if (occurrences != 1) return error.UnsupportedSourceTableIdentity;
    return id;
}
fn body(session: *editor.Session, request: Target) !bool {
    if (request.section >= session.sections.len) return error.InvalidSectionIndex;
    const old = &session.sections[request.section];
    try old.validateSourceBasis();
    if (old.original_basis == null) return error.SourceBindingMismatch;
    if (old.created_tables.entries.items.len != 0) return error.UnsupportedSourceTablePendingIntent;
    for (session.cell_backgrounds.items) |entry| if (entry.section == request.section) return error.UnsupportedSourceTablePendingIntent;
    const limit = @min(4096, session.options.max_sites);
    switch (request.operation) {
        .edit => |command| _ = try @import("../model/table_grid_edit_plan.zig").create(request.expected_rows, request.expected_columns, command, limit),
        .merge => |rectangle| try rectangle.validate(request.expected_rows, request.expected_columns, limit),
    }
    const selection = try select(&old.tree, request.node);
    const a = session.allocator;
    const identity = if (request.operation == .merge) try uniqueTableIdentity(a, &old.tree, request.node) else null;
    const saved = try session.save();
    defer a.free(saved);
    var current = try editor.open(a, saved, session.options);
    defer current.deinit();
    if (current.sections.len != session.sections.len) return error.SourceBindingMismatch;
    const current_tree = &current.sections[request.section].tree;
    const node = try resolve(current_tree, selection);
    if (identity) |expected| {
        if (try uniqueTableIdentity(a, current_tree, node) != expected) return error.SourceBindingMismatch;
    }
    const options: file.Options = .{
        .max_input_bytes = session.options.max_output_bytes,
        .max_output_bytes = session.options.max_output_bytes,
        .max_xml_bytes = session.options.max_xml_bytes,
        .max_total_xml_bytes = session.options.max_xml_bytes,
        .max_sections = session.options.max_sections,
        .max_cells = limit,
    };
    const changed = switch (request.operation) {
        .edit => |command| try file.transform(a, saved, .{ .section = request.section, .target = .{ .element = node }, .expected_rows = request.expected_rows, .expected_columns = request.expected_columns, .command = command }, options),
        .merge => |rectangle| try file.transformMerge(a, saved, .{ .section = request.section, .target = .{ .element = node }, .expected_rows = request.expected_rows, .expected_columns = request.expected_columns, .rectangle = rectangle }, options),
    };
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
