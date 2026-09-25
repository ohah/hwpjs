const std = @import("std");
const xml = @import("../xml/root.zig");
const document_xml = @import("document_xml.zig");
const part_tree = @import("xml_part_tree.zig");
const part_attributes = @import("xml_part_attributes.zig");
const fields = @import("fill_brush_fields.zig");
const values = @import("xml_values.zig");

pub const NodeKind = fields.NodeKind;
pub const Field = fields.Field;
pub const Options = struct {
    max_brushes: usize = 100_000,
    max_nodes: usize = 500_000,
    max_direct_children: usize = 1_000_000,
    max_attribute_bytes: usize = 4096,
};

pub const Brush = struct {
    part_kind: part_tree.PartKind,
    section_ordinal: ?usize,
    element_index: usize,
    parent_element_index: ?usize,
    child_counts: [3]usize = @splat(0),
    other_attributes: usize = 0,
    direct_children: usize = 0,

    pub fn count(self: *const Brush, kind: NodeKind) usize {
        return self.child_counts[@intFromEnum(kind)];
    }
};

pub const Node = struct {
    kind: NodeKind,
    brush_index: usize,
    parent_node_index: ?usize,
    element_index: usize,
    raw: [fields.descriptors.len]?[]u8 = @splat(null),
    other_attributes: usize = 0,
    unknown_enums: usize = 0,
    non_six_hex_colors: usize = 0,
    direct_children: usize = 0,
    recognized_children: usize = 0,

    pub fn get(self: *const Node, field: Field) ?[]const u8 {
        return self.raw[@intFromEnum(field)];
    }

    pub fn deinit(self: *Node, a: std.mem.Allocator) void {
        for (self.raw) |entry| if (entry) |bytes| a.free(bytes);
        self.* = undefined;
    }
};

pub const Report = struct {
    header_and_sections: usize,
    brushes: []Brush,
    nodes: []Node,
    kind_counts: [@typeInfo(NodeKind).@"enum".fields.len]usize,
    other_attributes: usize,
    unknown_enums: usize,
    non_six_hex_colors: usize,
    direct_children: usize,
    color_count_mismatch: usize,

    pub fn count(self: *const Report, kind: NodeKind) usize {
        return self.kind_counts[@intFromEnum(kind)];
    }

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        for (self.nodes) |*node| node.deinit(a);
        a.free(self.nodes);
        a.free(self.brushes);
        self.* = undefined;
    }
};

fn variantKind(element: part_tree.Element) ?NodeKind {
    if (!std.mem.eql(u8, element.name.uri, document_xml.core_uri)) return null;
    if (element.name.local.equals("winBrush", false)) return .win_brush;
    if (element.name.local.equals("gradation", false)) return .gradation;
    if (element.name.local.equals("imgBrush", false)) return .img_brush;
    return null;
}

fn leafKind(element: part_tree.Element, parent_kind: NodeKind) ?NodeKind {
    if (!std.mem.eql(u8, element.name.uri, document_xml.core_uri)) return null;
    if (parent_kind == .gradation and element.name.local.equals("color", false)) return .color;
    if (parent_kind == .img_brush and element.name.local.equals("img", false)) return .image;
    return null;
}

fn unknownAttributes(a: std.mem.Allocator, tree: *const part_tree.Tree, index: usize) !usize {
    var tag = try part_attributes.parseStartTag(a, tree, index);
    defer tag.deinit(a);
    var count: usize = 0;
    for (tag.attributes) |attribute| count += @intFromBool(!(try xml.namespaces.isDeclaration(attribute.name)));
    return count;
}

fn readAttributes(a: std.mem.Allocator, tree: *const part_tree.Tree, index: usize, options: Options, node: *Node) !void {
    var tag = try part_attributes.parseStartTag(a, tree, index);
    defer tag.deinit(a);
    for (tag.attributes) |attribute| {
        if (try xml.namespaces.isDeclaration(attribute.name)) continue;
        const name = try xml.qname.parse(attribute.name);
        var selected: ?usize = null;
        if (name.prefix == null) {
            for (fields.descriptors, 0..) |descriptor, slot| {
                if (descriptor.node == node.kind and name.local.equals(descriptor.name, false)) {
                    selected = slot;
                    break;
                }
            }
        }
        if (selected) |slot| {
            const raw = try attribute.value.toUtf8(a, options.max_attribute_bytes);
            node.raw[slot] = raw;
            var diagnostics: fields.Diagnostics = .{};
            try fields.validate(node.kind, @enumFromInt(slot), raw, &diagnostics);
            node.unknown_enums += diagnostics.unknown_enums;
            node.non_six_hex_colors += diagnostics.non_six_hex_colors;
        } else node.other_attributes += 1;
    }
}

