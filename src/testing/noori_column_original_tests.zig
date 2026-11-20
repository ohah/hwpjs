//! Pinned public originals only. No optional fixture, skip or normalization.
const std = @import("std");
const a = std.testing.allocator;
const h5 = @embedFile("noori-column/noori.hwp");
const hx = @embedFile("noori-column/noori.hwpx");
const command = @import("../model/table_grid_edit_plan.zig").Command;
const wire = @import("../hwp5/record.zig");
const Cell = struct { list: []const u8, header: []const u8 = &.{}, text: []const u8 = &.{}, runs: []const u8 = &.{} };
const H5View = struct { node: usize, height: u32, control: []const u8, cells: []Cell };
fn h5View(raw: []const u8, columns: u32) !H5View {
    var iterator = wire.Iterator.init(raw, .{});
    var table_count: usize = 0;
    var node: usize = 0;
    var selected: ?usize = null;
    var control: []const u8 = &.{};
    var cells: std.ArrayList(Cell) = .empty;
    errdefer cells.deinit(a);
    while (try iterator.next()) |record| : (node += 1) {
        if (selected != null and record.level < 2) break;
        if (record.tag == 71 and record.level == 1) control = record.payload;
        if (record.tag == 77) {
            table_count += 1;
            if (table_count == 5) {
                selected = node;
                try std.testing.expectEqual(@as(u16, 8), std.mem.readInt(u16, record.payload[4..6], .little));
                try std.testing.expectEqual(@as(u16, @intCast(columns)), std.mem.readInt(u16, record.payload[6..8], .little));
            }
            continue;
        }
        if (selected == null) continue;
        if (record.tag == 72 and record.level == 2) try cells.append(a, .{ .list = record.payload });
        if (record.tag == 66 and record.level == 2) cells.items[cells.items.len - 1].header = record.payload;
        if (record.tag == 67 and record.level == 3) cells.items[cells.items.len - 1].text = record.payload;
        if (record.tag == 68 and record.level == 3) cells.items[cells.items.len - 1].runs = record.payload;
    }
    return .{ .node = selected orelse return error.TestMissingTable, .height = std.mem.readInt(u32, control[20..24], .little), .control = control, .cells = try cells.toOwnedSlice(a) };
}
fn pictures(raw: []const u8) ![][]const u8 {
    var iterator = wire.Iterator.init(raw, .{});
    var result: std.ArrayList([]const u8) = .empty;
    errdefer result.deinit(a);
    while (try iterator.next()) |record| if (record.tag == 85 or (record.tag == 76)) try result.append(a, record.payload);
    return result.toOwnedSlice(a);
}

test "Noori fifth HWP5 original columns save reopen retains pictures text styles and heights" {
    var source = try @import("../hwp5/text_source.zig").Source.open(a, h5);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const before = try h5View(raw, 3);
    defer a.free(before.cells);
    const original_pictures = try pictures(raw);
    defer a.free(original_pictures);
    for ([_]command{ .{ .insert_column = 1 }, .{ .delete_column = 0 } }) |cmd| {
        const columns: u32 = if (cmd == .insert_column) 4 else 2;
        const output = try @import("../hwp5/edit/source_table_grid_file.zig").transform(a, h5, .{ .section = 0, .table_node = before.node, .expected_rows = 8, .expected_columns = 3, .command = cmd, .layout = .observed8 }, .{});
        defer a.free(output);
        var reopened = try @import("../hwp5/text_source.zig").Source.open(a, output);
        defer reopened.deinit();
        const changed = try reopened.decodeSection(a, 0);
        defer a.free(changed);
        const after_view = try h5View(changed, columns);
        defer a.free(after_view.cells);
        try std.testing.expectEqual(before.height, after_view.height);
        try std.testing.expectEqualSlices(u8, before.control[0..16], after_view.control[0..16]);
        try std.testing.expectEqualSlices(u8, before.control[20..], after_view.control[20..]);
        try std.testing.expectEqual(@as(usize, 8) * columns, after_view.cells.len);
        for (after_view.cells, 0..) |cell, i| {
            const col = i % columns;
            const fresh = cmd == .insert_column and col == 1;
            const old_col = if (cmd == .delete_column) col + 1 else if (col <= 1) 0 else col - 1;
            const old = before.cells[(i / columns) * 3 + old_col];
            // Only the cell address may change in the borrowed list payload.
            try std.testing.expectEqualSlices(u8, old.list[0..8], cell.list[0..8]);
            try std.testing.expectEqualSlices(u8, old.list[10..], cell.list[10..]);
            if (!fresh) {
                try std.testing.expectEqualSlices(u8, old.header[0..16], cell.header[0..16]);
                try std.testing.expectEqualSlices(u8, old.header[18..], cell.header[18..]);
                try std.testing.expectEqualSlices(u8, old.text, cell.text);
                try std.testing.expectEqualSlices(u8, old.runs, cell.runs);
            }
        }
        const current_pictures = try pictures(changed);
        defer a.free(current_pictures);
        try std.testing.expectEqual(original_pictures.len, current_pictures.len);
        for (original_pictures, current_pictures) |old, current| try std.testing.expectEqualSlices(u8, old, current);
    }
}

