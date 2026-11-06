//! Atomic original-cell sparse style planning. Inventories are built once per batch.
const std = @import("std");
const editor = @import("editor_session.zig");
const cell = @import("table_cell_background_session.zig");
const border = @import("table_cell_border_session.zig");
const p = @import("../model/border_fill_patch.zig");
const resource = @import("border_fill_resource_patch.zig");
pub const Request = struct {
    section: usize,
    table_node: u32,
    list_node: u32,
    patch: p.Patch,
};
const Key = struct { section: usize, list: usize };

pub fn apply(session: *editor.Session, requests: []const Request) !bool {
    if (requests.len == 0) return false;
    if (requests.len > @import("../model/cell_edit_budget.zig").max_cells) return error.LimitExceeded;
    const a = session.allocator;
    var wanted = std.AutoHashMap(Key, usize).init(a);
    defer wanted.deinit();
    var sections = std.AutoHashMap(usize, void).init(a);
    defer sections.deinit();
    for (requests, 0..) |r, i| {
        try p.validate(r.patch);
        if (r.section >= session.sections.len) return error.InvalidSectionIndex;
        const entry = try wanted.getOrPut(.{ .section = r.section, .list = r.list_node });
        if (entry.found_existing) return error.DuplicateCellStyleTarget;
        entry.value_ptr.* = i;
        try sections.put(r.section, {});
    }
    // Include existing intents in the same binding inventory: no target() loop.
    for (session.cell_backgrounds.items) |entry| try sections.put(entry.section, {});
    var owners = std.AutoHashMap(Key, cell.Owner).init(a);
    defer owners.deinit();
    var section_it = sections.keyIterator();
    while (section_it.next()) |section| {
        if (section.* >= session.sections.len) return error.InvalidSectionIndex;
        const bindings = try @import("table_display_bindings.zig").read(a, session, section.*);
        defer a.free(bindings);
        for (bindings) |binding| {
            const owner = binding.owner;
            const key: Key = .{ .section = section.*, .list = owner.list_node };
            const slot = try owners.getOrPut(key);
            if (slot.found_existing) {
                if (slot.value_ptr.cell_node != owner.cell_node or slot.value_ptr.table_node != owner.table_node) return error.InvalidCellBackgroundOwner;
                continue;
            }
            if (wanted.contains(key)) try validateProtection(a, &session.sections[section.*].tree, owner.cell_node);
            const raw = (try session.sections[section.*].tree.attributeValue(a, owner.cell_node, "", "borderFillIDRef")) orelse return error.MissingBorderFillReference;
            slot.value_ptr.* = .{ .section = section.*, .table_node = owner.table_node, .cell_node = owner.cell_node, .list_node = owner.list_node, .source_id = try @import("table_xml_fields.zig").unsigned(a, raw, 4096) };
        }
    }
    var indices = std.AutoHashMap(Key, usize).init(a);
    defer indices.deinit();
    var candidate: cell.Values = .empty;
    defer candidate.deinit(a);
    try candidate.appendSlice(a, session.cell_backgrounds.items);
    for (candidate.items, 0..) |entry, i| {
        const key: Key = .{ .section = entry.section, .list = entry.list_node };
        const owner = owners.get(key) orelse return error.InvalidCellBackgroundOwner;
        if (owner.table_node != entry.table_node or owner.cell_node != entry.cell_node or owner.source_id != entry.source_id) return error.SourceBindingMismatch;
        try p.validate(cell.patch(entry));
        const slot = try indices.getOrPut(key);
        if (slot.found_existing) return error.InvalidCellBackgroundOwner;
        slot.value_ptr.* = i;
    }
    var document = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    var metadata = try @import("source_version_metadata.zig").readDocument(a, &document, .{});
    defer metadata.deinit(a);
    const profile = @import("source_color_profile.zig").classify(if (metadata.sourceVersion) |*v| v else null);
    if (!profile.verified) return error.UnsupportedCellBackgroundProfile;
    var header = try document.readHeaderTree(a, .{});
    defer header.deinit(a);
    var templates = std.AutoHashMap(u32, usize).init(a);
    defer templates.deinit();
    const head = @import("document_xml.zig").head_uri;
    var container: ?usize = null;
    for (header.elements, 0..) |element, node| {
        if (element.is(head, "borderFills")) {
            if (element.parent) |parent| {
                if (header.elements[parent].is(head, "refList") and header.elements[parent].parent == 0) {
                    if (container != null) return error.DuplicateBorderFills;
                    container = node;
                }
            }
        }
        if (!element.is(head, "borderFill")) continue;
        const parent = element.parent orelse continue;
        if (!header.elements[parent].is(head, "borderFills")) continue;
        const ancestor = header.elements[parent].parent orelse continue;
        if (!header.elements[ancestor].is(head, "refList") or header.elements[ancestor].parent != 0) continue;
        const slot = try templates.getOrPut(try resource.id(a, &header, node));
        if (slot.found_existing) return error.DuplicateBorderFillId;
        slot.value_ptr.* = node;
    }
    const parent = container orelse return error.MissingBorderFills;
    const declared = (try header.attributeValue(a, parent, "", "itemCnt")) orelse return error.MissingBorderFillCount;
    if (try @import("table_xml_fields.zig").unsigned(a, declared, 4096) != templates.count()) return error.BorderFillCountMismatch;
    const context = try namespaceContext(a, &header, parent);
    defer a.free(context);
    // Source observation is shared by selected-field mask; writer gates are
    // shared by the complete canonical patch, without hashing union padding.
    var observed = std.AutoHashMap([2]u32, p.Value).init(a);
    defer observed.deinit();
    var validated = std.AutoHashMap([32]u32, void).init(a);
    defer validated.deinit();
    var changed = false;
    for (requests) |r| {
        const key: Key = .{ .section = r.section, .list = r.list_node };
        const owner = owners.get(key) orelse return error.InvalidCellBackgroundOwner;
        if (owner.table_node != r.table_node) return error.InvalidCellBackgroundOwner;
        const node = templates.get(owner.source_id) orelse return error.MissingBorderFillId;
        var patch = r.patch;
        var mask: [4]bool = @splat(false);
        var bits: u32 = if (patch.background != null) 16 else 0;
        for (patch.border.edges, 0..) |edge, i| {
            mask[i] = edge != null;
            if (mask[i]) bits |= @as(u32, 1) << @intCast(i);
        }
        const observation = try observed.getOrPut(.{ owner.source_id, bits });
        if (!observation.found_existing) observation.value_ptr.* = try @import("border_fill_xml_patch.zig").observeSelected(a, &header, node, profile, mask, patch.background != null);
        const source = observation.value_ptr.*;
        const found = indices.get(key);
        const before: cell.Entry = if (found) |i| candidate.items[i] else .{ .section = r.section, .table_node = r.table_node, .cell_node = owner.cell_node, .list_node = r.list_node, .source_id = owner.source_id };
        var next = before;
        next.border = border.normalized(before.border, patch, source);
        if (patch.background != null) {
            const original = source.background orelse return error.UnsupportedCellBackgroundContents;
            // A solid request without hatch_color retains the CURRENT effective
            // hatch color, including a preceding pending hatch/solid intent.
            const current = p.merge(.{ .background = original }, cell.patch(before)).background.?;
            const pending = p.merge(.{ .background = current }, .{ .background = patch.background }).background.?;
            // The existing XML writer retains source hatchColor when a solid
            // still has no explicit foreground (e.g. after none/linear).
            const resolved = p.merge(.{ .background = original }, .{ .background = pending }).background.?;
            patch.background = resolved;
            if (!std.meta.eql(current, resolved)) {
                const normalized: ?p.Background = if (p.matches(source, .{ .background = resolved })) null else resolved;
                next.background = normalized;
                next.color = if (normalized) |fill| (if (fill == .solid) fill.solid.color else null) else null;
            }
        }
        const validation = try validated.getOrPut(resource.patchKey(.{ .source_id = owner.source_id, .patch = patch }));
        if (!validation.found_existing) try validateFragment(a, &header, node, patch, context, session.options.max_xml_bytes, profile);
        if (std.meta.eql(before, next)) continue;
        changed = true;
        if (found) |i| candidate.items[i] = next else {
            if (candidate.items.len >= 100000) return error.LimitExceeded;
            try candidate.append(a, next);
        }
    }
    if (!changed) return false;
    // Stable linear compaction; removing one owner must not invalidate indices.
    var count: usize = 0;
    for (candidate.items) |entry| if (p.has(cell.patch(entry))) {
        candidate.items[count] = entry;
        count += 1;
    };
    candidate.shrinkRetainingCapacity(count);
    std.mem.swap(cell.Values, &session.cell_backgrounds, &candidate);
    var committed = false;
    defer if (!committed) std.mem.swap(cell.Values, &session.cell_backgrounds, &candidate);
    const saved = try session.save();
    a.free(saved);
    committed = true;
    return true;
}