const Collector = struct {
    a: std.mem.Allocator,
    options: Options,
    brushes: std.ArrayList(Brush) = .empty,
    nodes: std.ArrayList(Node) = .empty,
    kind_counts: [@typeInfo(NodeKind).@"enum".fields.len]usize = @splat(0),
    other_attributes: usize = 0,
    unknown_enums: usize = 0,
    non_six_hex_colors: usize = 0,
    direct_children: usize = 0,
    color_count_mismatch: usize = 0,

    fn appendNode(self: *Collector, tree: *const part_tree.Tree, element_index: usize, kind: NodeKind, brush_index: usize, parent_node_index: ?usize) !usize {
        if (self.nodes.items.len == self.options.max_nodes) return error.LimitExceeded;
        var node: Node = .{ .kind = kind, .brush_index = brush_index, .parent_node_index = parent_node_index, .element_index = element_index };
        errdefer node.deinit(self.a);
        try readAttributes(self.a, tree, element_index, self.options, &node);
        const node_index = self.nodes.items.len;
        self.other_attributes += node.other_attributes;
        self.unknown_enums += node.unknown_enums;
        self.non_six_hex_colors += node.non_six_hex_colors;
        try self.nodes.append(self.a, node);
        self.kind_counts[@intFromEnum(kind)] += 1;
        return node_index;
    }

    fn countChild(self: *Collector) !void {
        if (self.direct_children == self.options.max_direct_children) return error.LimitExceeded;
        self.direct_children += 1;
    }

    fn scanTree(self: *Collector, tree: *const part_tree.Tree) !void {
        if (tree.elements.len == 0 or (tree.part_kind != .header and tree.part_kind != .section)) return error.InvalidPartKind;
        for (tree.elements, 0..) |element, element_index| {
            if (!element.is(document_xml.core_uri, "fillBrush")) continue;
            if (self.brushes.items.len == self.options.max_brushes) return error.LimitExceeded;
            const brush_index = self.brushes.items.len;
            const brush: Brush = .{
                .part_kind = tree.part_kind,
                .section_ordinal = tree.section_ordinal,
                .element_index = element_index,
                .parent_element_index = element.parent,
                .other_attributes = try unknownAttributes(self.a, tree, element_index),
            };
            try self.brushes.append(self.a, brush);
            self.other_attributes += brush.other_attributes;
            var cursor = element.first_child;
            while (cursor) |child_index| : (cursor = tree.elements[child_index].next_sibling) {
                try self.countChild();
                self.brushes.items[brush_index].direct_children += 1;
                const kind = variantKind(tree.elements[child_index]) orelse continue;
                const node_index = try self.appendNode(tree, child_index, kind, brush_index, null);
                self.brushes.items[brush_index].child_counts[@intFromEnum(kind)] += 1;
                var grandchild = tree.elements[child_index].first_child;
                while (grandchild) |grandchild_index| : (grandchild = tree.elements[grandchild_index].next_sibling) {
                    try self.countChild();
                    self.nodes.items[node_index].direct_children += 1;
                    const leaf_kind = leafKind(tree.elements[grandchild_index], kind) orelse continue;
                    const leaf_index = try self.appendNode(tree, grandchild_index, leaf_kind, brush_index, node_index);
                    self.nodes.items[node_index].recognized_children += 1;
                    var leaf_child = tree.elements[grandchild_index].first_child;
                    while (leaf_child) |leaf_child_index| : (leaf_child = tree.elements[leaf_child_index].next_sibling) {
                        try self.countChild();
                        self.nodes.items[leaf_index].direct_children += 1;
                    }
                }
                if (kind == .gradation) {
                    if (self.nodes.items[node_index].get(.color_num)) |raw| {
                        const declared = try values.unsigned32(raw);
                        self.color_count_mismatch += @intFromBool(@as(usize, declared) != self.nodes.items[node_index].recognized_children);
                    }
                }
            }
        }
    }

    fn deinit(self: *Collector) void {
        for (self.nodes.items) |*node| node.deinit(self.a);
        self.nodes.deinit(self.a);
        self.brushes.deinit(self.a);
    }
};

/// Reads every 2011 core fillBrush in selected header and section trees.
/// Missing attributes and unfamiliar children remain distinct from defaults.
pub fn inspect(a: std.mem.Allocator, header: *const part_tree.Tree, sections: []const part_tree.Tree, options: Options) !Report {
    if (header.part_kind != .header or header.section_ordinal != null) return error.InvalidPartKind;
    var collector: Collector = .{ .a = a, .options = options };
    errdefer collector.deinit();
    try collector.scanTree(header);
    for (sections, 0..) |*tree, ordinal| {
        if (tree.part_kind != .section or tree.section_ordinal != ordinal) return error.InvalidPartKind;
        try collector.scanTree(tree);
    }
    const owned_brushes = try collector.brushes.toOwnedSlice(a);
    errdefer a.free(owned_brushes);
    return .{
        .header_and_sections = sections.len + 1,
        .brushes = owned_brushes,
        .nodes = try collector.nodes.toOwnedSlice(a),
        .kind_counts = collector.kind_counts,
        .other_attributes = collector.other_attributes,
        .unknown_enums = collector.unknown_enums,
        .non_six_hex_colors = collector.non_six_hex_colors,
        .direct_children = collector.direct_children,
        .color_count_mismatch = collector.color_count_mismatch,
    };
}
