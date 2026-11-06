//! One original cell resource intent: solid RGB plus sparse outer borders.
const std = @import("std");
const editor = @import("editor_session.zig");
const resource = @import("border_fill_resource_patch.zig");
pub const Owner = struct { section: usize, table_node: usize, cell_node: usize, list_node: usize, source_id: u32 };
pub const Entry = struct { section: usize, table_node: usize, cell_node: usize, list_node: usize, source_id: u32, color: ?u32 = null, border: @import("../model/border_fill_patch.zig").Border = .{} };
pub const Values = std.ArrayList(Entry);
pub const Observation = struct { source_id: u32, color: ?u32 };

pub fn target(session: *const editor.Session, section: usize, table: usize, list: usize) !Owner {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const bindings = try @import("table_display_bindings.zig").read(session.allocator, session, section);
    defer session.allocator.free(bindings);
    var selected: ?usize = null;
    for (bindings) |binding| {
        if (binding.owner.list_node != list) continue;
        if (binding.owner.table_node != table) return error.InvalidCellBackgroundOwner;
        if (selected) |cell| {
            if (cell != binding.owner.cell_node) return error.InvalidCellBackgroundOwner;
        } else selected = binding.owner.cell_node;
    }
    const cell = selected orelse return error.InvalidCellBackgroundOwner;
    const tree = &session.sections[section].tree;
    const raw = (try tree.attributeValue(session.allocator, cell, "", "borderFillIDRef")) orelse return error.MissingBorderFillReference;
    return .{ .section = section, .table_node = table, .cell_node = cell, .list_node = list, .source_id = try @import("table_xml_fields.zig").unsigned(session.allocator, raw, 4096) };
}

pub fn validateEntry(session: *const editor.Session, entry: Entry) !void {
    const current = try target(session, entry.section, entry.table_node, entry.list_node);
    if (current.cell_node != entry.cell_node or current.source_id != entry.source_id) return error.SourceBindingMismatch;
    try @import("../model/border_fill_patch.zig").validate(patch(entry));
}

pub fn profile(session: *const editor.Session) !@import("source_color_profile.zig").Profile {
    const value = try @import("border_fill_profile.zig").read(session.allocator, session.source);
    if (!value.verified) return error.UnsupportedCellBackgroundProfile;
    return value;
}

fn original(session: *const editor.Session, entry: Owner, requested: ?u32) !?u32 {
    const a = session.allocator;
    const selected_profile = try profile(session);
    var document = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    var header = try document.readHeaderTree(a, .{});
    defer header.deinit(a);
    const node = try resource.sourceNode(a, &header, entry.source_id);
    const observed = try @import("border_fill_xml_patch.zig").observeSelected(a, &header, node, selected_profile, @splat(false), true);
    const fill = observed.background orelse return error.UnsupportedCellBackgroundContents;
    const color: ?u32 = switch (fill) {
        .none => null,
        .solid => |v| v.color,
        else => return error.UnsupportedCellBackgroundContents,
    };
    // Even a same-color request must pass the existing opaque/extension writer gate.
    if (requested) |rgb| {
        const checked = try resource.write(a, &header, entry.source_id, .{ .background = .{ .solid = .{ .color = rgb } } }, session.options.max_xml_bytes, selected_profile);
        a.free(checked.bytes);
    }
    return color;
}

pub fn observe(session: *const editor.Session, section: usize, table: usize, list: usize) !Observation {
    const owner = try target(session, section, table, list);
    const color = try original(session, owner, null);
    for (session.cell_backgrounds.items) |entry| {
        if (entry.section == section and entry.list_node == list) {
            try validateEntry(session, entry);
            return .{ .source_id = owner.source_id, .color = entry.color orelse color };
        }
    }
    return .{ .source_id = owner.source_id, .color = color };
}

pub fn apply(session: *editor.Session, section: usize, table: usize, list: usize, color: u32) !bool {
    try @import("../model/rgb_color.zig").validate(color);
    const owner = try target(session, section, table, list);
    const next: Entry = .{ .section = section, .table_node = table, .cell_node = owner.cell_node, .list_node = list, .source_id = owner.source_id, .color = color };
    const before_color = try original(session, owner, color);
    var found: ?usize = null;
    for (session.cell_backgrounds.items, 0..) |entry, i| {
        if (entry.section == section and entry.list_node == list) {
            try validateEntry(session, entry);
            if (found != null) return error.InvalidCellBackgroundOwner;
            found = i;
        }
    }
    const current: ?u32 = if (found) |i| session.cell_backgrounds.items[i].color orelse before_color else before_color;
    if (current != null and current.? == color) return false;
    const a = session.allocator;
    const copied = try a.dupe(Entry, session.cell_backgrounds.items);
    var candidate: Values = .{ .items = copied, .capacity = copied.len, .pointer_stability = .{} };
    defer candidate.deinit(a);
    if (found) |i| {
        if (before_color != null and before_color.? == color) {
            candidate.items[i].color = null;
            if (!@import("../model/border_fill_patch.zig").has(patch(candidate.items[i]))) _ = candidate.orderedRemove(i);
        } else candidate.items[i].color = color;
    } else {
        if (candidate.items.len >= 100000) return error.LimitExceeded;
        try candidate.append(a, next);
    }
    std.mem.swap(Values, &session.cell_backgrounds, &candidate);
    var committed = false;
    defer if (!committed) std.mem.swap(Values, &session.cell_backgrounds, &candidate);
    const saved = try session.save();
    a.free(saved);
    committed = true;
    return true;
}

/// Both operations serialize exactly one complete sparse patch for this owner.
pub fn patch(entry: Entry) @import("../model/border_fill_patch.zig").Patch {
    return .{ .border = entry.border, .background = if (entry.color) |color| .{ .solid = .{ .color = color } } else null };
}
