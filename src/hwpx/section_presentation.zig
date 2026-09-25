const std = @import("std");
const xml = @import("../xml/root.zig");
const document_xml = @import("document_xml.zig");
const part_tree = @import("xml_part_tree.zig");
const part_attributes = @import("xml_part_attributes.zig");
const fields = @import("section_presentation_fields.zig");

pub const Field = fields.Field;
pub const Options = struct {
    max_items: usize = 100_000,
    max_fill_brushes: usize = 100_000,
    max_direct_children: usize = 1_000_000,
    max_brush_children: usize = 1_000_000,
    max_attribute_bytes: usize = 4096,
};

pub const Item = struct {
    section_ordinal: usize,
    element_index: usize,
    parent_element_index: usize,
    raw: [fields.field_names.len]?[]u8 = @splat(null),
    other_attributes: usize = 0,
    unknown_enums: usize = 0,
    direct_children: usize = 0,
    fill_brushes: usize = 0,

    pub fn get(self: *const Item, field: Field) ?[]const u8 {
        return self.raw[@intFromEnum(field)];
    }

    pub fn deinit(self: *Item, a: std.mem.Allocator) void {
        for (self.raw) |entry| if (entry) |bytes| a.free(bytes);
        self.* = undefined;
    }
};

pub const FillBrush = struct {
    presentation_index: usize,
    section_ordinal: usize,
    element_index: usize,
    other_attributes: usize,
    direct_children: usize,
};

pub const Report = struct {
    sections: usize,
    items: []Item,
    fill_brushes: []FillBrush,
    other_attributes: usize,
    unknown_enums: usize,
    direct_children: usize,
    brush_children: usize,

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        for (self.items) |*item| item.deinit(a);
        a.free(self.items);
        a.free(self.fill_brushes);
        self.* = undefined;
    }
};

fn countOtherAttributes(a: std.mem.Allocator, tree: *const part_tree.Tree, index: usize) !usize {
    var tag = try part_attributes.parseStartTag(a, tree, index);
    defer tag.deinit(a);
    var count: usize = 0;
    for (tag.attributes) |attribute| count += @intFromBool(!(try xml.namespaces.isDeclaration(attribute.name)));
    return count;
}

fn readAttributes(a: std.mem.Allocator, tree: *const part_tree.Tree, index: usize, options: Options, item: *Item) !void {
    var tag = try part_attributes.parseStartTag(a, tree, index);
    defer tag.deinit(a);
    for (tag.attributes) |attribute| {
        if (try xml.namespaces.isDeclaration(attribute.name)) continue;
        const name = try xml.qname.parse(attribute.name);
        var selected: ?usize = null;
        if (name.prefix == null) {
            for (fields.field_names, 0..) |candidate, slot| {
                if (name.local.equals(candidate, false)) {
                    selected = slot;
                    break;
                }
            }
        }
        if (selected) |slot| {
            const raw = try attribute.value.toUtf8(a, options.max_attribute_bytes);
            item.raw[slot] = raw;
            item.unknown_enums += @intFromBool(try fields.validate(@enumFromInt(slot), raw));
        } else item.other_attributes += 1;
    }
}

/// Direct 2011 secPr/presentation attributes and direct fillBrush references.
/// Brush payloads remain in the original tree for a shared core inspector.
pub fn inspect(a: std.mem.Allocator, sections: []const part_tree.Tree, options: Options) !Report {
    var items: std.ArrayList(Item) = .empty;
    errdefer {
        for (items.items) |*item| item.deinit(a);
        items.deinit(a);
    }
    var brushes: std.ArrayList(FillBrush) = .empty;
    errdefer brushes.deinit(a);
    var other_attributes: usize = 0;
    var unknown_enums: usize = 0;
    var direct_children: usize = 0;
    var brush_children_total: usize = 0;
    for (sections, 0..) |*tree, section_ordinal| {
        if (tree.part_kind != .section or tree.elements.len == 0 or tree.section_ordinal != section_ordinal) return error.InvalidPartKind;
        for (tree.elements, 0..) |element, index| {
            if (!element.is(document_xml.paragraph_uri, "presentation")) continue;
            const parent_index = element.parent orelse continue;
            if (!tree.elements[parent_index].is(document_xml.paragraph_uri, "secPr")) continue;
            if (items.items.len == options.max_items) return error.LimitExceeded;
            var item: Item = .{ .section_ordinal = section_ordinal, .element_index = index, .parent_element_index = parent_index };
            errdefer item.deinit(a);
            try readAttributes(a, tree, index, options, &item);
            var cursor = element.first_child;
            while (cursor) |child_index| : (cursor = tree.elements[child_index].next_sibling) {
                if (direct_children == options.max_direct_children) return error.LimitExceeded;
                direct_children += 1;
                item.direct_children += 1;
                if (!tree.elements[child_index].is(document_xml.core_uri, "fillBrush")) continue;
                if (brushes.items.len == options.max_fill_brushes) return error.LimitExceeded;
                const other = try countOtherAttributes(a, tree, child_index);
                var brush_children: usize = 0;
                var brush_cursor = tree.elements[child_index].first_child;
                while (brush_cursor) |brush_child_index| : (brush_cursor = tree.elements[brush_child_index].next_sibling) {
                    if (brush_children_total == options.max_brush_children) return error.LimitExceeded;
                    brush_children += 1;
                    brush_children_total += 1;
                }
                try brushes.append(a, .{ .presentation_index = items.items.len, .section_ordinal = section_ordinal, .element_index = child_index, .other_attributes = other, .direct_children = brush_children });
                item.fill_brushes += 1;
                other_attributes += other;
            }
            other_attributes += item.other_attributes;
            unknown_enums += item.unknown_enums;
            try items.append(a, item);
        }
    }
    const owned_items = try items.toOwnedSlice(a);
    errdefer {
        for (owned_items) |*item| item.deinit(a);
        a.free(owned_items);
    }
    return .{ .sections = sections.len, .items = owned_items, .fill_brushes = try brushes.toOwnedSlice(a), .other_attributes = other_attributes, .unknown_enums = unknown_enums, .direct_children = direct_children, .brush_children = brush_children_total };
}
