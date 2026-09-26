const std = @import("std");
const xml = @import("../xml/root.zig");
const tree_mod = @import("xml_part_tree.zig");
const document_xml = @import("document_xml.zig");
const fields = @import("column_fields.zig");

pub const Options = struct {
    max_columns: usize = 200_000,
    max_children: usize = 200_000,
    max_direct_children: usize = 500_000,
    max_leaf_children: usize = 500_000,
    max_name_bytes: usize = 4096,
    max_attribute_bytes: usize = 4096,
    max_owned_bytes: usize = 128 * 1024 * 1024,
};

pub const ChildKind = enum { line, size };

pub const Column = struct {
    section_ordinal: usize,
    element_index: usize,
    parent_element_index: usize,
    parent_uri: []const u8,
    parent_local_name: []const u8,
    raw_xml: []const u8,
    attributes: fields.Column,
    first_child: usize,
    child_count: usize = 0,
    direct_children: usize = 0,
    unknown_children: usize = 0,
    line_children: usize = 0,
    size_children: usize = 0,
    size_count_mismatch: bool = false,
    uniform_size_children: bool = false,
};

pub const Child = struct {
    kind: ChildKind,
    column_index: usize,
    section_ordinal: usize,
    element_index: usize,
    raw_xml: []const u8,
    line: ?fields.Line = null,
    size: ?fields.Size = null,
    direct_children: usize = 0,
};

pub const Report = struct {
    arena: std.heap.ArenaAllocator,
    sections: usize,
    columns: []const Column,
    children: []const Child,
    unknown_types: usize,
    unknown_layouts: usize,
    unknown_line_types: usize,
    unknown_line_widths: usize,
    noncanonical_colors: usize,
    other_attributes: usize,
    unknown_children: usize,
    direct_children: usize,
    leaf_children: usize,
    unequal_columns: usize,
    size_count_mismatches: usize,
    uniform_size_children: usize,
    owned_bytes: usize,

    pub fn deinit(self: *Report) void {
        self.arena.deinit();
        self.* = undefined;
    }
};

const Budget = struct {
    max: usize,
    used: usize = 0,

    pub fn copy(self: *Budget, a: std.mem.Allocator, bytes: []const u8) ![]const u8 {
        if (bytes.len > self.max -| self.used) return error.LimitExceeded;
        const copied = try a.dupe(u8, bytes);
        self.used += bytes.len;
        return copied;
    }
};

fn childKind(element: tree_mod.Element) ?ChildKind {
    if (element.is(document_xml.paragraph_uri, "colLine")) return .line;
    if (element.is(document_xml.paragraph_uri, "colSz")) return .size;
    return null;
}

