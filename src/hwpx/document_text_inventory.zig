//! Actual current HWPX owner catalogue, independent of the painted snapshot.
//! All source/generated paragraphs and pending cells are retained. Pending
//! emission order/physical placement is a separate SSOT proof, not inferred
//! from table IDs, paragraph IDs, writability or copied XML equality.
const std = @import("std");
const editor = @import("editor_session.zig");
const references = @import("current_paragraph_reference.zig");
const transaction = @import("../model/text_transaction.zig");
const Source = struct {
    index: usize,
    ordinal: usize,
    reference: references.Reference,
    text: []const u8,
};
const Cell = struct {
    identity: u64,
    row: u32,
    column: u32,
    paragraph_id: u32,
    text: []const u8,
    host_index: usize,
    anchor: @import("created_table_anchor.zig").Anchor,
};
pub const Section = struct {
    sources: []const Source,
    cells: []const Cell,
    references: std.AutoHashMapUnmanaged(references.Reference, usize),
};
pub const Inventory = struct {
    arena: std.heap.ArenaAllocator,
    source_pointer: [*]u8,
    sections_pointer: [*]editor.Section,
    serial: u64,
    coverage: transaction.Coverage,
    sections: []const Section,
    text_units: usize,
    pub fn deinit(self: *Inventory) void {
        self.arena.deinit();
        self.* = undefined;
    }
    pub fn assertCurrent(self: *const Inventory, session: *const editor.Session) !void {
        if (session.source.ptr != self.source_pointer or session.sections.ptr != self.sections_pointer or
            session.sections.len != self.sections.len or session.mutation_serial != self.serial)
            return error.StaleDocumentTextSnapshot;
        for (session.sections) |section| try section.validateSourceBasis();
    }
};

pub fn read(a: std.mem.Allocator, session: *const editor.Session) !Inventory {
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const owned = arena.allocator();
    const coverage = try session.independentTextCoverage(owned);
    if (coverage.paragraphs > transaction.limits.snapshot_paragraphs or coverage.sections.len > transaction.limits.sections) return error.LimitExceeded;
    const sections = try owned.alloc(Section, session.sections.len);
    var result: Inventory = .{ .arena = arena, .source_pointer = session.source.ptr, .sections_pointer = session.sections.ptr, .serial = session.mutation_serial, .coverage = coverage, .sections = sections, .text_units = 0 };
    var source_total: usize = 0;
    var cells_total: usize = 0;
    var text_bytes: usize = 0;
    var boundary_units: usize = 0;
    for (session.sections, sections, 0..) |*section, *out, section_index| {
        try section.validateSourceBasis();
        var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
        defer current.deinit(a);
        const expected_sources = coverage.sections[section_index].paragraphs - count: {
            var count: usize = 0;
            for (section.created_tables.entries.items) |entry|
                count = std.math.add(usize, count, entry.table.cells.len) catch return error.LimitExceeded;
            break :count count;
        };
        if (current.paragraphs.len != expected_sources) return error.SourceBindingMismatch;
        const sources = try owned.alloc(Source, current.paragraphs.len);
        var by_reference: std.AutoHashMapUnmanaged(references.Reference, usize) = .empty;
        for (current.paragraphs, sources, 0..) |*paragraph, *row, index| {
            const reference = try references.from(paragraph);
            const slot = try by_reference.getOrPut(owned, reference);
            if (slot.found_existing) return error.AmbiguousCurrentParagraphReference;
            slot.value_ptr.* = index;
            const text = try @import("paragraph_text_snapshot.zig").copyCurrentText(owned, paragraph, session.options.max_text_bytes -| text_bytes);
            text_bytes = std.math.add(usize, text_bytes, text.len) catch return error.LimitExceeded;
            result.text_units = std.math.add(usize, result.text_units, try transaction.edits.utf16Units(text)) catch return error.LimitExceeded;
            if (result.text_units > transaction.limits.text_units) return error.LimitExceeded;
            row.* = .{ .index = index, .ordinal = try std.math.add(usize, section.first_paragraph, index), .reference = reference, .text = text };
        }
        var cells: std.ArrayList(Cell) = .empty;
        var host_boundaries: std.AutoHashMapUnmanaged(usize, []bool) = .empty;
        defer {
            var values = host_boundaries.valueIterator();
            while (values.next()) |value| a.free(value.*);
            host_boundaries.deinit(a);
        }
        var table_ids: std.AutoHashMapUnmanaged(u64, void) = .empty;
        var paragraph_ids: std.AutoHashMapUnmanaged(u32, void) = .empty;
        for (section.created_tables.entries.items) |entry| {
            if (entry.anchor.section != section_index) return error.SourceBindingMismatch;
            const host = by_reference.get(entry.anchor.paragraph) orelse return error.MissingCurrentParagraphReference;
            const boundary_slot = try host_boundaries.getOrPut(a, host);
            if (!boundary_slot.found_existing) {
                // Do not leave an undefined map value for allocation cleanup.
                boundary_slot.value_ptr.* = &.{};
                const valid = try @import("created_table_anchor.zig").boundaryMap(a, section, &current.paragraphs[host], transaction.limits.text_units - boundary_units);
                boundary_units += valid.len - 1;
                boundary_slot.value_ptr.* = valid;
            }
            const valid = boundary_slot.value_ptr.*;
            try @import("paragraph_scalar_boundaries.zig").validate(valid, entry.anchor.unit);
            const table = &entry.table;
            if (table.identity == 0 or table.plan.columns == 0 or table.plan.rows == 0 or
                table.cells.len != try std.math.mul(usize, table.plan.rows, table.plan.columns) or
                (try table_ids.getOrPut(owned, table.identity)).found_existing) return error.InvalidCreatedTableIdentity;
            for (table.cells, 0..) |cell, index| {
                if (cell.paragraph_id == 0 or (try paragraph_ids.getOrPut(owned, cell.paragraph_id)).found_existing) return error.InvalidTableParagraphIds;
                if (cell.text.len > session.options.max_text_bytes -| text_bytes) return error.LimitExceeded;
                text_bytes += cell.text.len;
                result.text_units = std.math.add(usize, result.text_units, try transaction.edits.utf16Units(cell.text)) catch return error.LimitExceeded;
                if (result.text_units > transaction.limits.text_units) return error.LimitExceeded;
                try cells.append(owned, .{ .identity = table.identity, .row = @intCast(index / table.plan.columns), .column = @intCast(index % table.plan.columns), .paragraph_id = cell.paragraph_id, .text = try owned.dupe(u8, cell.text), .host_index = host, .anchor = entry.anchor });
            }
        }
        source_total += sources.len;
        cells_total += cells.items.len;
        out.* = .{ .sources = sources, .cells = try cells.toOwnedSlice(owned), .references = by_reference };
    }
    if (cells_total != coverage.created_cell_paragraphs or source_total + cells_total != coverage.paragraphs) return error.IncompleteDocumentTextSnapshot;
    try result.assertCurrent(session);
    // Do not export this as an ordered document-text snapshot yet: formula
    // display and pending emission receipts still need their Native SSOT proof.
    result.arena = arena;
    return result;
}
