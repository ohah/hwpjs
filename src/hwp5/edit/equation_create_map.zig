//! Native writer receipt: current paragraph values plus typed child roles.
//! Never match a UI paragraph ordinal or guess an opaque owner's ID.
const std = @import("std");
const model = @import("../../model/document.zig");
const Tree = @import("../body/tree.zig").Tree;
pub const Map = struct {
    nodes: []?u32,
    pub fn deinit(self: *Map, a: std.mem.Allocator) void {
        a.free(self.nodes);
        self.* = undefined;
    }
    pub fn get(self: Map, old: u32) !u32 {
        if (old >= self.nodes.len) return error.SourceBindingMismatch;
        return self.nodes[old] orelse error.UnsupportedEquationOwnerTransfer;
    }
};
const Role = struct { parent: usize, tag: u10, ordinal: usize };
const Kind = struct { parent: usize, tag: u10 };

pub fn fromNativeWriter(a: std.mem.Allocator, before: Tree, after: Tree, current: model.Section, projected: model.Section) !Map {
    if (current.paragraphs.len != projected.paragraphs.len) return error.SourceBindingMismatch;
    const map = try a.alloc(?u32, before.nodes.len);
    errdefer a.free(map);
    @memset(map, null);
    var claimed: std.AutoHashMapUnmanaged(u32, void) = .empty;
    defer claimed.deinit(a);
    for (current.paragraphs, projected.paragraphs) |p, actual| {
        if (p.instance_id != actual.instance_id or p.style_id != actual.style_id or p.para_shape_id != actual.para_shape_id or p.declared_units != actual.declared_units or p.text_present != actual.text_present) return error.SourceBindingMismatch;
        const left = try @import("plain_text_content.zig").textBytes(a, p);
        defer a.free(left);
        const right = try @import("plain_text_content.zig").textBytes(a, actual);
        defer a.free(right);
        if (!std.mem.eql(u8, left, right) or p.character_runs.len != actual.character_runs.len) return error.SourceBindingMismatch;
        for (p.character_runs, actual.character_runs) |l, r| if (!std.meta.eql(l, r)) return error.SourceBindingMismatch;
        const next = actual.source_node orelse return error.SourceBindingMismatch;
        if ((try claimed.getOrPut(a, next)).found_existing) return error.SourceBindingMismatch;
        if (p.source_node) |old| {
            if (old >= map.len or map[old] != null or before.nodes[old].record.value != .header) return error.SourceBindingMismatch;
            map[old] = next;
        } else {
            const template = p.header_template orelse return error.SourceBindingMismatch;
            if (template >= before.nodes.len or before.nodes[template].record.value != .header or p.instance_id == 0) return error.SourceBindingMismatch;
        }
    }
    var roles: std.AutoHashMapUnmanaged(Role, u32) = .empty;
    defer roles.deinit(a);
    var counts: std.AutoHashMapUnmanaged(Kind, usize) = .empty;
    defer counts.deinit(a);
    for (after.nodes, 0..) |node, i| {
        if (node.record.value == .header) continue;
        const k: Kind = .{ .parent = node.parent orelse after.nodes.len, .tag = node.record.framing.tag };
        const slot = try counts.getOrPut(a, k);
        if (!slot.found_existing) slot.value_ptr.* = 0;
        const ordinal = slot.value_ptr.*;
        slot.value_ptr.* += 1;
        try roles.put(a, .{ .parent = k.parent, .tag = k.tag, .ordinal = ordinal }, @intCast(i));
    }
    counts.clearRetainingCapacity();
    for (before.nodes, 0..) |node, i| {
        if (node.record.value == .header) continue;
        const parent: usize = if (node.parent) |old| (map[old] orelse continue) else after.nodes.len;
        const k: Kind = .{ .parent = parent, .tag = node.record.framing.tag };
        const slot = try counts.getOrPut(a, k);
        if (!slot.found_existing) slot.value_ptr.* = 0;
        const ordinal = slot.value_ptr.*;
        slot.value_ptr.* += 1;
        const next = roles.get(.{ .parent = parent, .tag = k.tag, .ordinal = ordinal }) orelse continue;
        const actual = after.nodes[next];
        if (node.record.value == .control_header) {
            if (actual.record.value != .control_header or node.record.value.control_header.id != actual.record.value.control_header.id) return error.UnsupportedEquationOwnerTransfer;
            // Only the native field writer may alter field properties here.
            const id = node.record.value.control_header.id;
            if (@import("../body/object_common.zig").supports(id) and !std.mem.eql(u8, node.record.framing.raw, actual.record.framing.raw)) return error.UnsupportedEquationOwnerTransfer;
        } else switch (k.tag) {
            67, 68, 69, 70, 72 => {}, // Native text/metadata/list-count writers.
            else => if (!std.mem.eql(u8, node.record.framing.raw, actual.record.framing.raw)) return error.UnsupportedEquationOwnerTransfer,
        }
        map[i] = next;
    }
    for (current.paragraphs, projected.paragraphs) |p, actual| {
        const parent: ?u32 = if (p.parent_node) |old| try (Map{ .nodes = map }).get(old) else null;
        if (parent != actual.parent_node) return error.UnsupportedEquationOwnerTransfer;
    }
    return .{ .nodes = map };
}

/// Retain all owned semantic intents; transfer only their proven physical IDs.
pub fn section(a: std.mem.Allocator, current: model.Section, projected: model.Section, map: Map) !model.Section {
    var result = try @import("../../model/clone.zig").section(a, current);
    errdefer result.deinit(a);
    for (result.paragraphs, projected.paragraphs) |*p, actual| try paragraph(p, actual, map);
    if (result.table_cell_sizes) |values| for (values) |*v| {
        v.source_list_node = try map.get(v.source_list_node);
    };
    if (result.picture_current_sizes) |values| for (values) |*v| {
        v.source_picture_node = try map.get(v.source_picture_node);
    };
    if (result.form_values) |values| for (values) |*v| {
        v.source_node = try map.get(v.source_node);
    };
    result.source_record_count = projected.source_record_count;
    return result;
}

pub fn paragraph(p: *model.Paragraph, actual: model.Paragraph, map: Map) !void {
    p.source_node = actual.source_node;
    p.header_template = null;
    p.parent_node = actual.parent_node;
    p.deferred_direct_records = actual.deferred_direct_records;
    if (p.restart_control_source) |old| p.restart_control_source = try map.get(old);
    if (p.field_attributes) |fields| for (fields) |*v| {
        v.source_node = try map.get(v.source_node);
    };
    if (p.formula_results) |fields| for (fields) |*v| {
        v.source_node = try map.get(v.source_node);
    };
}