fn fifth(tree: *const @import("../hwpx/xml_part_tree.zig").Tree) !usize {
    var ordinal: usize = 0;
    for (tree.elements, 0..) |_, node| if (@import("../hwpx/table_xml_fields.zig").childIs(tree, node, "tbl")) {
        ordinal += 1;
        if (ordinal == 5) return node;
    };
    return error.TestMissingTable;
}

const XmlTree = @import("../hwpx/xml_part_tree.zig").Tree;
fn hxLists(tree: *const XmlTree, table: usize) ![]usize {
    const fields = @import("../hwpx/table_xml_fields.zig");
    var result: std.ArrayList(usize) = .empty;
    errdefer result.deinit(a);
    var row = tree.elements[table].first_child;
    while (row) |r| : (row = tree.elements[r].next_sibling) {
        if (!fields.childIs(tree, r, "tr")) continue;
        var cell = tree.elements[r].first_child;
        while (cell) |c| : (cell = tree.elements[c].next_sibling) {
            var missing: usize = 0;
            var duplicate: usize = 0;
            const sub = fields.uniqueChild(tree, c, "subList", &missing, &duplicate) orelse return error.TestMissingList;
            if (duplicate != 0) return error.TestDuplicateList;
            try result.append(a, sub);
        }
    }
    return result.toOwnedSlice(a);
}
fn compareLists(before_tree: *const XmlTree, old: usize, after_tree: *const XmlTree, current: usize) !void {
    const fields = @import("../hwpx/table_xml_fields.zig");
    var before_p = before_tree.elements[old].first_child;
    var after_p = after_tree.elements[current].first_child;
    while (before_p) |bp| : (before_p = before_tree.elements[bp].next_sibling) {
        const ap = after_p orelse return error.TestMissingParagraph;
        const be = before_tree.elements[bp];
        const ae = after_tree.elements[ap];
        try std.testing.expectEqualSlices(u8, before_tree.source[be.start_tag.start..be.start_tag.end], after_tree.source[ae.start_tag.start..ae.start_tag.end]);
        var br = be.first_child;
        var ar = ae.first_child;
        while (br) |run| : (br = before_tree.elements[run].next_sibling) {
            if (fields.childIs(before_tree, run, "linesegarray")) continue;
            while (ar) |index| {
                if (!fields.childIs(after_tree, index, "linesegarray")) break;
                ar = after_tree.elements[index].next_sibling;
            }
            const current_run = ar orelse return error.TestMissingRun;
            try std.testing.expectEqualSlices(u8, before_tree.sourceOf(run), after_tree.sourceOf(current_run));
            ar = after_tree.elements[current_run].next_sibling;
        }
        while (ar) |index| : (ar = after_tree.elements[index].next_sibling) try std.testing.expect(fields.childIs(after_tree, index, "linesegarray"));
        after_p = after_tree.elements[ap].next_sibling;
    }
    try std.testing.expect(after_p == null);
}

test "Noori fifth HWPX original columns save reopen retains raw picture comments and bounds" {
    const package = @import("../hwpx/package.zig");
    const fields = @import("../hwpx/table_xml_fields.zig");
    var document = try package.inspectDocument(a, hx, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    const selected = try fifth(&tree);
    const original_lists = try hxLists(&tree, selected);
    defer a.free(original_lists);
    try std.testing.expectEqual(@as(usize, 24), original_lists.len);
    for ([_]command{ .{ .insert_column = 1 }, .{ .delete_column = 0 } }) |cmd| {
        const output = try @import("../hwpx/source_table_grid_file.zig").transform(a, hx, .{ .section = 0, .target = .{ .element = selected }, .expected_rows = 8, .expected_columns = 3, .command = cmd }, .{});
        defer a.free(output);
        var reopened = try package.inspectDocument(a, output, .{});
        defer reopened.deinit(a);
        var current = try reopened.readSectionTree(a, 0, .{});
        defer current.deinit(a);
        const target = try fifth(&current);
        try std.testing.expectEqual(@as(?u32, if (cmd == .insert_column) 4 else 2), try fields.optionalUnsigned(a, &current, target, "colCnt", 4096));
        const lists = try hxLists(&current, target);
        defer a.free(lists);
        const columns: usize = if (cmd == .insert_column) 4 else 2;
        try std.testing.expectEqual(@as(usize, 8) * columns, lists.len);
        for (lists, 0..) |sub, i| {
            const col = i % columns;
            if (cmd == .insert_column and col == 1) continue;
            const old_col = if (cmd == .delete_column) col + 1 else if (col == 0) 0 else col - 1;
            try compareLists(&tree, original_lists[(i / columns) * 3 + old_col], &current, sub);
        }
        var next: usize = 0;
        for (tree.elements, 0..) |_, node| {
            if (!fields.childIs(&tree, node, "pic")) continue;
            while (next < current.elements.len and !fields.childIs(&current, next, "pic")) next += 1;
            if (next == current.elements.len) return error.TestMissingPicture;
            try std.testing.expectEqualSlices(u8, tree.sourceOf(node), current.sourceOf(next));
            next += 1;
        }
        while (next < current.elements.len) : (next += 1) try std.testing.expect(!fields.childIs(&current, next, "pic"));
        var child = current.elements[target].first_child;
        while (child) |node| : (child = current.elements[node].next_sibling) if (fields.childIs(&current, node, "sz")) {
            try std.testing.expectEqual(@as(?u32, 62701), try fields.optionalUnsigned(a, &current, node, "height", 4096));
        };
    }
}
