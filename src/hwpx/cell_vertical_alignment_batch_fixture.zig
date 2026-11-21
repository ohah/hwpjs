//! Authored own package -> physical original XML, never an external fixture.
const std = @import("std");
const editor = @import("editor_session.zig");
const writer = @import("xml_source_writer.zig");
const fields = @import("table_xml_fields.zig");
pub const Mode = enum { plain, protected_second, reserved_second, merged_top, multiparagraph_first };
fn child(tree: *const @import("xml_part_tree.zig").Tree, parent: usize, name: []const u8) !usize {
    var current = tree.elements[parent].first_child;
    while (current) |node| : (current = tree.elements[node].next_sibling) if (fields.childIs(tree, node, name)) return node;
    return error.InvalidOwnFixture;
}
pub fn make(a: std.mem.Allocator, mode: Mode) ![]u8 {
    const input = try @import("cell_vertical_alignment_file_fixture.zig").make(a);
    var returned_input = false;
    defer if (!returned_input) a.free(input);
    if (mode == .plain) {
        returned_input = true;
        return input;
    }
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const rows = try @import("table_display_bindings.zig").read(a, &session, 0);
    defer a.free(rows);
    if (rows.len < 4) return error.InvalidOwnFixture;
    const tree = &session.sections[0].tree;
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    var owned: std.ArrayList([]u8) = .empty;
    defer {
        for (owned.items) |bytes| a.free(bytes);
        owned.deinit(a);
    }
    if (mode == .protected_second or mode == .reserved_second) {
        const node = if (mode == .protected_second) rows[1].owner.cell_node else rows[1].owner.list_node;
        const write = @import("xml_scalar_attributes_upsert.zig").write;
        const tag = if (mode == .protected_second)
            try write(a, tree, node, &.{"protect"}, .{"true"}, session.options.max_xml_bytes)
        else
            try write(a, tree, node, &.{"vertAlign"}, .{"INVALID"}, session.options.max_xml_bytes);
        owned.append(a, tag) catch |err| {
            a.free(tag);
            return err;
        };
        const span = tree.elements[node].start_tag;
        try changes.append(a, .{ .start = span.start, .end = span.end, .text = "", .start_tag = tag });
    } else if (mode == .merged_top) {
        const first = rows[0].owner;
        const second = rows[1].owner;
        const span_node = try child(tree, first.cell_node, "cellSpan");
        const size_node = try child(tree, first.cell_node, "cellSz");
        const span_tag = try @import("xml_scalar_attributes_upsert.zig").write(a, tree, span_node, &.{"colSpan"}, .{"2"}, session.options.max_xml_bytes);
        owned.append(a, span_tag) catch |err| {
            a.free(span_tag);
            return err;
        };
        const size_tag = try @import("xml_scalar_attributes_upsert.zig").write(a, tree, size_node, &.{"width"}, .{"20000"}, session.options.max_xml_bytes);
        owned.append(a, size_tag) catch |err| {
            a.free(size_tag);
            return err;
        };
        for ([_]struct { node: usize, tag: []const u8 }{ .{ .node = span_node, .tag = span_tag }, .{ .node = size_node, .tag = size_tag } }) |value| {
            const span = tree.elements[value.node].start_tag;
            try changes.append(a, .{ .start = span.start, .end = span.end, .text = "", .start_tag = value.tag });
        }
        const removed = tree.elements[second.cell_node];
        try changes.append(a, .{ .start = removed.start_tag.start, .end = removed.end, .text = "", .serialized_xml = "" });
    } else {
        const paragraph = try child(tree, rows[0].owner.list_node, "p");
        const node = tree.elements[paragraph];
        const tag = try @import("xml_scalar_attributes_upsert.zig").write(a, tree, paragraph, &.{"id"}, .{"9000"}, session.options.max_xml_bytes);
        defer a.free(tag);
        const clone = try std.mem.concat(a, u8, &.{ tag, tree.source[node.start_tag.end..node.end] });
        owned.append(a, clone) catch |err| {
            a.free(clone);
            return err;
        };
        try changes.append(a, .{ .start = node.end, .end = node.end, .text = "", .serialized_xml = clone });
    }
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, left: writer.Change, right: writer.Change) bool {
            return left.start < right.start;
        }
    }.less);
    const xml = try writer.write(a, tree.source, changes.items, session.options.max_xml_bytes);
    defer a.free(xml);
    return @import("../zip/replace_writer.zig").write(a, input, &.{.{ .entry_index = session.sections[0].entry_index, .bytes = xml }}, .{ .max_output_bytes = session.options.max_output_bytes });
}
