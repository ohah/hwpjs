//! Typed field attribute edits. Commands and unrelated header bytes stay raw.
const std = @import("std");
const model = @import("../../model/document.zig");
const Tree = @import("../body/tree.zig").Tree;
const body = @import("../body/reader.zig");
const controls = @import("../body/control_rules.zig");
const Version = @import("../version.zig").Version;

pub fn prepare(a: std.mem.Allocator, source: []const u8, version: Version, p: model.Paragraph, before: []const u8, start: u32, end: u32) !?[]model.FieldAttributes {
    var has_fields = false;
    for (p.tokens) |token| {
        if (token.kind == .control and token.raw.len >= 2 and std.mem.readInt(u16, token.raw[0..2], .little) == 3) has_fields = true;
    }
    if (!has_fields) return null;
    const source_node = try p.originalNode();
    var tree = try Tree.parseTextPreview(a, source, version, .{});
    defer tree.deinit(a);
    var fields: std.ArrayList(model.FieldAttributes) = .empty;
    errdefer fields.deinit(a);
    if (source_node >= tree.nodes.len) return error.SourceBindingMismatch;
    var child: usize = @as(usize, source_node) + 1;
    while (child < tree.nodes[source_node].subtree_end) {
        const node = tree.nodes[child];
        if (node.record.framing.tag == @intFromEnum(body.Tag.control_header)) {
            const header = try body.ControlHeader.parse(node.record.framing.payload);
            if (header.id == controls.id("%hlk")) {
                const properties = try @import("../body/field_start.zig").Properties.parse(header.properties);
                try fields.append(a, .{ .source_node = @intCast(child), .attributes = properties.attributes });
            }
        }
        child = node.subtree_end;
    }
    if (fields.items.len == 0) {
        fields.deinit(a);
        return null;
    }
    if (p.field_attributes) |previous| {
        if (previous.len != fields.items.len) return error.SourceBindingMismatch;
        for (fields.items, previous) |*field, old| {
            if (field.source_node != old.source_node) return error.SourceBindingMismatch;
            field.attributes = old.attributes;
        }
    }
    const Open = struct { index: usize, begin: usize };
    var stack: [32]Open = undefined;
    var depth: usize = 0;
    var next: usize = 0;
    var tokens = (try body.Text.parse(before)).tokens();
    while (try tokens.next()) |token| {
        if (token.value != .control) continue;
        if (token.value.control.code == 3) {
            if (next >= fields.items.len or depth == stack.len) return error.SourceBindingMismatch;
            stack[depth] = .{ .index = next, .begin = token.start_unit + token.raw.len / 2 };
            depth += 1;
            next += 1;
        } else if (token.value.control.code == 4) {
            if (depth == 0) return error.SourceBindingMismatch;
            depth -= 1;
            const opened = stack[depth];
            const modified = if (start == end)
                start >= opened.begin and start <= token.start_unit
            else
                start < token.start_unit and end > opened.begin;
            if (modified) fields.items[opened.index].attributes |= @import("../body/field_start.zig").modified_mask;
        }
    }
    if (depth != 0 or next != fields.items.len) return error.SourceBindingMismatch;
    return try fields.toOwnedSlice(a);
}

pub fn find(fields: []const model.FieldAttributes, node: usize) ?u32 {
    var lo: usize = 0;
    var hi = fields.len;
    while (lo < hi) {
        const mid = lo + (hi - lo) / 2;
        if (fields[mid].source_node < node) lo = mid + 1 else hi = mid;
    }
    return if (lo < fields.len and fields[lo].source_node == node) fields[lo].attributes else null;
}
