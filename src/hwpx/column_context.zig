//! Source declaration preceding a body paragraph; no rendered widths or page flow.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const columns = @import("column_definitions.zig");
const xml = @import("document_xml.zig");
pub const Direction = enum { left, right, mirror };
pub const Kind = enum { newspaper, balanced_newspaper, parallel };
pub const Size = struct { width: ?u32, gap: ?u32 };
pub const Context = struct { declaration_node: usize, owner_node: usize, count: ?u32, same_size: ?bool, gap: ?u32, direction: ?Direction, kind: ?Kind, ambiguous: bool = false, sizes: []const Size = &.{} };

/// Owned scalar copy, never a slice borrowed from the temporary report arena.
pub fn copySizes(a: std.mem.Allocator, report: *const columns.Report, declaration: usize, section: usize) ![]const Size {
    var result: std.ArrayList(Size) = .empty;
    errdefer result.deinit(a);
    for (report.columns) |column| {
        if (column.element_index != declaration or column.section_ordinal != section) continue;
        for (report.children[column.first_child .. column.first_child + column.child_count]) |child| {
            if (child.size) |size| try result.append(a, .{ .width = size.width, .gap = size.gap });
        }
        break;
    }
    return result.toOwnedSlice(a);
}

fn scopeOwner(tree: *const Tree, node: usize, scope: usize) !?usize {
    if (node >= tree.elements.len) return error.InvalidPartTree;
    var current = node;
    while (tree.elements[current].parent) |parent| {
        if (parent >= current) return error.InvalidPartTree;
        if (tree.elements[parent].is(xml.paragraph_uri, "p")) {
            const owner_parent = tree.elements[parent].parent orelse return null;
            if (owner_parent >= parent) return error.InvalidPartTree;
            return if (owner_parent == scope) parent else null;
        }
        current = parent;
    }
    return null;
}

fn enumeration(comptime T: type, raw: ?[]const u8) ?T {
    const text = std.mem.trim(u8, raw orelse return null, " \t\r\n");
    inline for (@import("../reflection.zig").fields(T)) |field| {
        if (std.ascii.eqlIgnoreCase(text, field.name)) return @fromBackingInt(@intCast(field.value));
    }
    return null;
}

fn fromColumn(column: columns.Column, owner: usize) Context {
    return .{ .declaration_node = column.element_index, .owner_node = owner, .count = column.attributes.col_count, .same_size = column.attributes.same_sz, .gap = column.attributes.same_gap, .direction = if (column.attributes.layout_known == true) enumeration(Direction, column.attributes.get(.layout)) else null, .kind = if (column.attributes.type_known == true) enumeration(Kind, column.attributes.get(.type)) else null };
}

pub fn readDefinition(tree: *const Tree, report: *const columns.Report, declaration: usize, owner: usize) !Context {
    for (report.columns) |column| {
        if (column.section_ordinal == tree.section_ordinal and column.element_index == declaration) return fromColumn(column, owner);
    }
    return error.SourceBindingMismatch;
}

pub fn read(tree: *const Tree, report: *const columns.Report, paragraph: usize) !?Context {
    if (paragraph >= tree.elements.len) return error.InvalidPartTree;
    if (!tree.elements[paragraph].is(xml.paragraph_uri, "p")) return error.InvalidColumnContextNode;
    const parent = tree.elements[paragraph].parent orelse return null;
    if (parent >= paragraph) return error.InvalidPartTree;
    if (!tree.elements[parent].is(xml.section_uri, "sec")) return null;
    return readInScope(tree, report, paragraph, parent);
}

pub fn readList(tree: *const Tree, report: *const columns.Report, paragraph: usize) !?Context {
    if (paragraph >= tree.elements.len) return error.InvalidPartTree;
    if (!tree.elements[paragraph].is(xml.paragraph_uri, "p")) return error.InvalidColumnContextNode;
    const parent = tree.elements[paragraph].parent orelse return null;
    if (parent >= paragraph) return error.InvalidPartTree;
    if (!tree.elements[parent].is(xml.paragraph_uri, "subList")) return null;
    return readInScope(tree, report, paragraph, parent);
}

fn readInScope(tree: *const Tree, report: *const columns.Report, paragraph: usize, scope: usize) !?Context {
    var result: ?Context = null;
    for (report.columns) |column| {
        if (column.section_ordinal != tree.section_ordinal) continue;
        const owner = (try scopeOwner(tree, column.element_index, scope)) orelse continue;
        if (owner > paragraph) continue;
        if (result) |*selected| {
            if (selected.owner_node > owner) continue;
            if (selected.owner_node == owner) {
                selected.ambiguous = true;
                continue;
            }
        }
        result = fromColumn(column, owner);
    }
    return result;
}

test "HWPX column context ignores nested declarations and inherits body declaration" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:colPr colCount='1' sameSz='1' sameGap='0' layout='LEFT' type='NEWSPAPER'/><p:footNote><p:subList><p:p><p:run><p:ctrl><p:colPr colCount='3'/></p:ctrl></p:run></p:p></p:subList></p:footNote></p:ctrl></p:run></p:p><p:p/></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    var report = try columns.inspect(a, &.{tree}, .{});
    defer report.deinit();
    try std.testing.expectError(error.InvalidColumnContextNode, read(&tree, &report, 0));
    try std.testing.expectError(error.InvalidPartTree, read(&tree, &report, tree.elements.len));
    for (tree.elements, 0..) |element, index| {
        if (!element.is(xml.paragraph_uri, "p")) continue;
        const context = try read(&tree, &report, index);
        if (element.parent == 0) {
            try std.testing.expectEqual(@as(?u32, 1), context.?.count);
            try std.testing.expectEqual(@as(?u32, 0), context.?.gap);
            try std.testing.expect((try readList(&tree, &report, index)) == null);
        } else {
            try std.testing.expect(context == null);
            try std.testing.expectEqual(@as(?u32, 3), (try readList(&tree, &report, index)).?.count);
        }
    }
}

test "HWPX column sizes copy all allocation failures preserves nullable fields" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:colPr colCount='2' sameSz='0'><p:colSz width='40000' gap='0'/><p:colSz/></p:colPr></p:ctrl></p:run></p:p></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    var report = try columns.inspect(a, &.{tree}, .{});
    defer report.deinit();
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const columns.Report) !void {
            const sizes = try copySizes(allocator, source, source.columns[0].element_index, 0);
            defer allocator.free(sizes);
            try std.testing.expectEqual(@as(usize, 2), sizes.len);
            try std.testing.expectEqual(@as(?u32, 40000), sizes[0].width);
            try std.testing.expectEqual(@as(?u32, 0), sizes[0].gap);
            try std.testing.expect(sizes[1].width == null and sizes[1].gap == null);
        }
    }.run, .{&report});
}
