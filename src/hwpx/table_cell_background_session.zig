//! One original cell resource intent: scalar fills plus sparse outer borders.
const std = @import("std");
const editor = @import("editor_session.zig");
const p = @import("../model/border_fill_patch.zig");
const resource = @import("border_fill_resource_patch.zig");
pub const Owner = struct { section: usize, table_node: usize, cell_node: usize, list_node: usize, source_id: u32 };
pub const Entry = struct { section: usize, table_node: usize, cell_node: usize, list_node: usize, source_id: u32, color: ?u32 = null, background: ?p.Background = null, border: @import("../model/border_fill_patch.zig").Border = .{}, diagonal: ?p.DiagonalPatch = null };
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

fn original(session: *const editor.Session, entry: Owner) !p.Background {
    const a = session.allocator;
    const selected_profile = try profile(session);
    var document = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    var header = try document.readHeaderTree(a, .{});
    defer header.deinit(a);
    const node = try resource.sourceNode(a, &header, entry.source_id);
    const observed = try @import("border_fill_xml_patch.zig").observeSelected(a, &header, node, selected_profile, @splat(false), true);
    const fill = observed.background orelse return error.UnsupportedCellBackgroundContents;
    return fill;
}

pub const FillObservation = struct { source_id: u32, background: p.Background };
/// Complete scalar state; none/hatch/linear are never projected as a solid RGB.
pub fn observeFill(session: *const editor.Session, section: usize, table: usize, list: usize) !FillObservation {
    const owner = try target(session, section, table, list);
    const source = try original(session, owner);
    var value = source;
    var found = false;
    for (session.cell_backgrounds.items) |entry| {
        if (entry.section != section or entry.list_node != list) continue;
        if (found) return error.InvalidCellBackgroundOwner;
        found = true;
        try validateEntry(session, entry);
        value = p.merge(.{ .background = source }, patch(entry)).background.?;
    }
    return .{ .source_id = owner.source_id, .background = value };
}

/// Preserve the old solid-only query contract; use observeFill for other kinds.
pub fn observe(session: *const editor.Session, section: usize, table: usize, list: usize) !Observation {
    const value = try observeFill(session, section, table, list);
    return .{ .source_id = value.source_id, .color = switch (value.background) {
        .none => null,
        .solid => |v| v.color,
        else => return error.UnsupportedCellBackgroundContents,
    } };
}

pub fn apply(session: *editor.Session, section: usize, table: usize, list: usize, color: u32) !bool {
    try @import("../model/rgb_color.zig").validate(color);
    return @import("hxcell_fill_batch.zig").apply(session, &.{.{ .section = section, .table_node = std.math.cast(u32, table) orelse return error.InvalidCellBackgroundOwner, .list_node = std.math.cast(u32, list) orelse return error.InvalidCellBackgroundOwner, .fill = .{ .solid = .{ .color = color } } }});
}

/// Both operations serialize exactly one complete sparse patch for this owner.
pub fn patch(entry: Entry) @import("../model/border_fill_patch.zig").Patch {
    return .{ .border = entry.border, .diagonal = entry.diagonal, .background = entry.background orelse if (entry.color) |color| .{ .solid = .{ .color = color } } else null };
}
