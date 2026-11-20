//! Resolve live typed ownership into a freshly saved physical paragraph.
//! Temporary mapping only; no live materialization/reset or second text owner.
const std = @import("std");
const editor = @import("editor_session.zig");
const insert = @import("inline_object_insert.zig");
const transfer = @import("inline_object_table_transfer.zig");
const fields = @import("table_xml_fields.zig");
const Projection = struct { unit: u32, pending: bool };
pub const Resolved = struct {
    target: insert.Target,
    witness: []u8,
    pub fn deinit(self: *Resolved, a: std.mem.Allocator) void {
        a.free(self.witness);
        self.* = undefined;
    }
};

pub fn resolve(live: *const editor.Session, saved: *const editor.Session, proof: *const transfer.Proof, target: insert.Target) !Resolved {
    if (target.section >= live.sections.len or target.section >= saved.sections.len) return error.InvalidSectionIndex;
    const a = live.allocator;
    const before = &live.sections[target.section];
    const after = &saved.sections[target.section];
    var current = try @import("display_current_paragraphs.zig").read(a, before, live.options);
    defer current.deinit(a);
    var physical = try @import("display_current_paragraphs.zig").read(a, after, saved.options);
    defer physical.deinit(a);
    if (target.owner) |owner| try @import("inline_object_placement.zig").checkCurrent(live, target.section, target.paragraph, owner, target.expected_text);
    var selected: ?usize = null;
    if (target.owner != null and target.owner.?.kind == .createdCell) {
        const owner = target.owner.?;
        const node = try transfer.cell(live, saved, proof, target.section, try @import("../model/formatting_binding.zig").decimal(owner.identity.?), owner.row.?, owner.column.?);
        for (physical.paragraphs, 0..) |p, index| if (p.template_element == node) {
            if (selected != null) return error.SourceBindingMismatch;
            selected = index;
        };
    } else {
        if (target.paragraph < before.first_paragraph or target.paragraph - before.first_paragraph >= current.paragraphs.len) return error.InvalidParagraphIndex;
        const current_index = target.paragraph - before.first_paragraph;
        const template = current.paragraphs[current_index].template_element;
        try @import("inline_object_owner.zig").validate(a, &before.tree, template);
        const source_owner = try @import("table_display_owner.zig").resolve(a, &before.tree, template);
        // Legacy requests still denote a section0 body, never a guessed cell.
        if (target.owner == null and (target.section != 0 or source_owner != null)) return error.InlineObjectOwnerRequired;
        var pending = std.AutoHashMap(usize, void).init(a);
        defer pending.deinit();
        var owners = proof.owners.valueIterator();
        while (owners.next()) |owner| if (owner.section == target.section) try pending.put(owner.table, {});
        const excluded = try a.alloc(bool, after.tree.elements.len);
        defer a.free(excluded);
        for (after.tree.elements, 0..) |element, node| {
            if (element.parent) |parent| if (parent >= node) return error.SourceBindingMismatch;
            excluded[node] = pending.contains(node) or (if (element.parent) |parent| excluded[parent] else false);
        }
        var count: usize = 0;
        for (physical.paragraphs, 0..) |p, index| {
            if (excluded[p.template_element]) continue;
            if (count == current_index) selected = index;
            count += 1;
        }
        if (count != current.paragraphs.len) return error.SourceBindingMismatch;
        const p = physical.paragraphs[selected orelse return error.SourceBindingMismatch].template_element;
        const saved_owner = try @import("table_display_owner.zig").resolve(a, &after.tree, p);
        if ((source_owner == null) != (saved_owner == null)) return error.SourceBindingMismatch;
        if (source_owner) |source| {
            const destination = saved_owner.?;
            // Bind the same original table occurrence in the saved ordered XML,
            // excluding only generated tables whose exact serializer was proven.
            var original_rank: usize = 0;
            for (before.tree.elements[0..source.table_node], 0..) |_, node|
                if (fields.childIs(&before.tree, node, "tbl")) {
                    original_rank += 1;
                };
            var saved_rank: usize = 0;
            for (after.tree.elements[0..destination.table_node], 0..) |_, node|
                if (fields.childIs(&after.tree, node, "tbl") and !excluded[node]) {
                    saved_rank += 1;
                };
            if (original_rank != saved_rank or source.rows != destination.rows or source.columns != destination.columns or
                source.cell.row != destination.cell.row or source.cell.column != destination.cell.column or
                source.cell.row_span != destination.cell.row_span or source.cell.column_span != destination.cell.column_span) return error.SourceBindingMismatch;
            const old_id = try fields.optionalUnsigned(a, &before.tree, source.table_node, "id", 4096);
            const new_id = try fields.optionalUnsigned(a, &after.tree, destination.table_node, "id", 4096);
            if (old_id != new_id) return error.SourceBindingMismatch;
        }
    }
    const index = selected orelse return error.SourceBindingMismatch;
    const paragraph = try std.math.add(usize, after.first_paragraph, index);
    const text = try saved.anchorText(target.section, paragraph);
    errdefer a.free(text);
    const projected: Projection = if (target.owner != null and target.owner.?.kind == .createdCell) blk: {
        if (!std.mem.eql(u8, text, target.expected_text)) return error.InlineObjectTextMismatch;
        break :blk .{ .unit = target.unit, .pending = false };
    } else try projectPending(a, proof, target, text);
    try @import("inline_object_owner.zig").validate(a, &after.tree, physical.paragraphs[index].template_element);
    var result = target;
    result.paragraph = paragraph;
    result.physical_paragraph = physical.paragraphs[index].template_element;
    result.unit = projected.unit;
    result.expected_text = text;
    result.anchor_insertion = target.owner != null or projected.pending;
    result.owner = null; // Internal resolved target; public binding was checked above.
    return .{ .target = result, .witness = text };
}

