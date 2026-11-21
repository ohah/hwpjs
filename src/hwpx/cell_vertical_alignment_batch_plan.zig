//! Immutable original-cell batch -> one parked-document candidate. No live writes.
const std = @import("std");
const editor = @import("editor_session.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const block = @import("../model/original_cell_block.zig");
const single = @import("cell_vertical_alignment_plan.zig");
const epoch = @import("../model/history_mutation_epoch.zig");
const alignment = @import("../model/cell_vertical_alignment.zig");
pub const Witness = struct { section: usize, table_node: usize, selection: block.Selection };
pub const Entry = struct { before: single.Observation, paragraphs: []u32, row: u32, column: u32, row_span: u32, column_span: u32 };
pub const Observation = struct {
    section: usize,
    table_node: usize,
    rows: u32,
    columns: u32,
    rectangle: block.Rectangle,
    source_sha256: [32]u8,
    ticket: epoch.Ticket,
    entries: []Entry,
    pub fn deinit(self: *Observation, a: std.mem.Allocator) void {
        for (self.entries) |*entry| {
            entry.before.deinit(a);
            a.free(entry.paragraphs);
        }
        a.free(self.entries);
        self.* = undefined;
    }
};
pub const Request = struct { before: Observation, revision: u32, value: alignment.Alignment };
const Cell = struct { owner: @import("table_display_owner.zig").Owner, template: usize, paragraphs: std.ArrayList(u32) = .empty };
fn firstParagraph(tree: *const Tree, list: usize) !usize {
    if (list >= tree.elements.len or !fields.childIs(tree, list, "subList")) return error.InvalidCellDisplayOwner;
    var child = tree.elements[list].first_child;
    while (child) |node| : (child = tree.elements[node].next_sibling) if (fields.childIs(tree, node, "p")) return node;
    return error.InvalidCellDisplayOwner;
}
fn topLevel(tree: *const Tree, table: usize) !void {
    if (table >= tree.elements.len or !fields.childIs(tree, table, "tbl")) return error.InvalidCellDisplayOwner;
    var parent = tree.elements[table].parent;
    while (parent) |node| : (parent = tree.elements[node].parent) {
        if (fields.childIs(tree, node, "tc") or fields.childIs(tree, node, "subList")) return error.UnsupportedNestedOriginalCellBlock;
    }
}
pub fn observe(a: std.mem.Allocator, session: *const editor.Session, witness: Witness, ticket: epoch.Ticket) !Observation {
    if (witness.section >= session.sections.len) return error.InvalidSectionIndex;
    for (session.sections) |section| if (section.created_tables.entries.items.len != 0) return error.UnsupportedInsertPendingTable;
    const section = &session.sections[witness.section];
    const tree = &section.tree;
    try topLevel(tree, witness.table_node);
    var owners: @import("table_display_owner_query.zig").Query = .{ .allocator = a, .tree = tree };
    defer owners.deinit();
    var cells: std.ArrayList(Cell) = .empty;
    defer {
        for (cells.items) |*cell| cell.paragraphs.deinit(a);
        cells.deinit(a);
    }
    var by_list: std.AutoHashMap(usize, usize) = .init(a);
    defer by_list.deinit();
    var row = tree.elements[witness.table_node].first_child;
    while (row) |r| : (row = tree.elements[r].next_sibling) {
        if (!fields.childIs(tree, r, "tr")) continue;
        var child = tree.elements[r].first_child;
        while (child) |node| : (child = tree.elements[node].next_sibling) {
            if (!fields.childIs(tree, node, "tc")) continue;
            if (cells.items.len >= block.max_cells) return error.LimitExceeded;
            const cell = try @import("table_display_cell.zig").read(a, tree, node);
            const list = cell.sub_list orelse return error.InvalidCellDisplayOwner;
            const template = try firstParagraph(tree, list);
            const owner = (try owners.resolve(template)) orelse return error.InvalidCellDisplayOwner;
            if (owner.table_node != witness.table_node or owner.cell_node != node or owner.rows != witness.selection.rows or owner.columns != witness.selection.columns) return error.SourceBindingMismatch;
            const slot = try by_list.getOrPut(list);
            if (slot.found_existing) return error.AmbiguousCellDisplayOwner;
            slot.value_ptr.* = cells.items.len;
            try cells.append(a, .{ .owner = owner, .template = template });
        }
    }
    const bindings = try @import("table_display_bindings.zig").read(a, session, witness.section);
    defer a.free(bindings);
    for (bindings) |binding| {
        if (binding.owner.table_node != witness.table_node) continue;
        const index = by_list.get(binding.owner.list_node) orelse return error.InvalidCellDisplayOwner;
        if (binding.paragraph > std.math.maxInt(u32)) return error.LimitExceeded;
        try cells.items[index].paragraphs.append(a, @intCast(binding.paragraph));
    }
    const geometry = try a.alloc(block.Cell, cells.items.len);
    defer a.free(geometry);
    for (cells.items, geometry) |cell, *target| {
        if (cell.owner.list_node > std.math.maxInt(u32)) return error.LimitExceeded;
        target.* = .{ .list_node = @intCast(cell.owner.list_node), .row = cell.owner.cell.row.?, .column = cell.owner.cell.column.?, .row_span = cell.owner.cell.row_span.?, .column_span = cell.owner.cell.column_span.?, .paragraphs = cell.paragraphs.items };
    }
    const selected = try block.validate(a, geometry, witness.selection);
    defer a.free(selected);
    var sha256: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(tree.source, &sha256, .{});
    // One field analysis for the request. Existing whole-anchored policy still
    // validates every CURRENT member paragraph, including inherited structures.
    var proxy = session.*;
    proxy.allocator = a;
    var analysis = try @import("source_field_analysis.zig").leaseForExterior(&proxy);
    defer analysis.deinit(a);
    proxy.source_fields = analysis.source;
    const entries = try a.alloc(Entry, selected.len);
    var initialized: usize = 0;
    errdefer {
        for (entries[0..initialized]) |*entry| {
            entry.before.deinit(a);
            a.free(entry.paragraphs);
        }
        a.free(entries);
    }
    for (selected, entries) |index, *entry| {
        const cell = cells.items[index];
        for (cell.paragraphs.items) |paragraph| {
            const positions = try @import("field_source_outside_positions.zig").prepareAction(&proxy, witness.section, paragraph, 0, 0, .whole_anchored);
            if (positions) |owned| a.free(owned);
        }
        const raw = if (try tree.attributeValue(a, cell.owner.list_node, "", "vertAlign")) |v| try v.toUtf8(a, 4096) else null;
        errdefer if (raw) |owned| a.free(owned);
        var protected = false;
        if (try tree.attributeValue(a, cell.owner.cell_node, "", "protect")) |v| protected = try fields.boolean(a, v, 4096);
        const paragraphs = try a.dupe(u32, cell.paragraphs.items);
        entry.* = .{ .before = .{ .section = witness.section, .paragraph_template = cell.template, .table_node = witness.table_node, .cell_node = cell.owner.cell_node, .list_node = cell.owner.list_node, .source_sha256 = sha256, .ticket = ticket, .raw = raw, .value = if (raw) |v| alignment.fromText(v) else null, .read_only = protected }, .paragraphs = paragraphs, .row = geometry[index].row, .column = geometry[index].column, .row_span = geometry[index].row_span, .column_span = geometry[index].column_span };
        initialized += 1;
    }
    return .{ .section = witness.section, .table_node = witness.table_node, .rows = witness.selection.rows, .columns = witness.selection.columns, .rectangle = witness.selection.rectangle, .source_sha256 = sha256, .ticket = ticket, .entries = entries };
}
fn matches(left: Observation, right: Observation) bool {
    if (left.section != right.section or left.table_node != right.table_node or left.rows != right.rows or left.columns != right.columns or !std.meta.eql(left.rectangle, right.rectangle) or !std.meta.eql(left.ticket, right.ticket) or !std.mem.eql(u8, &left.source_sha256, &right.source_sha256) or left.entries.len != right.entries.len) return false;
    for (left.entries, right.entries) |one, two| {
        if (!single.matches(one.before, two.before) or one.row != two.row or one.column != two.column or one.row_span != two.row_span or one.column_span != two.column_span or !std.mem.eql(u32, one.paragraphs, two.paragraphs)) return false;
    }
    return true;
}
fn witnesses(a: std.mem.Allocator, before: Observation) ![]block.Witness {
    if (before.entries.len == 0 or before.entries.len > block.max_cells) return error.InvalidOriginalCellBlock;
    const rows = try a.alloc(block.Witness, before.entries.len);
    errdefer a.free(rows);
    for (before.entries, rows) |entry, *row| {
        if (entry.before.list_node > std.math.maxInt(u32)) return error.LimitExceeded;
        row.* = .{ .list_node = @intCast(entry.before.list_node), .row = entry.row, .column = entry.column, .paragraphs = entry.paragraphs };
    }
    return rows;
}
pub fn validate(a: std.mem.Allocator, session: *const editor.Session, request: Request, ticket: epoch.Ticket, revision: u32) !bool {
    if (request.revision != revision) return error.StaleCellVerticalAlignment;
    const cells = try witnesses(a, request.before);
    defer a.free(cells);
    var current = try observe(a, session, .{ .section = request.before.section, .table_node = request.before.table_node, .selection = .{ .rows = request.before.rows, .columns = request.before.columns, .rectangle = request.before.rectangle, .cells = cells } }, ticket);
    defer current.deinit(a);
    if (!matches(current, request.before)) return error.StaleCellVerticalAlignment;
    var changed = false;
    for (current.entries) |entry| {
        if (entry.before.read_only) return error.CellVerticalAlignmentReadOnly;
        if (entry.before.raw != null and entry.before.value == null) return error.UnsupportedCellVerticalAlignment;
        changed = changed or entry.before.value == null or entry.before.value.? != request.value;
    }
    return changed;
}
fn cellList(tree: *const Tree, node: usize) bool {
    if (!fields.childIs(tree, node, "subList")) return false;
    const parent = tree.elements[node].parent orelse return false;
    return fields.childIs(tree, parent, "tc");
}
fn writeMapped(a: std.mem.Allocator, tree: *const Tree, mapped: Observation, value: alignment.Alignment, limit: usize) ![]u8 {
    const writer = @import("xml_source_writer.zig");
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    var tags: std.ArrayList([]u8) = .empty;
    defer {
        for (tags.items) |tag| a.free(tag);
        tags.deinit(a);
    }
    // Entries are physical source ordered. Disjoint subList roots mean every
    // cache node is visited at most once; writer enforces sorted disjoint spans.
    for (mapped.entries) |entry| {
        if (entry.before.value != null and entry.before.value.? == value) continue;
        const list = entry.before.list_node;
        try @import("page_settings_layout_cache.zig").validateSubtree(a, tree, .{ .root_node = list });
        const tag = try @import("xml_scalar_attributes_upsert.zig").write(a, tree, list, &.{"vertAlign"}, .{alignment.text(value)}, limit);
        tags.append(a, tag) catch |err| {
            a.free(tag);
            return err;
        };
        const root = tree.elements[list];
        try changes.append(a, .{ .start = root.start_tag.start, .end = root.start_tag.end, .text = "", .start_tag = tag });
        for (tree.elements[list..]) |node| {
            if (node.start_tag.start >= root.end) break;
            if (node.is(@import("document_xml.zig").paragraph_uri, "tbl")) return error.UnsupportedNestedOriginalCellBlock;
            if (!node.is(@import("document_xml.zig").paragraph_uri, "linesegarray")) continue;
            try changes.append(a, .{ .start = node.start_tag.start, .end = node.end, .text = "", .serialized_xml = "" });
        }
    }
    return writer.write(a, tree.source, changes.items, limit);
}
pub fn prepare(a: std.mem.Allocator, live: *const editor.Session, bytes: []const u8, request: Request, ticket: epoch.Ticket, revision: u32) !?editor.Session {
    if (!try validate(a, live, request, ticket, revision)) return null;
    var saved = try editor.open(a, bytes, live.options);
    defer saved.deinit();
    if (request.before.section >= saved.sections.len) return error.InvalidSectionIndex;
    const original = &live.sections[request.before.section].tree;
    const tree = &saved.sections[request.before.section].tree;
    var mapping = try @import("xml_identity_binding.zig").bind(a, original, tree, cellList);
    defer mapping.deinit(a);
    const mapped_cells = try a.alloc(block.Witness, request.before.entries.len);
    defer a.free(mapped_cells);
    var owner_query: @import("table_display_owner_query.zig").Query = .{ .allocator = a, .tree = tree };
    defer owner_query.deinit();
    var mapped_table: ?usize = null;
    for (request.before.entries, mapped_cells) |entry, *cell| {
        const list = mapping.get(entry.before.list_node) orelse return error.SourceBindingMismatch;
        const template = try firstParagraph(tree, list);
        const owner = (try owner_query.resolve(template)) orelse return error.InvalidCellDisplayOwner;
        if (list > std.math.maxInt(u32) or owner.list_node != list or owner.rows != request.before.rows or owner.columns != request.before.columns or owner.cell.row.? != entry.row or owner.cell.column.? != entry.column or owner.cell.row_span.? != entry.row_span or owner.cell.column_span.? != entry.column_span) return error.SourceBindingMismatch;
        if (mapped_table) |table| {
            if (table != owner.table_node) return error.SourceBindingMismatch;
        } else mapped_table = owner.table_node;
        cell.* = .{ .list_node = @intCast(list), .row = entry.row, .column = entry.column, .paragraphs = entry.paragraphs };
    }
    var mapped = try observe(a, &saved, .{ .section = request.before.section, .table_node = mapped_table orelse return error.InvalidCellDisplayOwner, .selection = .{ .rows = request.before.rows, .columns = request.before.columns, .rectangle = request.before.rectangle, .cells = mapped_cells } }, ticket);
    defer mapped.deinit(a);
    // Compare current values through the proven list mapping, never by equal
    // ordinals after serialization. The source writer never sees caller XML.
    var original_by_list: std.AutoHashMap(usize, usize) = .init(a);
    defer original_by_list.deinit();
    for (mapped_cells, 0..) |cell, index| try original_by_list.put(cell.list_node, index);
    for (mapped.entries) |entry| {
        const index = original_by_list.get(entry.before.list_node) orelse return error.SourceBindingMismatch;
        if (entry.before.value != request.before.entries[index].before.value or entry.before.read_only) return error.StaleCellVerticalAlignment;
    }
    const xml = try writeMapped(a, tree, mapped, request.value, live.options.max_xml_bytes);
    defer a.free(xml);
    const package = try @import("../zip/replace_writer.zig").write(a, bytes, &.{.{ .entry_index = saved.sections[request.before.section].entry_index, .bytes = xml }}, .{ .max_output_bytes = live.options.max_output_bytes });
    defer a.free(package);
    return try editor.open(a, package, live.options);
}
