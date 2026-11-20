//! Transaction-local proof that typed pending table owners have exact physical
//! counterparts. Does not mutate, clear or duplicate any live table/text owner.
const std = @import("std");
const editor = @import("editor_session.zig");
const fields = @import("table_xml_fields.zig");
const receipts_mod = @import("created_table_placement_receipts.zig");
const Tree = @import("xml_part_tree.zig").Tree;

pub const Physical = struct { section: usize, table: usize, placement: receipts_mod.Record };
pub const Proof = struct {
    a: std.mem.Allocator,
    // Logical identity remains distinct from the source instance id/node.
    owners: std.AutoHashMap(u64, Physical),
    pub fn deinit(self: *Proof) void {
        self.owners.deinit();
        self.* = undefined;
    }
};

/// Linear inventories plus the existing per-host position SSOT's ordering.
/// Exact comparison delegates cell layout,
/// resource ids, paragraph ids and text encoding to the sole table serializer.
/// Every pending owner must match once; duplicate physical IDs reject.
pub fn verify(live: *const editor.Session, saved: *const editor.Session, receipts: *const receipts_mod.Receipts) !Proof {
    if (live.sections.len != saved.sections.len) return error.SourceBindingMismatch;
    const a = live.allocator;
    var proof: Proof = .{ .a = a, .owners = .init(a) };
    errdefer proof.deinit();
    var records = std.AutoHashMap(u64, receipts_mod.Record).init(a);
    defer records.deinit();
    for (receipts.items.items) |record| {
        const slot = try records.getOrPut(record.identity);
        if (slot.found_existing) return error.SourceBindingMismatch;
        slot.value_ptr.* = record;
    }
    for (live.sections, saved.sections, 0..) |*before, *after, section| {
        if (before.created_tables.entries.items.len == 0) continue;
        var expected = std.AutoHashMap(u32, *const @import("created_table_values.zig").Entry).init(a);
        defer expected.deinit();
        for (before.created_tables.entries.items) |*entry| {
            const slot = try expected.getOrPut(entry.table.instance_id);
            if (slot.found_existing) return error.SourceBindingMismatch;
            slot.value_ptr.* = entry;
        }
        var matched = std.AutoHashMap(u32, void).init(a);
        defer matched.deinit();
        for (after.tree.elements, 0..) |_, node| {
            if (!fields.childIs(&after.tree, node, "tbl")) continue;
            const id = try tableId(a, &after.tree, node) orelse continue;
            const entry = expected.get(id) orelse continue;
            if ((try matched.getOrPut(id)).found_existing) return error.SourceBindingMismatch;
            const xml = try @import("created_table_xml.zig").write(a, &entry.table, live.options.max_xml_bytes);
            defer a.free(xml);
            if (!std.mem.eql(u8, xml, after.tree.sourceOf(node))) return error.SourceBindingMismatch;
            const owner = try proof.owners.getOrPut(entry.table.identity);
            if (owner.found_existing) return error.SourceBindingMismatch;
            const placement = records.get(entry.table.identity) orelse return error.SourceBindingMismatch;
            if (placement.section != section or entry.anchor.section != section or
                !std.meta.eql(placement.host_reference, entry.anchor.paragraph) or placement.source_unit != entry.anchor.unit or
                placement.table_start != after.tree.elements[node].start_tag.start) return error.SourceBindingMismatch;
            owner.value_ptr.* = .{ .section = section, .table = node, .placement = placement };
        }
        if (matched.count() != expected.count()) return error.SourceBindingMismatch;
        try verifyHosts(a, before, after, section, live.options, saved.options, &proof);
    }
    if (proof.owners.count() != records.count()) return error.SourceBindingMismatch;
    return proof;
}

fn tableId(a: std.mem.Allocator, tree: *const Tree, node: usize) !?u32 {
    const value = try tree.attributeValue(a, node, "", "id") orelse return null;
    const text = try value.toUtf8(a, 4096);
    defer a.free(text);
    return @import("xml_values.zig").unsigned32(text) catch null;
}
const ReferenceKey = struct { generated: bool, value: usize };
fn referenceKey(reference: @import("current_paragraph_reference.zig").Reference) ReferenceKey {
    return switch (reference) {
        .source_ordinal => |value| .{ .generated = false, .value = value },
        .generated_id => |value| .{ .generated = true, .value = value },
    };
}

