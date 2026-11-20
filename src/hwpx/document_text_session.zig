//! Prepare source and typed pending-cell values together. The existing History
//! remains the only live mutation owner. No pending model is hidden, serialized
//! into a replacement live Session, or granted legacy setter authority.
const std = @import("std");
const editor = @import("editor_session.zig");
const snapshot_mod = @import("document_text_snapshot.zig");
const model = @import("../model/document_text_snapshot.zig");
const intent_mod = @import("../model/document_replace_all.zig");
const source_mod = @import("document_text_source_publication.zig");
const cells_mod = @import("created_cell_text_batch.zig");
const Mapping = @import("../model/protected_points_batch.zig").Mapping;
const Key = struct { section: usize, source: model.Source };
const SourceKey = struct { section: usize, paragraph: usize };

pub const Prepared = struct {
    source: source_mod.Publication,
    cells: cells_mod.Prepared,
    changed: bool,
    consumed: bool = false,
    pub fn deinit(self: *Prepared) void {
        self.cells.deinit();
        self.source.deinit();
        self.* = undefined;
    }
    /// History has already reserved one entry and owns rollback. All allocation,
    /// expected-text, source, anchor and serialization checks precede this swap.
    pub fn commit(self: *Prepared) !bool {
        if (self.consumed) return error.StaleDocumentTextPublication;
        const live = self.source.owner;
        if (!live.history_transaction_active) return error.IndependentTextRequiresHistory;
        try self.source.validateCurrent(live);
        try self.cells.validateCurrent(live);
        self.consumed = true;
        if (!self.changed) return false;
        for (live.sections, self.source.sections, self.cells.sections) |*section, *source_slot, *cell_slot| {
            if (source_slot.*) |*source| {
                std.mem.swap(?@import("paragraph_structure_values.zig").Values, &section.structure_values, &source.values);
                std.mem.swap(@import("text_sites.zig").Sites, &section.sites, &source.sites);
            }
            if (cell_slot.*) |*cells| if (cells.changed)
                std.mem.swap(@import("created_table_values.zig").Values, &section.created_tables, &cells.values);
        }
        return true;
    }
};

