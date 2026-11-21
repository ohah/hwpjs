//! Own immutable HWP5 preparation only. No Session mutation, history or lease issuance.
const std = @import("std");
const model = @import("../../model/document.zig");
const epoch = @import("../../model/history_mutation_epoch.zig");
const block = @import("../../model/original_cell_block.zig");
const single = @import("cell_vertical_alignment_plan.zig");
const payload = @import("cell_vertical_alignment_payload.zig");
const Alignment = @import("../../model/cell_vertical_alignment.zig").Alignment;
const Version = @import("../version.zig").Version;
pub const Witness = struct { section: u32, table_node: u32, selection: block.Selection };
pub const Entry = struct {
    selector: single.Selector,
    row: u32,
    column: u32,
    row_span: u32,
    column_span: u32,
    paragraphs: []u32,
    attributes: u32,
    value: ?Alignment,
    read_only: bool,
    payload_offset: usize,
    payload_len: usize,
};
pub const Observation = struct {
    section: u32,
    table_node: u32,
    rows: u32,
    columns: u32,
    rectangle: block.Rectangle,
    source_sha256: [32]u8,
    ticket: epoch.Ticket,
    read_only: bool,
    entries: []Entry,
    pub fn deinit(self: *Observation, a: std.mem.Allocator) void {
        for (self.entries) |entry| a.free(entry.paragraphs);
        a.free(self.entries);
        self.* = undefined;
    }
};
pub const Request = struct { before: Observation, value: Alignment };
pub const Prepared = struct {
    bytes: []u8,
    changed_cells: usize,
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        a.free(self.bytes);
        self.* = undefined;
    }
};
const Cell = struct { node: u32, attributes: u32, value: ?Alignment, geometry: @import("../body/table_cell.zig").Cell, paragraphs: std.ArrayList(u32) = .empty, protected: bool = false, offset: usize, len: usize };