fn verifyHosts(a: std.mem.Allocator, before: *const editor.Section, after: *const editor.Section, section: usize, before_options: editor.Options, after_options: editor.Options, proof: *const Proof) !void {
    var current = try @import("display_current_paragraphs.zig").read(a, before, before_options);
    defer current.deinit(a);
    var physical = try @import("display_current_paragraphs.zig").read(a, after, after_options);
    defer physical.deinit(a);
    var refs = std.AutoHashMap(ReferenceKey, usize).init(a);
    defer refs.deinit();
    for (current.paragraphs, 0..) |*p, index| {
        const slot = try refs.getOrPut(referenceKey(try @import("current_paragraph_reference.zig").from(p)));
        if (slot.found_existing) return error.SourceBindingMismatch;
        slot.value_ptr.* = index;
    }
    var roots = std.AutoHashMap(usize, u64).init(a);
    defer roots.deinit();
    for (before.created_tables.entries.items) |entry| {
        const owner = proof.owners.get(entry.table.identity) orelse return error.SourceBindingMismatch;
        if (owner.section != section) return error.SourceBindingMismatch;
        try roots.put(owner.table, entry.table.identity);
    }
    const excluded = try a.alloc(bool, after.tree.elements.len);
    defer a.free(excluded);
    for (after.tree.elements, 0..) |element, node| {
        if (element.parent) |parent| if (parent >= node) return error.SourceBindingMismatch;
        excluded[node] = roots.contains(node) or (if (element.parent) |parent| excluded[parent] else false);
    }
    var original_rows = std.AutoHashMap(usize, usize).init(a);
    defer original_rows.deinit();
    var ordinals = std.AutoHashMap(usize, usize).init(a);
    defer ordinals.deinit();
    var count: usize = 0;
    for (physical.paragraphs, 0..) |p, index| {
        if (excluded[p.template_element]) continue;
        try original_rows.put(p.template_element, count);
        try ordinals.put(p.template_element, try std.math.add(usize, after.first_paragraph, index));
        count += 1;
    }
    if (count != current.paragraphs.len) return error.SourceBindingMismatch;
    var hosts = std.AutoHashMap(usize, std.ArrayList(usize)).init(a);
    defer {
        var groups = hosts.valueIterator();
        while (groups.next()) |group| group.deinit(a);
        hosts.deinit();
    }
    for (before.created_tables.entries.items) |entry| {
        const owner = proof.owners.get(entry.table.identity).?;
        const run = after.tree.elements[owner.table].parent orelse return error.SourceBindingMismatch;
        const host = after.tree.elements[run].parent orelse return error.SourceBindingMismatch;
        if (!fields.childIs(&after.tree, run, "run") or !fields.childIs(&after.tree, host, "p")) return error.SourceBindingMismatch;
        try @import("source_table_grid_owner_path.zig").admitCacheParagraph(&after.tree, host);
        const expected = refs.get(referenceKey(entry.anchor.paragraph)) orelse return error.SourceBindingMismatch;
        if ((original_rows.get(host) orelse return error.SourceBindingMismatch) != expected or
            owner.placement.current_host != try std.math.add(usize, before.first_paragraph, expected)) return error.SourceBindingMismatch;
        const ordinal = ordinals.get(host) orelse return error.SourceBindingMismatch;
        const slot = try hosts.getOrPut(ordinal);
        if (!slot.found_existing) slot.value_ptr.* = .empty;
    }
    if (after.sites.items.len != after.locations.len or after.structure_values != null) return error.SourceBindingMismatch;
    for (after.locations, 0..) |location, index| if (hosts.getPtr(location.paragraph_ordinal)) |group| try group.append(a, index);
    var observed: usize = 0;
    var groups = hosts.iterator();
    while (groups.next()) |group| {
        // Borrow text strings; own/free only the temporary index projection.
        const sites = try a.alloc(@import("text_sites.zig").Site, group.value_ptr.items.len);
        defer a.free(sites);
        const locations = try a.alloc(@import("section_text.zig").Location, sites.len);
        defer a.free(locations);
        for (group.value_ptr.items, 0..) |index, local| {
            sites[local] = after.sites.items[index];
            locations[local] = after.locations[index];
        }
        const view: @import("text_sites.zig").Sites = .{ .items = sites };
        const segments = try @import("anchor_text_positions.zig").build(a, &after.tree, &view, locations, group.key_ptr.*);
        defer a.free(segments);
        var removed: usize = 0;
        for (segments) |segment| {
            if (segment.kind != .anchor) continue;
            const identity = roots.get(segment.index) orelse continue;
            const owner = proof.owners.get(identity).?;
            if (segment.start_unit != owner.placement.saved_unit or segment.end_unit != segment.start_unit + 1 or
                segment.start_unit < removed or segment.start_unit - removed != owner.placement.current_unit) return error.SourceBindingMismatch;
            removed += 1;
            observed += 1;
        }
    }
    if (observed != roots.count()) return error.SourceBindingMismatch;
}

