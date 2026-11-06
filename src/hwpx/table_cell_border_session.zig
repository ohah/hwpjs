//! Original-cell outer edges share the background intent, checkpoint and COW plan.
const std = @import("std");
const editor = @import("editor_session.zig");
const cell = @import("table_cell_background_session.zig");
const p = @import("../model/border_fill_patch.zig");
const resource = @import("border_fill_resource_patch.zig");

pub fn request(edges: u8, style: p.Style, width: u16, color: u32) !p.Patch {
    if (edges == 0 or edges & 0xf0 != 0) return error.InvalidCellBorderEdges;
    switch (style) {
        .NONE, .SOLID, .DOUBLE_SLIM => {},
        else => return error.UnsupportedBorderLineStyle,
    }
    var patch: p.Patch = .{};
    for (0..4) |i| if (edges & (@as(u8, 1) << @intCast(i)) != 0) {
        patch.border.edges[i] = .{ .style = style, .width_hundredth_mm = width, .color = color };
    };
    try p.validate(patch);
    return patch;
}

fn original(session: *const editor.Session, owner: cell.Owner, patch: p.Patch) !p.Value {
    const a = session.allocator;
    const profile = try cell.profile(session);
    var document = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    var header = try document.readHeaderTree(a, .{});
    defer header.deinit(a);
    const node = try resource.sourceNode(a, &header, owner.source_id);
    var mask: [4]bool = @splat(false);
    for (patch.border.edges, 0..) |edge, i| mask[i] = edge != null;
    const value = try @import("border_fill_xml_patch.zig").observeSelected(a, &header, node, profile, mask, false);
    // Validate writer support even for no-ops, without interpreting the fill.
    const checked = try resource.write(a, &header, owner.source_id, patch, session.options.max_xml_bytes, profile);
    a.free(checked.bytes);
    return value;
}

/// Clear only fields equal to the source; a background or another edge survives.
pub fn normalized(existing: p.Border, patch: p.Patch, source: p.Value) p.Border {
    var result = existing;
    for (patch.border.edges, 0..) |edge, i| if (edge) |next| {
        var intent = result.edges[i] orelse p.Edge{};
        inline for (.{ "style", "width_hundredth_mm", "color" }) |field| if (@field(next, field)) |value| {
            @field(intent, field) = if (@field(source.edges[i], field) == value) null else value;
        };
        result.edges[i] = if (p.edgeHas(intent)) intent else null;
    };
    return result;
}

pub fn apply(session: *editor.Session, section: usize, table: usize, list: usize, edges: u8, style: p.Style, width: u16, color: u32) !bool {
    const requested = try request(edges, style, width, color);
    const owner = try cell.target(session, section, table, list);
    const source = try original(session, owner, requested);
    var found: ?usize = null;
    var before: cell.Entry = .{ .section = section, .table_node = table, .cell_node = owner.cell_node, .list_node = list, .source_id = owner.source_id };
    for (session.cell_backgrounds.items, 0..) |entry, i| {
        if (entry.section != section or entry.list_node != list) continue;
        if (found != null) return error.InvalidCellBackgroundOwner;
        try cell.validateEntry(session, entry);
        found = i;
        before = entry;
    }
    var next = before;
    next.border = normalized(before.border, requested, source);
    if (std.meta.eql(before.border, next.border)) return false;
    const a = session.allocator;
    const copied = try a.dupe(cell.Entry, session.cell_backgrounds.items);
    var candidate: cell.Values = .{ .items = copied, .capacity = copied.len, .pointer_stability = .{} };
    defer candidate.deinit(a);
    if (found) |i| {
        if (p.has(cell.patch(next))) candidate.items[i] = next else _ = candidate.orderedRemove(i);
    } else {
        if (candidate.items.len >= 100000) return error.LimitExceeded;
        try candidate.append(a, next);
    }
    std.mem.swap(cell.Values, &session.cell_backgrounds, &candidate);
    var committed = false;
    defer if (!committed) std.mem.swap(cell.Values, &session.cell_backgrounds, &candidate);
    const saved = try session.save();
    a.free(saved);
    committed = true;
    return true;
}
