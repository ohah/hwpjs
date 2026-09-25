const std = @import("std");
const xml = @import("../xml/root.zig");
const document_xml = @import("document_xml.zig");
const part_tree = @import("xml_part_tree.zig");
const part_attributes = @import("xml_part_attributes.zig");
const values = @import("xml_values.zig");

pub const Kind = enum(u8) { start_num, grid, visibility, line_number_shape };
pub const Field = enum(u8) {
    page_starts_on,
    page,
    pic,
    tbl,
    equation,
    line_grid,
    char_grid,
    wonggoji_format,
    strike_continue,
    hide_first_header,
    hide_first_footer,
    hide_first_master_page,
    border,
    fill,
    hide_first_page_num,
    hide_first_empty_line,
    show_line_number,
    restart_type,
    count_by,
    distance,
    start_number,
};

const ValueKind = enum { unsigned, boolean, page_start, visibility, observed };
const Descriptor = struct { name: []const u8, kind: Kind, value_kind: ValueKind, extension: bool = false };
const descriptors = [_]Descriptor{
    .{ .name = "pageStartsOn", .kind = .start_num, .value_kind = .page_start },
    .{ .name = "page", .kind = .start_num, .value_kind = .unsigned },
    .{ .name = "pic", .kind = .start_num, .value_kind = .unsigned },
    .{ .name = "tbl", .kind = .start_num, .value_kind = .unsigned },
    .{ .name = "equation", .kind = .start_num, .value_kind = .unsigned },
    .{ .name = "lineGrid", .kind = .grid, .value_kind = .unsigned },
    .{ .name = "charGrid", .kind = .grid, .value_kind = .unsigned },
    .{ .name = "wonggojiFormat", .kind = .grid, .value_kind = .boolean },
    .{ .name = "strikeContinue", .kind = .grid, .value_kind = .observed, .extension = true },
    .{ .name = "hideFirstHeader", .kind = .visibility, .value_kind = .boolean },
    .{ .name = "hideFirstFooter", .kind = .visibility, .value_kind = .boolean },
    .{ .name = "hideFirstMasterPage", .kind = .visibility, .value_kind = .boolean },
    .{ .name = "border", .kind = .visibility, .value_kind = .visibility },
    .{ .name = "fill", .kind = .visibility, .value_kind = .visibility },
    .{ .name = "hideFirstPageNum", .kind = .visibility, .value_kind = .boolean },
    .{ .name = "hideFirstEmptyLine", .kind = .visibility, .value_kind = .boolean },
    .{ .name = "showLineNumber", .kind = .visibility, .value_kind = .boolean },
    .{ .name = "restartType", .kind = .line_number_shape, .value_kind = .unsigned },
    .{ .name = "countBy", .kind = .line_number_shape, .value_kind = .unsigned },
    .{ .name = "distance", .kind = .line_number_shape, .value_kind = .unsigned },
    .{ .name = "startNumber", .kind = .line_number_shape, .value_kind = .unsigned },
};

comptime {
    if (descriptors.len != @typeInfo(Field).@"enum".fields.len) @compileError("section direct setting field/descriptor mismatch");
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
    extension_attributes: usize = 0,
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
    counts: [@typeInfo(Kind).@"enum".fields.len]usize,
    other_attributes: usize,
    extension_attributes: usize,
    unknown_enums: usize,
    direct_children: usize,

    pub fn count(self: *const Report, kind: Kind) usize {
        return self.counts[@intFromEnum(kind)];
    }

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        for (self.items) |*item| item.deinit(a);
        a.free(self.items);
        self.* = undefined;
    }
};

fn elementKind(element: part_tree.Element) ?Kind {
    if (!std.mem.eql(u8, element.name.uri, document_xml.paragraph_uri)) return null;
    if (element.name.local.equals("startNum", false)) return .start_num;
    if (element.name.local.equals("grid", false)) return .grid;
    if (element.name.local.equals("visibility", false)) return .visibility;
    if (element.name.local.equals("lineNumberShape", false)) return .line_number_shape;
    return null;
}

fn knownEnum(raw: []const u8, allowed: []const []const u8) bool {
    const normalized = std.mem.trim(u8, raw, " \t\r\n");
    for (allowed) |name| if (std.mem.eql(u8, normalized, name)) return true;
    return false;
}

fn validate(item: *Item, descriptor: Descriptor, raw: []const u8) !void {
    switch (descriptor.value_kind) {
        .observed => {},
        .unsigned => _ = try values.unsigned32(raw),
        .boolean => _ = try values.boolean(raw),
        .page_start => if (!knownEnum(raw, &.{ "BOTH", "EVEN", "ODD" })) {
            item.unknown_enums += 1;
        },
        .visibility => if (!knownEnum(raw, &.{ "HIDE_FIRST", "SHOW_FIRST", "SHOW_ALL" })) {
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
            item.extension_attributes += @intFromBool(descriptors[slot].extension);
        } else {
            item.other_attributes += 1;
        }
    }
}

/// Only direct 2011 hp:secPr children are inspected; unfamiliar fields and
/// descendant content remain in the source tree, without implied defaults.
pub fn inspect(a: std.mem.Allocator, sections: []const part_tree.Tree, options: Options) !Report {
    var items: std.ArrayList(Item) = .empty;
    errdefer {
        for (items.items) |*item| item.deinit(a);
        items.deinit(a);
    }
    var counts: [@typeInfo(Kind).@"enum".fields.len]usize = @splat(0);
    var other_attributes: usize = 0;
    var extension_attributes: usize = 0;
    var unknown_enums: usize = 0;
    var direct_children: usize = 0;
    for (sections, 0..) |*tree, section_ordinal| {
        if (tree.part_kind != .section or tree.elements.len == 0 or tree.section_ordinal != section_ordinal) return error.InvalidPartKind;
        for (tree.elements, 0..) |element, index| {
            const kind = elementKind(element) orelse continue;
            const parent_index = element.parent orelse continue;
            if (!tree.elements[parent_index].is(document_xml.paragraph_uri, "secPr")) continue;
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
            extension_attributes += item.extension_attributes;
            unknown_enums += item.unknown_enums;
            try items.append(a, item);
            counts[@intFromEnum(kind)] += 1;
        }
    }
    return .{
        .sections = sections.len,
        .items = try items.toOwnedSlice(a),
        .counts = counts,
        .other_attributes = other_attributes,
        .extension_attributes = extension_attributes,
        .unknown_enums = unknown_enums,
        .direct_children = direct_children,
    };
}
