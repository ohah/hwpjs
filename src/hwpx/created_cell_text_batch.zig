//! Detached pending-cell candidates for one whole-document text transaction.
//! This module publishes nothing. The whole transaction validates source text,
//! metadata, anchors and serialization before transferring any candidate values.
const std = @import("std");
const editor = @import("editor_session.zig");
const Values = @import("created_table_values.zig").Values;
const Edit = @import("../model/independent_text_edits.zig").Edit;
const limits = @import("../model/text_transaction.zig").limits;
pub const Group = struct {
    section: usize,
    identity: u64,
    row: u32,
    column: u32,
    before_units: u32,
    edits: []const Edit,
};
const Key = struct { section: usize, identity: u64 };
const CellKey = struct { section: usize, identity: u64, row: u32, column: u32 };
pub const Section = struct {
    values: Values,
    original_pointer: [*]@import("created_table_values.zig").Entry,
    original_len: usize,
    changed: bool = false,
};
pub const Prepared = struct {
    allocator: std.mem.Allocator,
    owner: *const editor.Session,
    source: [*]u8,
    serial: u64,
    active: bool,
    sections_pointer: [*]editor.Section,
    sections: []?Section,
    pub fn cloneSection(self: *Prepared, section_index: usize) !*Section {
        try self.checkOwner(self.owner);
        if (section_index >= self.sections.len) return error.InvalidSectionIndex;
        if (self.sections[section_index] == null) {
            const live = &self.owner.sections[section_index].created_tables;
            self.sections[section_index] = .{ .values = try live.clone(self.allocator), .original_pointer = live.entries.items.ptr, .original_len = live.entries.items.len };
        }
        return &self.sections[section_index].?;
    }
    pub fn deinit(self: *Prepared) void {
        for (self.sections) |*slot| if (slot.*) |*section| section.values.deinit(self.allocator);
        self.allocator.free(self.sections);
        self.* = undefined;
    }
    pub fn validateCurrent(self: *const Prepared, session: *const editor.Session) !void {
        try self.checkOwner(session);
        for (self.sections, session.sections) |slot, live| if (slot) |section| {
            const entries = live.created_tables.entries.items;
            if (entries.ptr != section.original_pointer or entries.len != section.original_len) return error.StaleCreatedCellTextBatch;
        };
    }
    fn checkOwner(self: *const Prepared, session: *const editor.Session) !void {
        if (session != self.owner or session.source.ptr != self.source or
            session.sections.ptr != self.sections_pointer or session.sections.len != self.sections.len or
            session.mutation_serial != self.serial or session.history_transaction_active != self.active or
            !session.history_delta_managed) return error.StaleCreatedCellTextBatch;
    }
};

pub fn prepare(a: std.mem.Allocator, session: *const editor.Session, groups: []const Group) !Prepared {
    if (!session.history_delta_managed) return error.HistoryProtocolRequired;
    if (groups.len > limits.groups or session.sections.len > limits.sections) return error.LimitExceeded;
    const sections = try a.alloc(?Section, session.sections.len);
    @memset(sections, null);
    var result: Prepared = .{ .allocator = a, .owner = session, .source = session.source.ptr, .serial = session.mutation_serial, .active = session.history_transaction_active, .sections_pointer = session.sections.ptr, .sections = sections };
    errdefer result.deinit();
    var tables: std.AutoHashMapUnmanaged(Key, usize) = .empty;
    defer tables.deinit(a);
    for (session.sections, 0..) |section, section_index| for (section.created_tables.entries.items, 0..) |entry, index| {
        if (entry.table.identity == 0 or entry.anchor.section != section_index) return error.InvalidCreatedTableIdentity;
        const slot = try tables.getOrPut(a, .{ .section = section_index, .identity = entry.table.identity });
        if (slot.found_existing) return error.InvalidCreatedTableIdentity;
        slot.value_ptr.* = index;
    };
    var cells: std.AutoHashMapUnmanaged(CellKey, void) = .empty;
    defer cells.deinit(a);
    var edits: usize = 0;
    var inserted_bytes: usize = 0;
    var before_total: usize = 0;
    var after_total: usize = 0;
    for (groups) |group| {
        if (group.section >= sections.len) return error.InvalidSectionIndex;
        if ((try cells.getOrPut(a, .{ .section = group.section, .identity = group.identity, .row = group.row, .column = group.column })).found_existing) return error.DuplicateTextTransactionTarget;
        if (group.edits.len > limits.edits_count - edits) return error.LimitExceeded;
        edits += group.edits.len;
        const table_index = tables.get(.{ .section = group.section, .identity = group.identity }) orelse return error.InvalidCreatedTableIdentity;
        const section = try result.cloneSection(group.section);
        const table = &section.values.entries.items[table_index].table;
        _ = try table.plan.cell(group.row, group.column);
        const cell = try std.math.add(usize, try std.math.mul(usize, group.row, table.plan.columns), group.column);
        if (cell >= table.cells.len) return error.InvalidTableCell;
        const before = table.cells[cell].text;
        const units = try @import("../model/independent_text_edits.zig").utf16Units(before);
        if (units != group.before_units) return error.TextTransactionBeforeMismatch;
        const totals = try @import("../model/independent_text_edits.zig").validate(group.edits, units, .{
            .max_inserted_bytes = limits.inserted_bytes - inserted_bytes,
        });
        inserted_bytes += totals.inserted_bytes;
        before_total = std.math.add(usize, before_total, units) catch return error.LimitExceeded;
        after_total = std.math.add(usize, after_total, totals.output_units) catch return error.LimitExceeded;
        if (before_total > limits.text_units or after_total > limits.text_units) return error.LimitExceeded;
        const after = try @import("../text/utf8_utf16_splice.zig").replaceMany(a, before, group.edits, session.options.max_text_bytes, .{});
        defer a.free(after);
        // Same XML character contract as the existing single-cell writer, but
        // no repeated save, Session swap or whole-table clone for each match.
        const encoded = try @import("../xml/text_writer.zig").encode(a, after, session.options.max_xml_bytes);
        a.free(encoded);
        section.changed = (try table.replaceText(a, group.row, group.column, after, session.options.max_text_bytes)) or section.changed;
    }
    for (sections) |slot| if (slot) |section| {
        _ = try section.values.byteSize(session.options.max_xml_bytes);
    };
    try result.validateCurrent(session);
    return result;
}