// Remove only serializer-proven pending table anchor units for comparison. An
// existing object or literal U+FFFC is never mistaken for a pending table.
fn projectPending(a: std.mem.Allocator, proof: *const transfer.Proof, target: insert.Target, saved_text: []const u8) !Projection {
    var anchors = std.AutoHashMap(u32, @import("created_table_placement_receipts.zig").Record).init(a);
    defer anchors.deinit();
    var shift: u32 = 0;
    var entries = proof.owners.valueIterator();
    while (entries.next()) |owner| {
        const point = owner.placement;
        if (point.section != target.section or point.current_host != target.paragraph) continue;
        const slot = try anchors.getOrPut(point.saved_unit);
        if (slot.found_existing) return error.SourceBindingMismatch;
        slot.value_ptr.* = point;
        if (point.current_unit < target.unit or (point.current_unit == target.unit and target.affinity == .forward)) shift = try std.math.add(u32, shift, 1);
    }
    if (anchors.count() == 0) {
        if (!std.mem.eql(u8, saved_text, target.expected_text)) return error.InlineObjectTextMismatch;
        return .{ .unit = target.unit, .pending = false };
    }
    const scalars = @import("../xml/scalars.zig");
    var actual_at: usize = 0;
    var live_at: usize = 0;
    var actual_unit: u32 = 0;
    var live_unit: u32 = 0;
    var seen: usize = 0;
    while (try scalars.read(saved_text, actual_at, .utf8)) |actual| {
        const width: u32 = if (actual.value > 0xffff) 2 else 1;
        if (anchors.get(actual_unit)) |point| {
            if (actual.value != 0xfffc or point.current_unit != live_unit) return error.SourceBindingMismatch;
            seen += 1;
        } else {
            const original = (try scalars.read(target.expected_text, live_at, .utf8)) orelse return error.InlineObjectTextMismatch;
            if (original.value != actual.value) return error.InlineObjectTextMismatch;
            live_at = original.end;
            live_unit = try std.math.add(u32, live_unit, width);
        }
        actual_at = actual.end;
        actual_unit = try std.math.add(u32, actual_unit, width);
    }
    if (live_at != target.expected_text.len or seen != anchors.count()) return error.InlineObjectTextMismatch;
    _ = try @import("../image/image_insertion.zig").byteOffset(target.expected_text, target.unit);
    return .{ .unit = try std.math.add(u32, target.unit, shift), .pending = true };
}