/// Resolve only after verify(), using the live logical identity and typed cell
/// coordinates. No guessed projected/global paragraph index is accepted here.
pub fn cell(live: *const editor.Session, saved: *const editor.Session, proof: *const Proof, section: usize, identity: u64, row: u32, column: u32) !usize {
    if (section >= live.sections.len or section >= saved.sections.len) return error.InvalidSectionIndex;
    const physical = proof.owners.get(identity) orelse return error.InvalidCreatedTableIdentity;
    if (physical.section != section) return error.SourceBindingMismatch;
    var table: ?*const @import("../model/created_table.zig").Table = null;
    for (live.sections[section].created_tables.entries.items) |*entry| {
        if (entry.table.identity == identity) {
            if (table != null) return error.SourceBindingMismatch;
            table = &entry.table;
        }
    }
    const typed = table orelse return error.InvalidCreatedTableIdentity;
    if (row >= typed.plan.rows or column >= typed.plan.columns) return error.InvalidTableCellIndex;
    const paragraph_id = typed.cells[@as(usize, row) * typed.plan.columns + column].paragraph_id;
    const tree = &saved.sections[section].tree;
    var found: ?usize = null;
    // The exact serializer proof establishes one paragraph per typed cell.
    // Still verify the resolved paragraph's direct physical owner explicitly.
    var node = tree.elements[physical.table].first_child;
    while (node) |index| : (node = tree.elements[index].next_sibling) {
        if (!fields.childIs(tree, index, "tr")) continue;
        var next = tree.elements[index].first_child;
        while (next) |tc| : (next = tree.elements[tc].next_sibling) {
            if (!fields.childIs(tree, tc, "tc")) continue;
            const display = try @import("table_display_cell.zig").read(live.allocator, tree, tc);
            if (display.row != row or display.column != column) continue;
            const list = display.sub_list orelse return error.SourceBindingMismatch;
            const p = tree.elements[list].first_child orelse return error.SourceBindingMismatch;
            if (!fields.childIs(tree, p, "p") or tree.elements[p].next_sibling != null or
                (try fields.optionalUnsigned(live.allocator, tree, p, "id", 4096)) != paragraph_id or found != null) return error.SourceBindingMismatch;
            try @import("inline_object_owner.zig").validate(live.allocator, tree, p);
            found = p;
        }
    }
    return found orelse error.SourceBindingMismatch;
}