pub fn prepare(session: *editor.Session, observation: *const snapshot_mod.Observation, intent: *const intent_mod.Plan) !Prepared {
    try observation.assertCurrent(session);
    const a = session.allocator;
    const limits = @import("../model/text_transaction.zig").limits;
    if (intent.groups.len > limits.groups) return error.LimitExceeded;
    var admission_edits: usize = 0;
    var admission_bytes: usize = 0;
    for (intent.groups) |group| {
        if (group.edits.len > limits.edits_count - admission_edits) return error.LimitExceeded;
        admission_edits += group.edits.len;
        for (group.edits) |edit| {
            if (edit.text.len > limits.inserted_bytes - admission_bytes) return error.LimitExceeded;
            admission_bytes += edit.text.len;
        }
    }
    if (try @import("document_text_field_source.zig").prepare(session, observation, intent)) |candidate| {
        var source = candidate;
        errdefer source.deinit();
        var cells = try cells_mod.prepare(a, session, &.{});
        errdefer cells.deinit();
        var expected: std.AutoHashMapUnmanaged(Key, []u8) = .empty;
        defer {
            var texts = expected.valueIterator();
            while (texts.next()) |value| a.free(value.*);
            expected.deinit(a);
        }
        for (intent.groups) |group| {
            const key: Key = .{ .section = group.row.section, .source = group.row.source };
            if (expected.contains(key)) return error.DuplicateTextTransactionTarget;
            const text = try @import("../text/utf8_utf16_splice.zig").replaceMany(a, group.row.text, group.edits, session.options.max_text_bytes, .{});
            errdefer a.free(text);
            try expected.put(a, key, text);
        }
        const sections = try a.dupe(editor.Section, session.sections);
        defer a.free(sections);
        var changed = false;
        var total_bytes: usize = 0;
        for (sections, source.sections) |*section, slot| {
            section.paragraph_query_cache = null;
            if (slot) |prepared| {
                section.structure_values = prepared.values;
                section.sites = prepared.sites;
                changed = true;
            }
            total_bytes = std.math.add(usize, total_bytes, try section.textBytes(session.options.max_text_bytes -| total_bytes)) catch return error.LimitExceeded;
        }
        var after = session.*;
        after.sections = sections;
        after.header_read_context = null;
        after.formatting_batch = null;
        try verifyAfter(a, &after, &expected);
        try observation.assertCurrent(session);
        try source.validateCurrent(session);
        try cells.validateCurrent(session);
        return .{ .source = source, .cells = cells, .changed = changed };
    }
    if (intent.groups.len > limits.groups) return error.LimitExceeded;
    var inventory = try @import("document_text_inventory.zig").read(a, session);
    defer inventory.deinit();
    var context = try @import("independent_text_session.zig").Context.initForDocument(session, observation);
    defer context.deinit();
    var cell_groups: std.ArrayList(cells_mod.Group) = .empty;
    defer cell_groups.deinit(a);
    var expected: std.AutoHashMapUnmanaged(Key, []u8) = .empty;
    defer {
        var texts = expected.valueIterator();
        while (texts.next()) |value| a.free(value.*);
        expected.deinit(a);
    }
    var mappings: std.AutoHashMapUnmanaged(SourceKey, Mapping) = .empty;
    defer {
        var values = mappings.valueIterator();
        while (values.next()) |value| value.deinit(a);
        mappings.deinit(a);
    }
    var edit_count: usize = 0;
    var inserted_bytes: usize = 0;
    for (intent.groups) |group| {
        if (group.edits.len > limits.edits_count - edit_count) return error.LimitExceeded;
        edit_count += group.edits.len;
        for (group.edits) |edit| {
            if (edit.text.len > limits.inserted_bytes - inserted_bytes) return error.LimitExceeded;
            inserted_bytes += edit.text.len;
        }
        // A fresh Native planner supplies all rows. Even internal callers must
        // not splice in a row borrowed from another snapshot or duplicate one.
        const row = try observation.snapshot.rowFor(group.row.ref);
        if (row != group.row or row.section >= session.sections.len) return error.SourceBindingMismatch;
        const key: Key = .{ .section = row.section, .source = row.source };
        if (expected.contains(key)) return error.DuplicateTextTransactionTarget;
        const text = try @import("../text/utf8_utf16_splice.zig").replaceMany(a, row.text, group.edits, session.options.max_text_bytes, .{});
        var retained = false;
        defer if (!retained) a.free(text);
        try expected.put(a, key, text);
        retained = true;
        switch (row.source) {
            .paragraph => |index| {
                if (index >= inventory.sections[row.section].sources.len or
                    index >= observation.pending_positions[row.section].len) return error.SourceBindingMismatch;
                const ordinal = try std.math.add(usize, session.sections[row.section].first_paragraph, index);
                const current = try context.documentText(row.section, ordinal);
                defer a.free(current);
                const edits = try @import("document_text_source_axis.zig").map(a, row.text, current, observation.pending_positions[row.section][index], group.edits);
                defer a.free(edits);
                _ = try context.apply(row.section, ordinal, edits);
                var mapping = try @import("../model/protected_points_batch.zig").prepare(a, try @import("../model/independent_text_edits.zig").utf16Units(current), edits);
                errdefer mapping.deinit(a);
                try mappings.put(a, .{ .section = row.section, .paragraph = index }, mapping);
            },
            .created_cell => |cell| try cell_groups.append(a, .{ .section = row.section, .identity = cell.identity, .row = cell.row, .column = cell.column, .before_units = try @import("../model/independent_text_edits.zig").utf16Units(row.text), .edits = group.edits }),
        }
    }
    var cells = try cells_mod.prepare(a, session, cell_groups.items);
    errdefer cells.deinit();
    var source = try context.takeDocumentPublication();
    errdefer source.deinit();
    var changed = false;
    for (session.sections, source.sections, 0..) |*live, source_slot, section_index| {
        if (source_slot == null) continue;
        changed = true;
        if (live.created_tables.entries.items.len == 0) continue;
        const candidate = try cells.cloneSection(section_index);
        for (candidate.values.entries.items) |*entry| {
            const host = inventory.sections[section_index].references.get(entry.anchor.paragraph) orelse return error.MissingCurrentParagraphReference;
            if (mappings.get(.{ .section = section_index, .paragraph = host })) |mapping| {
                const point = try mapping.map(entry.anchor.unit);
                candidate.changed = candidate.changed or point != entry.anchor.unit;
                entry.anchor.unit = point;
            }
        }
    }
    for (cells.sections) |slot| if (slot) |section| {
        changed = changed or section.changed;
    };
    try source.validateCurrent(session);
    try cells.validateCurrent(session);
    // Borrow immutable ZIP/XML/resources; substitute only owned private source
    // and pending candidates. Never deinit this Session view or mutate its owner.
    const sections = try a.dupe(editor.Section, session.sections);
    defer a.free(sections);
    for (sections, source.sections, cells.sections) |*section, source_slot, cell_slot| {
        section.paragraph_query_cache = null;
        if (source_slot) |candidate| {
            section.structure_values = candidate.values;
            section.sites = candidate.sites;
        }
        if (cell_slot) |candidate| section.created_tables = candidate.values;
    }
    var after = session.*;
    after.sections = sections;
    after.header_read_context = null;
    after.formatting_batch = null;
    try verifyAfter(a, &after, &expected);
    try observation.assertCurrent(session);
    try source.validateCurrent(session);
    try cells.validateCurrent(session);
    return .{ .source = source, .cells = cells, .changed = changed };
}

