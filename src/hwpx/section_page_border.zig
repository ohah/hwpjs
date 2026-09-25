const std = @import("std");
const xml = @import("../xml/root.zig");
const document_xml = @import("document_xml.zig");
const part_tree = @import("xml_part_tree.zig");
const part_attributes = @import("xml_part_attributes.zig");
const values = @import("xml_values.zig");

pub const Kind = enum(u8) { border, offset };
pub const Field = enum(u8) { page_type, border_fill_id_ref, text_border, header_inside, footer_inside, fill_area, left, right, top, bottom };
const ValueKind = enum { unsigned, boolean, page_type, text_border, fill_area };
const Descriptor = struct { name: []const u8, kind: Kind, value_kind: ValueKind };
const descriptors = [_]Descriptor{
    .{ .name = "type", .kind = .border, .value_kind = .page_type },
    .{ .name = "borderFillIDRef", .kind = .border, .value_kind = .unsigned },
    .{ .name = "textBorder", .kind = .border, .value_kind = .text_border },
    .{ .name = "headerInside", .kind = .border, .value_kind = .boolean },
    .{ .name = "footerInside", .kind = .border, .value_kind = .boolean },
    .{ .name = "fillArea", .kind = .border, .value_kind = .fill_area },
    .{ .name = "left", .kind = .offset, .value_kind = .unsigned },
    .{ .name = "right", .kind = .offset, .value_kind = .unsigned },
    .{ .name = "top", .kind = .offset, .value_kind = .unsigned },
    .{ .name = "bottom", .kind = .offset, .value_kind = .unsigned },
};
comptime {
    if (descriptors.len != @typeInfo(Field).@"enum".fields.len) @compileError("page border field/descriptor mismatch");
}

pub const Options = struct {
    max_items: usize = 400_000,
    max_direct_children: usize = 1_000_000,
    max_attribute_bytes: usize = 4096,
};

pub const Item = struct {
    kind: Kind,
    section_ordinal: usize,
    element_index: usize,
    parent_element_index: usize,
    raw: [descriptors.len]?[]u8 = @splat(null),
    other_attributes: usize = 0,
    unknown_enums: usize = 0,
    direct_children: usize = 0,

    pub fn get(self: *const Item, field: Field) ?[]const u8 {
        return self.raw[@intFromEnum(field)];
    }

    pub fn deinit(self: *Item, a: std.mem.Allocator) void {
        for (self.raw) |entry| if (entry) |bytes| a.free(bytes);
        self.* = undefined;
    }
};

pub const Report = struct {
    sections: usize,
    items: []Item,
    borders: usize,
    offsets: usize,
    other_attributes: usize,
    unknown_enums: usize,
    direct_children: usize,

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        for (self.items) |*item| item.deinit(a);
        a.free(self.items);
        self.* = undefined;
    }
};

fn knownEnum(raw: []const u8, allowed: []const []const u8) bool {
    const normalized = std.mem.trim(u8, raw, " \t\r\n");
    for (allowed) |name| if (std.mem.eql(u8, normalized, name)) return true;
    return false;
}

fn validate(item: *Item, descriptor: Descriptor, raw: []const u8) !void {
    switch (descriptor.value_kind) {
        .unsigned => _ = try values.unsigned32(raw),
        .boolean => _ = try values.boolean(raw),
        .page_type => if (!knownEnum(raw, &.{ "BOTH", "EVEN", "ODD" })) {
            item.unknown_enums += 1;
        },
        .text_border => if (!knownEnum(raw, &.{ "CONTENT", "PAPER" })) {
            item.unknown_enums += 1;
        },
        .fill_area => if (!knownEnum(raw, &.{ "PAPER", "PAGE", "BORDER" })) {
            item.unknown_enums += 1;
        },
    }
}

fn readAttributes(a: std.mem.Allocator, tree: *const part_tree.Tree, index: usize, options: Options, item: *Item) !void {
    var tag = try part_attributes.parseStartTag(a, tree, index);
    defer tag.deinit(a);
    for (tag.attributes) |attribute| {
        if (try xml.namespaces.isDeclaration(attribute.name)) continue;
        const name = try xml.qname.parse(attribute.name);
        var selected: ?usize = null;
        if (name.prefix == null) {
            for (descriptors, 0..) |descriptor, slot| {
                if (descriptor.kind == item.kind and name.local.equals(descriptor.name, false)) {
                    selected = slot;
                    break;
                }
            }
        }
        if (selected) |slot| {
            const normalized = try attribute.value.toUtf8(a, options.max_attribute_bytes);
            item.raw[slot] = normalized;
            try validate(item, descriptors[slot], normalized);
        } else item.other_attributes += 1;
    }
}

/// Observes direct 2011 hp:secPr/hp:pageBorderFill and their direct hp:offset.
/// Raw fields remain optional and duplicate elements remain separate items.
pub fn inspect(a: std.mem.Allocator, sections: []const part_tree.Tree, options: Options) !Report {
    var items: std.ArrayList(Item) = .empty;
    errdefer {
        for (items.items) |*item| item.deinit(a);
        items.deinit(a);
    }
    var borders: usize = 0;
    var offsets: usize = 0;
    var other_attributes: usize = 0;
    var unknown_enums: usize = 0;
    var direct_children: usize = 0;
    for (sections, 0..) |*tree, section_ordinal| {
        if (tree.part_kind != .section or tree.elements.len == 0 or tree.section_ordinal != section_ordinal) return error.InvalidPartKind;
        for (tree.elements, 0..) |element, index| {
            var kind: Kind = undefined;
            if (element.is(document_xml.paragraph_uri, "pageBorderFill")) {
                kind = .border;
            } else if (element.is(document_xml.paragraph_uri, "offset")) {
                kind = .offset;
            } else continue;
            const parent_index = element.parent orelse continue;
            const parent = tree.elements[parent_index];
            if (kind == .border) {
                if (!parent.is(document_xml.paragraph_uri, "secPr")) continue;
            } else {
                if (!parent.is(document_xml.paragraph_uri, "pageBorderFill")) continue;
                const grandparent_index = parent.parent orelse continue;
                if (!tree.elements[grandparent_index].is(document_xml.paragraph_uri, "secPr")) continue;
            }
            if (items.items.len == options.max_items) return error.LimitExceeded;
            var item: Item = .{ .kind = kind, .section_ordinal = section_ordinal, .element_index = index, .parent_element_index = parent_index };
            errdefer item.deinit(a);
            try readAttributes(a, tree, index, options, &item);
            var cursor = element.first_child;
            while (cursor) |child_index| : (cursor = tree.elements[child_index].next_sibling) {
                if (direct_children == options.max_direct_children) return error.LimitExceeded;
                direct_children += 1;
                item.direct_children += 1;
            }
            other_attributes += item.other_attributes;
            unknown_enums += item.unknown_enums;
            try items.append(a, item);
            if (kind == .border) borders += 1 else offsets += 1;
        }
    }
    return .{ .sections = sections.len, .items = try items.toOwnedSlice(a), .borders = borders, .offsets = offsets, .other_attributes = other_attributes, .unknown_enums = unknown_enums, .direct_children = direct_children };
}
