//! Read-only correspondence between live typed owners and the canonical saved
//! view. No creation/edit eligibility, live promotion, Session swap or writer
//! authority is issued. Every pending table uses the actual serializer receipt.
const std = @import("std");
const editor = @import("editor_session.zig");
const catalog = @import("document_text_inventory.zig");
const receipts_mod = @import("created_table_placement_receipts.zig");
const fields = @import("table_xml_fields.zig");
const Cell = @import("../model/document_text_snapshot.zig").Cell;
pub const Owner = union(enum) { source: usize, cell: Cell };
const TableKey = struct { section: usize, instance: u32 };
const Table = struct {
    section: usize,
    entry: *const @import("created_table_values.zig").Entry,
    placement: receipts_mod.Record,
    host: usize,
    matched: bool = false,
};
pub const Proof = struct {
    arena: std.heap.ArenaAllocator,
    owners: []const []const Owner,
    /// Canonical saved UTF-16 units of pending anchors, indexed by section and
    /// current source paragraph. Read provenance, never a write capability.
    pending_positions: []const []const []const u32,
    source_pointer: [*]u8,
    saved_pointer: [*]u8,
    serial: u64,
    pub fn deinit(self: *Proof) void {
        self.arena.deinit();
        self.* = undefined;
    }
    pub fn assertCurrent(self: *const Proof, live: *const editor.Session, saved: *const editor.Session) !void {
        if (live.source.ptr != self.source_pointer or live.mutation_serial != self.serial or
            saved.source.ptr != self.saved_pointer or live.sections.len != self.owners.len or
            saved.sections.len != self.owners.len) return error.StaleDocumentTextSnapshot;
    }
};