// Inherit only namespace declarations, nearest ancestor wins. Each fragment is
// parsed locally; writer validation never reparses/copies the complete header.
fn namespaceContext(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, container: usize) ![]u8 {
    var namespaces = std.StringHashMap([]const u8).init(a);
    defer namespaces.deinit();
    var cursor: ?usize = container;
    while (cursor) |ancestor| : (cursor = tree.elements[ancestor].parent) {
        var tag = try @import("xml_part_attributes.zig").parseStartTag(a, tree, ancestor);
        defer tag.deinit(a);
        for (tag.attributes) |attr| {
            if (!try @import("../xml/root.zig").namespaces.isDeclaration(attr.name)) continue;
            if (std.mem.eql(u8, attr.name.raw, "xmlns:hxborderctx")) return error.UnsupportedCellBackgroundNamespaceContext;
            const slot = try namespaces.getOrPut(attr.name.raw);
            if (!slot.found_existing) slot.value_ptr.* = attr.value.raw;
            if (namespaces.count() > 64) return error.UnsupportedCellBackgroundNamespaceContext;
        }
    }
    var context: std.ArrayList(u8) = .empty;
    errdefer context.deinit(a);
    var it = namespaces.iterator();
    while (it.next()) |entry| {
        if (context.items.len + entry.key_ptr.*.len + entry.value_ptr.*.len + 2 > 4096) return error.UnsupportedCellBackgroundNamespaceContext;
        try context.append(a, ' ');
        try context.appendSlice(a, entry.key_ptr.*);
        try context.append(a, '=');
        try context.appendSlice(a, entry.value_ptr.*);
    }
    return context.toOwnedSlice(a);
}

fn validateFragment(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, node: usize, patch: p.Patch, context: []const u8, limit: usize, profile: @import("source_color_profile.zig").Profile) !void {
    const wrapped = try std.fmt.allocPrint(a, "<hxborderctx:head xmlns:hxborderctx=\"{s}\"{s}>{s}</hxborderctx:head>", .{ @import("document_xml.zig").head_uri, context, tree.sourceOf(node) });
    defer a.free(wrapped);
    var local = try @import("header_tree.zig").parse(a, wrapped, 0, .{ .max_xml_bytes = limit });
    defer local.deinit(a);
    const checked = try @import("border_fill_xml_patch.zig").write(a, &local, 1, patch, limit, profile);
    a.free(checked);
}

// protect is an explicit protection bit. editable is a form-field attribute,
// not a general editing permission and is not reinterpreted here.
fn validateProtection(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, node: usize) !void {
    if (try tree.attributeValue(a, node, "", "protect")) |raw| {
        if (try @import("table_xml_fields.zig").boolean(a, raw, 4096)) return error.ProtectedCell;
    }
}