/// Inspects exact 2011 colPr attributes and ordered direct colLine/colSz
/// children. Widths remain source values; no rendered column width is inferred.
pub fn inspect(a: std.mem.Allocator, sections: []const tree_mod.Tree, options: Options) !Report {
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const owned_a = arena.allocator();
    var budget: Budget = .{ .max = options.max_owned_bytes };
    var columns: std.ArrayList(Column) = .empty;
    var children: std.ArrayList(Child) = .empty;
    var result: Report = .{
        .arena = arena,
        .sections = sections.len,
        .columns = &.{},
        .children = &.{},
        .unknown_types = 0,
        .unknown_layouts = 0,
        .unknown_line_types = 0,
        .unknown_line_widths = 0,
        .noncanonical_colors = 0,
        .other_attributes = 0,
        .unknown_children = 0,
        .direct_children = 0,
        .leaf_children = 0,
        .unequal_columns = 0,
        .size_count_mismatches = 0,
        .uniform_size_children = 0,
        .owned_bytes = 0,
    };
    for (sections, 0..) |*tree, ordinal| {
        if (tree.part_kind != .section or tree.section_ordinal != ordinal or tree.elements.len == 0) return error.InvalidPartKind;
        for (tree.elements, 0..) |element, index| {
            if (!element.is(document_xml.paragraph_uri, "colPr")) continue;
            const parent_index = element.parent orelse continue;
            if (columns.items.len >= options.max_columns) return error.LimitExceeded;
            const parent_name = tree.elements[parent_index].name;
            if (parent_name.uri.len > options.max_name_bytes) return error.LimitExceeded;
            const parent_local = try (xml.text_content.View{
                .kind = .cdata,
                .raw = parent_name.local.raw,
                .encoding = parent_name.local.encoding,
                .scalars = 0,
                .reference_options = .{},
            }).toUtf8(a, options.max_name_bytes);
            defer a.free(parent_local);
            var column: Column = .{
                .section_ordinal = ordinal,
                .element_index = index,
                .parent_element_index = parent_index,
                .parent_uri = try budget.copy(owned_a, parent_name.uri),
                .parent_local_name = try budget.copy(owned_a, parent_local),
                .raw_xml = try budget.copy(owned_a, tree.sourceOf(index)),
                .attributes = try fields.readColumn(a, owned_a, tree, index, options.max_attribute_bytes, &budget),
                .first_child = children.items.len,
            };
            result.unknown_types += @intFromBool(column.attributes.type_known == false);
            result.unknown_layouts += @intFromBool(column.attributes.layout_known == false);
            result.other_attributes += column.attributes.other_attributes;
            result.unequal_columns += @intFromBool(column.attributes.same_sz == false);
            var cursor = element.first_child;
            while (cursor) |child_index| : (cursor = tree.elements[child_index].next_sibling) {
                if (result.direct_children >= options.max_direct_children) return error.LimitExceeded;
                result.direct_children += 1;
                column.direct_children += 1;
                const child_element = tree.elements[child_index];
                const kind = childKind(child_element) orelse {
                    column.unknown_children += 1;
                    result.unknown_children += 1;
                    continue;
                };
                if (children.items.len >= options.max_children) return error.LimitExceeded;
                var child: Child = .{
                    .kind = kind,
                    .column_index = columns.items.len,
                    .section_ordinal = ordinal,
                    .element_index = child_index,
                    .raw_xml = try budget.copy(owned_a, tree.sourceOf(child_index)),
                };
                switch (kind) {
                    .line => {
                        column.line_children += 1;
                        child.line = try fields.readLine(a, owned_a, tree, child_index, options.max_attribute_bytes, &budget);
                        result.unknown_line_types += @intFromBool(child.line.?.type_known == false);
                        result.unknown_line_widths += @intFromBool(child.line.?.width_known == false);
                        result.noncanonical_colors += @intFromBool(child.line.?.color_canonical == false);
                        result.other_attributes += child.line.?.other_attributes;
                    },
                    .size => {
                        column.size_children += 1;
                        child.size = try fields.readSize(a, owned_a, tree, child_index, options.max_attribute_bytes, &budget);
                        result.other_attributes += child.size.?.other_attributes;
                    },
                }
                var nested = child_element.first_child;
                while (nested) |nested_index| : (nested = tree.elements[nested_index].next_sibling) {
                    if (result.leaf_children >= options.max_leaf_children) return error.LimitExceeded;
                    result.leaf_children += 1;
                    child.direct_children += 1;
                }
                try children.append(owned_a, child);
                column.child_count += 1;
            }
            if (column.attributes.same_sz) |same_sz| {
                if (same_sz) {
                    column.uniform_size_children = column.size_children != 0;
                    result.uniform_size_children += @intFromBool(column.uniform_size_children);
                } else if (column.attributes.col_count) |count| {
                    column.size_count_mismatch = column.size_children != @as(usize, count);
                    result.size_count_mismatches += @intFromBool(column.size_count_mismatch);
                }
            }
            try columns.append(owned_a, column);
        }
    }
    result.columns = try columns.toOwnedSlice(owned_a);
    result.children = try children.toOwnedSlice(owned_a);
    result.owned_bytes = budget.used;
    result.arena = arena;
    return result;
}