pub fn observe(a: std.mem.Allocator, raw: []const u8, version: Version, section: model.Section, section_index: u32, witness: Witness, ticket: epoch.Ticket, read_only: bool) !Observation {
    if (witness.section != section_index) return error.InvalidSection;
    if (section.paragraphs.len > 100000) return error.LimitExceeded;
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    if (witness.table_node >= tree.nodes.len or tree.nodes[witness.table_node].record.value != .table) return error.InvalidCellDisplayOwner;
    const owner = tree.nodes[witness.table_node].parent orelse return error.InvalidCellDisplayOwner;
    var lists = try @import("../body/table_lists.zig").Iterator.init(tree, owner);
    if (lists.table_node != witness.table_node) return error.InvalidCellDisplayOwner;
    const host = tree.nodes[owner].parent orelse return error.InvalidCellDisplayOwner;
    if (tree.nodes[host].parent != null) return error.UnsupportedNestedOriginalCellBlock;
    const shape = tree.nodes[witness.table_node].record.value.table;
    if (shape.row_count != witness.selection.rows or shape.column_count != witness.selection.columns) return error.SourceBindingMismatch;
    if (@as(u64, shape.row_count) * shape.column_count > block.max_cells) return error.LimitExceeded;
    var cells: std.ArrayList(Cell) = .empty;
    defer {
        for (cells.items) |*cell| cell.paragraphs.deinit(a);
        cells.deinit(a);
    }
    var by_list: std.AutoHashMap(u32, usize) = .init(a);
    defer by_list.deinit();
    while (lists.next()) |list| {
        if (list.kind != .cell) continue;
        if (cells.items.len >= block.max_cells) return error.LimitExceeded;
        const record = tree.nodes[list.node].record.framing;
        const current = try payload.observe(record.payload, .observed8);
        const view = try tree.nodes[list.node].record.value.list_header.view(.observed8);
        const cell_geometry = try @import("../body/table_cell.zig").Cell.parse(view.extra);
        const slot = try by_list.getOrPut(@intCast(list.node));
        if (slot.found_existing) return error.AmbiguousCellDisplayOwner;
        slot.value_ptr.* = cells.items.len;
        try cells.append(a, .{ .node = @intCast(list.node), .attributes = current.attributes, .value = current.value, .geometry = cell_geometry, .offset = record.offset + record.raw.len - record.payload.len, .len = record.payload.len });
    }
    // Same binding and whole-cell field policy as the single-cell observer,
    // shared across the request rather than reparsed once for every owner.
    const bindings = try @import("table_display_bindings.zig").read(a, raw, version, section.paragraphs);
    defer a.free(bindings);
    const spans = try @import("local_field_spans.zig").collectReadableBound(a, raw, version, section);
    defer a.free(spans);
    const events = try a.alloc(i64, section.paragraphs.len + 1);
    defer a.free(events);
    @memset(events, 0);
    for (spans) |span| {
        if (span.begin.paragraph > span.end.paragraph or span.end.paragraph >= section.paragraphs.len) return error.SourceBindingMismatch;
        events[span.begin.paragraph] += 1;
        events[span.end.paragraph + 1] -= 1;
    }
    var active: i64 = 0;
    for (events[0..section.paragraphs.len]) |*event| {
        active += event.*;
        event.* = active;
    }
    for (bindings) |binding| {
        if (binding.table_node != witness.table_node) continue;
        const index = by_list.get(binding.list_node) orelse return error.InvalidCellDisplayOwner;
        const cell = &cells.items[index];
        if (binding.paragraph >= section.paragraphs.len or binding.rows != shape.row_count or binding.columns != shape.column_count or binding.row != cell.geometry.row or binding.column != cell.geometry.column or binding.row_span != cell.geometry.row_span or binding.column_span != cell.geometry.column_span) return error.SourceBindingMismatch;
        const paragraph = section.paragraphs[binding.paragraph];
        if (paragraph.source_node == null or paragraph.header_template != null) return error.UnsupportedOriginalCellBlockSource;
        try cell.paragraphs.append(a, binding.paragraph);
        cell.protected = cell.protected or events[binding.paragraph] != 0;
    }
    const geometry = try a.alloc(block.Cell, cells.items.len);
    defer a.free(geometry);
    for (cells.items, geometry) |cell, *target| target.* = .{ .list_node = cell.node, .row = cell.geometry.row, .column = cell.geometry.column, .row_span = cell.geometry.row_span, .column_span = cell.geometry.column_span, .paragraphs = cell.paragraphs.items };
    const selected = try block.validate(a, geometry, witness.selection);
    defer a.free(selected);
    const entries = try a.alloc(Entry, selected.len);
    var initialized: usize = 0;
    errdefer {
        for (entries[0..initialized]) |entry| a.free(entry.paragraphs);
        a.free(entries);
    }
    for (selected, entries) |index, *entry| {
        const cell = cells.items[index];
        entry.* = .{ .selector = .{ .section = section_index, .table_node = witness.table_node, .list_node = cell.node, .paragraph = cell.paragraphs.items[0] }, .row = cell.geometry.row, .column = cell.geometry.column, .row_span = cell.geometry.row_span, .column_span = cell.geometry.column_span, .paragraphs = try a.dupe(u32, cell.paragraphs.items), .attributes = cell.attributes, .value = cell.value, .read_only = read_only or cell.protected or cell.attributes & (1 << 17) != 0, .payload_offset = cell.offset, .payload_len = cell.len };
        initialized += 1;
    }
    var sha256: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(raw, &sha256, .{});
    return .{ .section = section_index, .table_node = witness.table_node, .rows = shape.row_count, .columns = shape.column_count, .rectangle = witness.selection.rectangle, .source_sha256 = sha256, .ticket = ticket, .read_only = read_only, .entries = entries };
}
fn matches(left: Observation, right: Observation) bool {
    if (left.section != right.section or left.table_node != right.table_node or left.rows != right.rows or left.columns != right.columns or !std.meta.eql(left.rectangle, right.rectangle) or !std.meta.eql(left.ticket, right.ticket) or left.read_only != right.read_only or !std.mem.eql(u8, &left.source_sha256, &right.source_sha256) or left.entries.len != right.entries.len) return false;
    for (left.entries, right.entries) |a, b| {
        if (!std.meta.eql(a.selector, b.selector) or a.row != b.row or a.column != b.column or a.row_span != b.row_span or a.column_span != b.column_span or a.attributes != b.attributes or a.value != b.value or a.read_only != b.read_only or a.payload_offset != b.payload_offset or a.payload_len != b.payload_len or !std.mem.eql(u32, a.paragraphs, b.paragraphs)) return false;
    }
    return true;
}
fn checked(a: std.mem.Allocator, raw: []const u8, version: Version, section: model.Section, section_index: u32, before: Observation, ticket: epoch.Ticket, read_only: bool) !Observation {
    if (before.entries.len == 0 or before.entries.len > block.max_cells) return error.InvalidOriginalCellBlock;
    const witnesses = try a.alloc(block.Witness, before.entries.len);
    defer a.free(witnesses);
    for (before.entries, witnesses) |entry, *witness| witness.* = .{ .list_node = entry.selector.list_node, .row = entry.row, .column = entry.column, .paragraphs = entry.paragraphs };
    var current = try observe(a, raw, version, section, section_index, .{ .section = before.section, .table_node = before.table_node, .selection = .{ .rows = before.rows, .columns = before.columns, .rectangle = before.rectangle, .cells = witnesses } }, ticket, read_only);
    errdefer current.deinit(a);
    if (!matches(current, before)) return error.StaleCellVerticalAlignment;
    for (current.entries) |entry| {
        if (entry.read_only) return error.CellVerticalAlignmentReadOnly;
        if (entry.value == null) return error.UnsupportedCellVerticalAlignment;
    }
    return current;
}
pub fn validate(a: std.mem.Allocator, raw: []const u8, version: Version, section: model.Section, section_index: u32, before: Observation, value: Alignment, ticket: epoch.Ticket, read_only: bool) !bool {
    var current = try checked(a, raw, version, section, section_index, before, ticket, read_only);
    defer current.deinit(a);
    for (current.entries) |entry| if (entry.value.? != value) return true;
    return false;
}
/// Caller can publish returned bytes once through managed history. No partial
/// output is returned and no live Session/basis is touched on any failure.
pub fn prepare(a: std.mem.Allocator, raw: []const u8, version: Version, section: model.Section, section_index: u32, before: Observation, value: Alignment, ticket: epoch.Ticket, read_only: bool, limit: usize) !?Prepared {
    if (raw.len > limit) return error.LimitExceeded;
    var current = try checked(a, raw, version, section, section_index, before, ticket, read_only);
    defer current.deinit(a);
    const changed = try a.alloc(?[]u8, current.entries.len);
    defer a.free(changed);
    @memset(changed, null);
    defer for (changed) |bytes| if (bytes) |owned| a.free(owned);
    var count: usize = 0;
    for (current.entries, changed) |entry, *bytes| {
        bytes.* = try payload.write(a, raw[entry.payload_offset..][0..entry.payload_len], .observed8, entry.attributes, value, entry.payload_len);
        if (bytes.* != null) count += 1;
    }
    if (count == 0) return null;
    // One full immutable-section copy, after every owner has passed preflight.
    const output = try a.dupe(u8, raw);
    for (current.entries, changed) |entry, bytes| if (bytes) |owned| @memcpy(output[entry.payload_offset..][0..owned.len], owned);
    return .{ .bytes = output, .changed_cells = count };
}