fn verifyAfter(a: std.mem.Allocator, after: *const editor.Session, expected: *const std.AutoHashMapUnmanaged(Key, []u8)) !void {
    var inventory = try @import("document_text_inventory.zig").read(a, after);
    defer inventory.deinit();
    var receipts: @import("created_table_placement_receipts.zig").Receipts = .{};
    defer receipts.deinit(a);
    const bytes = try after.saveWithTablePlacements(&receipts);
    defer a.free(bytes);
    var saved = try editor.open(a, bytes, after.options);
    defer saved.deinit();
    var proof = try @import("created_table_read_placements.zig").verify(a, after, &saved, &inventory, &receipts);
    defer proof.deinit();
    var checked: usize = 0;
    for (saved.sections, proof.owners, 0..) |*section, owners, section_index| {
        var physical = try @import("display_current_paragraphs.zig").read(a, section, saved.options);
        defer physical.deinit(a);
        if (physical.paragraphs.len != owners.len) return error.IncompleteDocumentTextSnapshot;
        const read_limits = try @import("document_text_read_options.zig").fromSession(saved.options);
        var read_context = try @import("control_text_read_context.zig").Context.init(a, &section.tree, physical.paragraphs, read_limits);
        defer read_context.deinit();
        for (physical.paragraphs, owners, 0..) |*paragraph, owner, current_index| {
            const source: model.Source = switch (owner) {
                .source => |index| .{ .paragraph = index },
                .cell => |cell| .{ .created_cell = cell },
            };
            const wanted = expected.get(.{ .section = section_index, .source = source }) orelse continue;
            const observed = try read_context.copyVisibleText(a, current_index, paragraph.template_element, read_limits.max_bytes);
            defer a.free(observed);
            if (!std.mem.eql(u8, wanted, observed)) return error.DocumentTextAfterMismatch;
            checked += 1;
        }
    }
    if (checked != expected.count()) return error.IncompleteDocumentTextSnapshot;
    try inventory.assertCurrent(after);
    try proof.assertCurrent(after, &saved);
}
