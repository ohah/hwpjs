//! Complete current Native owner traversal. The existing canonical reference
//! builder owns ordering; no display clipping or ordinary-write filter is used.
const std = @import("std");
const model = @import("../../model/document.zig");
const common = @import("../../model/document_text_snapshot.zig");
const Tables = @import("created_table_values.zig").Values;
const Host = @import("created_table_anchor.zig").Host;
const Point = @import("created_cell_text.zig").Point;

pub fn read(a: std.mem.Allocator, document: *const model.Document, tables: []const Tables, sources: []const []u8, version: @import("../version.zig").Version, state: @import("../../model/formatting_binding.zig").State, revision: ?u32, coverage: @import("../../model/text_transaction.zig").Coverage) !common.Snapshot {
    if (document.sections.len != tables.len or tables.len != sources.len or sources.len != coverage.sections.len) return error.SourceBindingMismatch;
    var result = try common.Snapshot.init(a, .hwp5, state, revision, coverage);
    errdefer result.deinit();
    const scratch = result.arena.allocator();
    for (document.sections, tables, sources, 0..) |*section, *pending, raw, section_index| {
        var paragraphs: std.AutoHashMapUnmanaged(Host, usize) = .empty;
        defer paragraphs.deinit(scratch);
        for (section.paragraphs, 0..) |paragraph, index| {
            const host = try @import("created_table_anchor.zig").identity(paragraph);
            if ((try paragraphs.getOrPut(scratch, host)).found_existing) return error.DuplicateCurrentTextOwner;
            paragraphs.getPtr(host).?.* = index;
        }
        var cells: std.AutoHashMapUnmanaged(Point, []const u8) = .empty;
        defer cells.deinit(scratch);
        for (pending.entries) |entry| {
            const table = entry.value.table;
            if (table.identity == 0 or table.plan.columns == 0 or table.plan.rows == 0 or table.cells.len != try std.math.mul(usize, table.plan.rows, table.plan.columns)) return error.InvalidCreatedTableCells;
            for (table.cells, 0..) |cell, index| {
                const point: Point = .{ .section = section_index, .table = table.identity, .row = @intCast(index / table.plan.columns), .column = @intCast(index % table.plan.columns) };
                const slot = try cells.getOrPut(scratch, point);
                if (slot.found_existing) return error.DuplicateCurrentTextOwner;
                slot.value_ptr.* = cell.text;
            }
        }
        const refs = try @import("created_table_paragraphs.zig").build(scratch, raw, section, pending, version, section_index, @import("../../model/text_transaction.zig").limits.snapshot_paragraphs);
        if (refs.len != coverage.sections[section_index].paragraphs) return error.IncompleteDocumentTextSnapshot;
        for (refs) |ref| switch (ref) {
            .source => |source| {
                if (source.section != section_index) return error.SourceBindingMismatch;
                const index = paragraphs.get(source.host) orelse return error.MissingParagraphSource;
                const text = try @import("plain_text_content.zig").editableTextBytes(scratch, section.paragraphs[index]);
                var projection = try @import("document_text_projection.zig").read(scratch, text);
                defer projection.deinit(scratch);
                try result.append(section_index, .{ .paragraph = index }, projection.text);
            },
            .created_cell => |point| {
                if (point.section != section_index) return error.SourceBindingMismatch;
                const text = cells.get(point) orelse return error.InvalidCreatedTableCells;
                try result.append(section_index, .{ .created_cell = .{ .identity = point.table, .row = point.row, .column = point.column } }, text);
            },
        };
    }
    try result.validateComplete();
    return result;
}