pub fn verify(a: std.mem.Allocator, live: *const editor.Session, saved: *const editor.Session, inventory: *const catalog.Inventory, receipts: *const receipts_mod.Receipts) !Proof {
    try inventory.assertCurrent(live);
    if (live.sections.len != saved.sections.len) return error.SourceBindingMismatch;
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const owned = arena.allocator();
    var records: std.AutoHashMapUnmanaged(u64, receipts_mod.Record) = .empty;
    for (receipts.items.items) |record| {
        const slot = try records.getOrPut(owned, record.identity);
        if (slot.found_existing) return error.SourceBindingMismatch;
        slot.value_ptr.* = record;
    }
    var tables: std.AutoHashMapUnmanaged(TableKey, Table) = .empty;
    var identities: std.AutoHashMapUnmanaged(u64, void) = .empty;
    for (live.sections, inventory.sections, 0..) |section, rows, section_index| for (section.created_tables.entries.items) |*entry| {
        if (entry.table.identity == 0 or entry.table.instance_id == 0 or
            (try identities.getOrPut(owned, entry.table.identity)).found_existing) return error.InvalidCreatedTableIdentity;
        const record = records.get(entry.table.identity) orelse return error.SourceBindingMismatch;
        const host = rows.references.get(entry.anchor.paragraph) orelse return error.MissingCurrentParagraphReference;
        if (entry.anchor.section != section_index or record.section != section_index or
            !std.meta.eql(record.host_reference, entry.anchor.paragraph) or record.source_unit != entry.anchor.unit or
            record.current_host != try std.math.add(usize, section.first_paragraph, host)) return error.SourceBindingMismatch;
        const slot = try tables.getOrPut(owned, .{ .section = section_index, .instance = entry.table.instance_id });
        if (slot.found_existing) return error.InvalidCreatedTableIdentity;
        slot.value_ptr.* = .{ .section = section_index, .entry = entry, .placement = record, .host = host };
    };
    if (tables.count() != records.count()) return error.SourceBindingMismatch;
    const all_owners = try owned.alloc([]const Owner, live.sections.len);
    const all_pending = try owned.alloc([]const []const u32, live.sections.len);
    var matched: usize = 0;
    for (saved.sections, inventory.sections, all_owners, 0..) |*section, current, *out, section_index| {
        const pending_positions = try owned.alloc([]const u32, current.sources.len);
        @memset(pending_positions, &.{});
        all_pending[section_index] = pending_positions;
        if (section.structure_values != null or section.created_tables.entries.items.len != 0) return error.SourceBindingMismatch;
        var physical = try @import("display_current_paragraphs.zig").read(a, section, saved.options);
        defer physical.deinit(a);
        var by_node: std.AutoHashMapUnmanaged(usize, usize) = .empty;
        for (physical.paragraphs, 0..) |paragraph, index| {
            const slot = try by_node.getOrPut(owned, paragraph.template_element);
            if (slot.found_existing) return error.SourceBindingMismatch;
            slot.value_ptr.* = index;
        }
        var roots: std.AutoHashMapUnmanaged(usize, *const Table) = .empty;
        var cells: std.AutoHashMapUnmanaged(usize, Cell) = .empty;
        for (section.tree.elements, 0..) |_, node| {
            if (!fields.childIs(&section.tree, node, "tbl")) continue;
            const instance = (try fields.optionalUnsigned(a, &section.tree, node, "id", 4096)) orelse continue;
            const expected = tables.getPtr(.{ .section = section_index, .instance = instance }) orelse continue;
            if (expected.matched or section.tree.elements[node].start_tag.start != expected.placement.table_start) return error.SourceBindingMismatch;
            const canonical = try @import("created_table_xml.zig").write(a, &expected.entry.table, live.options.max_xml_bytes);
            defer a.free(canonical);
            if (!std.mem.eql(u8, canonical, section.tree.sourceOf(node))) return error.SourceBindingMismatch;
            expected.matched = true;
            matched += 1;
            try roots.put(owned, node, expected);
            var count: usize = 0;
            var row_node = section.tree.elements[node].first_child;
            while (row_node) |row| : (row_node = section.tree.elements[row].next_sibling) {
                if (!fields.childIs(&section.tree, row, "tr")) continue;
                var cell_node = section.tree.elements[row].first_child;
                while (cell_node) |cell| : (cell_node = section.tree.elements[cell].next_sibling) {
                    if (!fields.childIs(&section.tree, cell, "tc")) continue;
                    const geometry = try @import("table_display_cell.zig").read(a, &section.tree, cell);
                    const r = geometry.row orelse return error.SourceBindingMismatch;
                    const c = geometry.column orelse return error.SourceBindingMismatch;
                    _ = try expected.entry.table.plan.cell(r, c);
                    const index = try std.math.add(usize, try std.math.mul(usize, r, expected.entry.table.plan.columns), c);
                    if (index >= expected.entry.table.cells.len) return error.SourceBindingMismatch;
                    const list = geometry.sub_list orelse return error.SourceBindingMismatch;
                    const paragraph = section.tree.elements[list].first_child orelse return error.SourceBindingMismatch;
                    if (!fields.childIs(&section.tree, paragraph, "p") or section.tree.elements[paragraph].next_sibling != null or
                        (try fields.optionalUnsigned(a, &section.tree, paragraph, "id", 4096)) != expected.entry.table.cells[index].paragraph_id)
                        return error.SourceBindingMismatch;
                    const slot = try cells.getOrPut(owned, paragraph);
                    if (slot.found_existing) return error.SourceBindingMismatch;
                    slot.value_ptr.* = .{ .identity = expected.entry.table.identity, .row = r, .column = c };
                    count += 1;
                }
            }
            if (count != expected.entry.table.cells.len) return error.SourceBindingMismatch;
        }
        const pending = try owned.alloc(bool, section.tree.elements.len);
        for (section.tree.elements, 0..) |element, node| {
            if (element.parent) |parent| if (parent >= node) return error.SourceBindingMismatch;
            const inherited = if (element.parent) |parent| pending[parent] else false;
            if (inherited and roots.contains(node)) return error.SourceBindingMismatch;
            pending[node] = inherited or roots.contains(node);
        }
        const owners = try owned.alloc(Owner, physical.paragraphs.len);
        var source_index: usize = 0;
        var cell_count: usize = 0;
        for (physical.paragraphs, owners) |paragraph, *owner| {
            if (pending[paragraph.template_element]) {
                owner.* = .{ .cell = cells.get(paragraph.template_element) orelse return error.SourceBindingMismatch };
                cell_count += 1;
            } else {
                if (source_index >= current.sources.len) return error.SourceBindingMismatch;
                owner.* = .{ .source = source_index };
                source_index += 1;
            }
        }
        if (source_index != current.sources.len or cell_count != current.cells.len) return error.IncompleteDocumentTextSnapshot;
        // Group by actual physical host and verify the emitted anchor units once
        // per host. No editable-owner predicate is used for this read proof.
        var hosts: std.AutoHashMapUnmanaged(usize, std.AutoHashMapUnmanaged(usize, *const Table)) = .empty;
        var root_it = roots.iterator();
        while (root_it.next()) |entry| {
            const run = section.tree.elements[entry.key_ptr.*].parent orelse return error.SourceBindingMismatch;
            const host_node = section.tree.elements[run].parent orelse return error.SourceBindingMismatch;
            if (!fields.childIs(&section.tree, run, "run") or !fields.childIs(&section.tree, host_node, "p")) return error.SourceBindingMismatch;
            const host_index = by_node.get(host_node) orelse return error.SourceBindingMismatch;
            if (owners[host_index] != .source or owners[host_index].source != entry.value_ptr.*.host) return error.SourceBindingMismatch;
            const group = try hosts.getOrPut(owned, host_index);
            if (!group.found_existing) group.value_ptr.* = .empty;
            try group.value_ptr.put(owned, entry.key_ptr.*, entry.value_ptr.*);
        }
        var host_it = hosts.iterator();
        while (host_it.next()) |group| {
            const paragraph = &physical.paragraphs[group.key_ptr.*];
            const segments = try @import("document_text_read_projection.zig").build(a, &section.tree, paragraph);
            defer a.free(segments);
            var positions: std.ArrayList(u32) = .empty;
            var removed: usize = 0;
            for (segments) |segment| {
                if (segment.kind != .anchor) continue;
                const table = group.value_ptr.get(segment.index) orelse continue;
                if (segment.end_unit != segment.start_unit + 1 or segment.start_unit != table.placement.saved_unit or
                    segment.start_unit < removed or segment.start_unit - removed != table.placement.current_unit) return error.SourceBindingMismatch;
                try positions.append(owned, std.math.cast(u32, segment.start_unit) orelse return error.LimitExceeded);
                removed += 1;
            }
            if (removed != group.value_ptr.count()) return error.SourceBindingMismatch;
            pending_positions[owners[group.key_ptr.*].source] = try positions.toOwnedSlice(owned);
        }
        out.* = owners;
    }
    if (matched != tables.count()) return error.SourceBindingMismatch;
    try inventory.assertCurrent(live);
    return .{ .arena = arena, .owners = all_owners, .pending_positions = all_pending, .source_pointer = live.source.ptr, .saved_pointer = saved.source.ptr, .serial = live.mutation_serial };
}
