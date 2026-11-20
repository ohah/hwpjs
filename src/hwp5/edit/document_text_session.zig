//! One private candidate for source paragraphs and pending generated cells.
//! Read locators are resolved by the service before entering this writer. The
//! existing Session/History retains the only mutation ticket and undo stack.
const std = @import("std");
const model = @import("../../model/document.zig");
const inventory = @import("../../model/document_text_snapshot.zig");
const independent = @import("../../model/independent_text_edits.zig");
const limits = @import("../../model/text_transaction.zig").limits;
const Values = @import("created_table_values.zig").Values;
const Context = @import("plain_text_source.zig").OrdinaryContext;
const Mapping = @import("../../model/protected_points_batch.zig").Mapping;
const records = @import("created_table_records.zig");
pub const Group = struct { section: usize, source: inventory.Source, edits: []const independent.Edit };
const Key = struct { section: usize, source: inventory.Source };
const TableKey = struct { section: usize, identity: u64 };
const Draft = struct {
    section: model.Section,
    tables: Values,
    context: ?*Context = null,
    fn deinit(self: *Draft, a: std.mem.Allocator) void {
        if (self.context) |context| context.destroy();
        self.tables.deinit(a);
        self.section.deinit(a);
    }
};

pub fn apply(a: std.mem.Allocator, source: []const []u8, version: @import("../version.zig").Version, document: *model.Document, pending: []Values, groups: []const Group, resources: records.Resources, table_limits: records.Limits) !bool {
    if (source.len != document.sections.len or pending.len != source.len) return error.SourceBindingMismatch;
    if (groups.len > limits.groups) return error.LimitExceeded;
    if (groups.len == 0) return false;
    var seen: std.AutoHashMapUnmanaged(Key, void) = .empty;
    defer seen.deinit(a);
    var tables: std.AutoHashMapUnmanaged(TableKey, usize) = .empty;
    defer tables.deinit(a);
    for (pending, 0..) |values, section| for (values.entries, 0..) |entry, index| {
        if ((try tables.getOrPut(a, .{ .section = section, .identity = entry.value.table.identity })).found_existing) return error.InvalidCreatedTableIdentity;
        tables.getPtr(.{ .section = section, .identity = entry.value.table.identity }).?.* = index;
    };
    const drafts = try a.alloc(?Draft, source.len);
    defer a.free(drafts);
    @memset(drafts, null);
    defer for (drafts) |*slot| if (slot.*) |*draft| draft.deinit(a);
    var edit_count: usize = 0;
    var inserted_bytes: usize = 0;
    for (groups) |group| {
        if (group.section >= source.len) return error.InvalidSection;
        if ((try seen.getOrPut(a, .{ .section = group.section, .source = group.source })).found_existing) return error.DuplicateTextTransactionTarget;
        if (group.edits.len > limits.edits_count - edit_count) return error.LimitExceeded;
        edit_count += group.edits.len;
        for (group.edits) |edit| {
            if (edit.expected == null) return error.MissingExpectedText;
            if (edit.text.len > limits.inserted_bytes - inserted_bytes) return error.LimitExceeded;
            inserted_bytes += edit.text.len;
        }
        if (drafts[group.section] == null) {
            var section = try @import("../../model/clone.zig").section(a, document.sections[group.section]);
            errdefer section.deinit(a);
            const values = try pending[group.section].clone(a, table_limits.max_bytes);
            drafts[group.section] = .{ .section = section, .tables = values };
        }
    }
    // Preserve the existing source policy for untouched sections. Selected
    // paragraphs still undergo the existing scoped owner/metadata validation.
    for (source, drafts) |bytes, slot| if (slot == null)
        try @import("text_source_policy.zig").validateUnselectedSection(a, bytes, version);
    var mappings: std.AutoHashMapUnmanaged(Key, Mapping) = .empty;
    defer {
        var values = mappings.valueIterator();
        while (values.next()) |mapping| mapping.deinit(a);
        mappings.deinit(a);
    }
    var before_total: usize = 0;
    var after_total: usize = 0;
    for (groups) |group| {
        const draft = &drafts[group.section].?;
        switch (group.source) {
            .paragraph => |index| {
                if (index >= draft.section.paragraphs.len) return error.InvalidParagraph;
                const paragraph = &draft.section.paragraphs[index];
                const before = try @import("plain_text_content.zig").editableTextBytes(a, paragraph.*);
                defer a.free(before);
                if (before.len < 2 or before.len % 2 != 0) return error.UnsupportedParagraphTerminator;
                const units = std.math.cast(u32, before.len / 2 - 1) orelse return error.LimitExceeded;
                const totals = try independent.validate(group.edits, units, .{});
                before_total = std.math.add(usize, before_total, units) catch return error.LimitExceeded;
                after_total = std.math.add(usize, after_total, totals.output_units) catch return error.LimitExceeded;
                if (before_total > limits.text_units or after_total > limits.text_units) return error.LimitExceeded;
                if (draft.context == null) draft.context = try Context.create(a, source[group.section], version, resources.paragraphs.char_shapes);
                _ = try @import("plain_text.zig").applyIndependentScoped(a, draft.context.?, source[group.section], version, paragraph, group.edits, resources.paragraphs.char_shapes, .{});
                var mapping = try @import("../../model/protected_points_batch.zig").prepare(a, units, group.edits);
                errdefer mapping.deinit(a);
                try mappings.put(a, .{ .section = group.section, .source = group.source }, mapping);
            },
            .created_cell => |cell| {
                const table_index = tables.get(.{ .section = group.section, .identity = cell.identity }) orelse return error.InvalidCreatedTableIdentity;
                const table = &draft.tables.entries[table_index].value.table;
                _ = try table.plan.cell(cell.row, cell.column);
                const index = try std.math.add(usize, try std.math.mul(usize, cell.row, table.plan.columns), cell.column);
                if (index >= table.cells.len) return error.InvalidTableCell;
                const before = table.cells[index].text;
                const units = try independent.utf16Units(before);
                const totals = try independent.validate(group.edits, units, .{});
                before_total = std.math.add(usize, before_total, units) catch return error.LimitExceeded;
                after_total = std.math.add(usize, after_total, totals.output_units) catch return error.LimitExceeded;
                if (before_total > limits.text_units or after_total > limits.text_units) return error.LimitExceeded;
                const next = try @import("../../text/utf8_utf16_splice.zig").replaceMany(a, before, group.edits, table_limits.max_bytes, .{});
                defer a.free(next);
                _ = try table.replaceText(a, cell.row, cell.column, next, table_limits.max_bytes);
            },
        }
    }
    var changed = false;
    for (drafts, document.sections, source, 0..) |*slot, original, bytes, section| if (slot.*) |*draft| {
        var hosts: std.AutoHashMapUnmanaged(@import("created_table_anchor.zig").Host, usize) = .empty;
        defer hosts.deinit(a);
        for (original.paragraphs, 0..) |paragraph, index| {
            const host = try @import("created_table_anchor.zig").identity(paragraph);
            const found = try hosts.getOrPut(a, host);
            if (found.found_existing) return error.SourceBindingMismatch;
            found.value_ptr.* = index;
        }
        for (draft.tables.entries) |*entry| {
            const index = hosts.get(entry.anchor.host) orelse return error.MissingParagraphSource;
            if (mappings.get(.{ .section = section, .source = .{ .paragraph = index } })) |mapping|
                entry.anchor.unit = try mapping.map(entry.anchor.unit);
        }
        _ = try draft.tables.byteSize(table_limits.max_bytes);
        if (draft.tables.entries.len != 0) {
            const verified = try @import("created_table_section.zig").write(a, bytes, draft.section, &draft.tables, version, resources, table_limits);
            a.free(verified);
        }
        changed = changed or !@import("../../model/equality.zig").semantic(model.Section, original, draft.section) or !pending[section].equals(&draft.tables);
    };
    if (!changed) return false;
    // Every allocation, source/table validation and anchor rebase is finished.
    // The drafts take ownership of the old state; publication cannot fail.
    for (drafts, 0..) |*slot, section| if (slot.*) |*draft| {
        std.mem.swap(model.Section, &document.sections[section], &draft.section);
        std.mem.swap(Values, &pending[section], &draft.tables);
    };
    return true;
}