/// A candidate may change only the selected physical paragraph. Other table
/// bytes, and the target table bytes outside that paragraph, must be identical.
pub fn verifyCandidate(before: *const editor.Session, after: *const editor.Session, proof: *const Proof, section: usize, paragraph: usize) !void {
    return verifyCandidateWithNote(before, after, proof, section, paragraph, null);
}
/// The only additional current paragraph is the independently issued note body.
pub fn verifyNoteCandidate(before: *const editor.Session, after: *const editor.Session, proof: *const Proof, section: usize, paragraph: usize, new_paragraph: usize) !void {
    return verifyCandidateWithNote(before, after, proof, section, paragraph, new_paragraph);
}
fn verifyCandidateWithNote(before: *const editor.Session, after: *const editor.Session, proof: *const Proof, section: usize, paragraph: usize, new_paragraph: ?usize) !void {
    if (before.sections.len != after.sections.len) return error.SourceBindingMismatch;
    if (proof.owners.count() == 0) return;
    if (section >= before.sections.len) return error.InvalidSectionIndex;
    var bv = try @import("display_current_paragraphs.zig").read(proof.a, &before.sections[section], before.options);
    defer bv.deinit(proof.a);
    var av = try @import("display_current_paragraphs.zig").read(proof.a, &after.sections[section], after.options);
    defer av.deinit(proof.a);
    if (try std.math.add(usize, bv.paragraphs.len, @intFromBool(new_paragraph != null)) != av.paragraphs.len or paragraph < before.sections[section].first_paragraph) return error.SourceBindingMismatch;
    const offset = paragraph - before.sections[section].first_paragraph;
    if (offset >= bv.paragraphs.len) return error.SourceBindingMismatch;
    const bp = bv.paragraphs[offset].template_element;
    var selected_after: ?usize = null;
    var old_index: usize = 0;
    var inserted_count: usize = 0;
    var inserted_host: ?usize = null;
    for (av.paragraphs) |p| {
        if (new_paragraph != null and p.template_element == new_paragraph.?) {
            const context = (try @import("note_paragraph_context.zig").read(&after.sections[section].tree, p.template_element)) orelse return error.SourceBindingMismatch;
            const structural = try @import("note_mutation_owner.zig").read(&after.sections[section].tree, context.note_node);
            if (structural.direct_paragraphs != 1) return error.SourceBindingMismatch;
            inserted_host = structural.paragraph_node;
            inserted_count += 1;
            continue;
        }
        if (old_index == offset) selected_after = p.template_element;
        old_index += 1;
    }
    if (inserted_count != @intFromBool(new_paragraph != null) or old_index != bv.paragraphs.len) return error.SourceBindingMismatch;
    const ap = selected_after orelse return error.SourceBindingMismatch;
    if (new_paragraph != null and inserted_host != ap) return error.SourceBindingMismatch;
    const Key = struct { section: usize, id: u32 };
    var index = std.AutoHashMap(Key, usize).init(proof.a);
    defer index.deinit();
    for (after.sections, 0..) |*part, part_index| for (part.tree.elements, 0..) |_, node| {
        if (!fields.childIs(&part.tree, node, "tbl")) continue;
        const id = try tableId(proof.a, &part.tree, node) orelse continue;
        const slot = try index.getOrPut(.{ .section = part_index, .id = id });
        // Only ambiguity of a transferred table is relevant. A sentinel keeps
        // pre-existing duplicate original ids from becoming a blanket refusal.
        slot.value_ptr.* = if (slot.found_existing) std.math.maxInt(usize) else node;
    };
    var iterator = proof.owners.valueIterator();
    while (iterator.next()) |physical| {
        const bt = &before.sections[physical.section].tree;
        const at = &after.sections[physical.section].tree;
        const id = (try tableId(proof.a, bt, physical.table)) orelse return error.SourceBindingMismatch;
        const after_node = index.get(.{ .section = physical.section, .id = id }) orelse return error.SourceBindingMismatch;
        if (after_node == std.math.maxInt(usize)) return error.SourceBindingMismatch;
        const before_bytes = bt.sourceOf(physical.table);
        const after_bytes = at.sourceOf(after_node);
        if (physical.section != section) {
            if (!std.mem.eql(u8, before_bytes, after_bytes)) return error.SourceBindingMismatch;
            continue;
        }
        const bstart = bt.elements[physical.table].start_tag.start;
        const astart = at.elements[after_node].start_tag.start;
        const selected = bt.elements[bp].start_tag.start >= bstart and bt.elements[bp].end <= bt.elements[physical.table].end;
        if (!selected) {
            if (!std.mem.eql(u8, before_bytes, after_bytes)) return error.SourceBindingMismatch;
        } else {
            if (at.elements[ap].start_tag.start < astart or at.elements[ap].end > at.elements[after_node].end) return error.SourceBindingMismatch;
            if (!std.mem.eql(u8, before_bytes[0 .. bt.elements[bp].start_tag.start - bstart], after_bytes[0 .. at.elements[ap].start_tag.start - astart]) or
                !std.mem.eql(u8, before_bytes[bt.elements[bp].end - bstart ..], after_bytes[at.elements[ap].end - astart ..])) return error.SourceBindingMismatch;
            const before_text = try literalText(proof.a, bt, bp, before.options.max_text_bytes);
            defer proof.a.free(before_text);
            const after_text = try literalText(proof.a, at, ap, after.options.max_text_bytes);
            defer proof.a.free(after_text);
            if (!std.mem.eql(u8, before_text, after_text)) return error.SourceBindingMismatch;
        }
    }
}

// Compare actual hp:t text, not display anchor text: a successful insertion
// deliberately adds new protected object anchors to the current display.
fn literalText(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, paragraph: usize, limit: usize) ![]u8 {
    var sites = try @import("text_sites.zig").collect(a, tree, .{ .max_text_bytes = limit });
    defer sites.deinit(a);
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(a);
    for (sites.items) |site| {
        const run = tree.elements[site.element_index].parent orelse continue;
        if (tree.elements[run].parent != paragraph or !fields.childIs(tree, site.element_index, "t")) continue;
        if (site.text.len > limit -| bytes.items.len) return error.LimitExceeded;
        try bytes.appendSlice(a, site.text);
    }
    return bytes.toOwnedSlice(a);
}
