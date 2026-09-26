const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");
const document_xml = @import("document_xml.zig");
const values = @import("xml_values.zig");
const xml = @import("../xml/root.zig");
const direct_text = @import("xml_direct_text.zig");

pub const Kind = enum { parameter_set, boolean, integer, unsigned_integer, bindata, float, string, list, array };
pub const names = [_][]const u8{ "parameterset", "booleanParam", "integerParam", "unsignedintegerParam", "bindataParam", "floatParam", "stringParam", "listParam", "arrayParam" };
pub const Owner = enum { picture, container, equation, other };

comptime {
    if (names.len != @typeInfo(Kind).@"enum".fields.len) @compileError("parameter node names mismatch");
}

pub const Options = struct {
    max_roots: usize = 100_000,
    max_nodes: usize = 1_000_000,
    max_depth: usize = 64,
    max_attribute_bytes: usize = 4096,
    max_value_bytes: usize = 1024 * 1024,
    max_owned_bytes: usize = 128 * 1024 * 1024,
};

pub const Root = struct {
    section_ordinal: usize,
    parent_element_index: usize,
    parent_uri: []const u8,
    parent_local_name: []const u8,
    element_index: usize,
    owner: Owner,
    raw_xml: []const u8,
    first_node: usize,
    node_count: usize,
};

pub const Node = struct {
    root_index: usize,
    element_index: usize,
    parent_node_index: ?usize,
    depth: usize,
    kind: Kind,
    /// Borrows the containing Root.raw_xml; source order is unchanged.
    raw_xml: []const u8,
    name: ?[]const u8,
    cnt: ?[]const u8,
    /// Direct normalized text for scalar params; null for list nodes.
    value: ?[]const u8 = null,
    direct_children: usize = 0,
    unknown_children: usize = 0,
    count_mismatch: bool = false,
};

pub const Report = struct {
    arena: std.heap.ArenaAllocator,
    sections: usize,
    roots: []const Root,
    nodes: []const Node,
    value_bytes: usize,
    owned_bytes: usize,
    unknown_children: usize,
    count_mismatches: usize,

    pub fn deinit(self: *Report) void {
        self.arena.deinit();
        self.* = undefined;
    }
};

const Budget = struct {
    max: usize,
    used: usize = 0,

    fn copy(self: *Budget, a: std.mem.Allocator, bytes: []const u8) ![]const u8 {
        if (bytes.len > self.max -| self.used) return error.LimitExceeded;
        const owned = try a.dupe(u8, bytes);
        self.used += bytes.len;
        return owned;
    }

    pub fn note(self: *Budget, count: usize) !void {
        if (count > self.max -| self.used) return error.LimitExceeded;
        self.used += count;
    }
};

fn kindOf(element: tree_mod.Element) ?Kind {
    for (names, 0..) |name, index| {
        if (element.is(document_xml.paragraph_uri, name)) return @enumFromInt(index);
    }
    return null;
}

fn isList(kind: Kind) bool {
    return kind == .parameter_set or kind == .list or kind == .array;
}

fn ownerOf(element: tree_mod.Element) Owner {
    if (element.is(document_xml.paragraph_uri, "pic")) return .picture;
    if (element.is(document_xml.paragraph_uri, "container")) return .container;
    if (element.is(document_xml.paragraph_uri, "equation")) return .equation;
    return .other;
}

const ContentContext = struct {
    temp_a: std.mem.Allocator,
    owned_a: std.mem.Allocator,
    indices: *const std.AutoHashMapUnmanaged(usize, usize),
    builders: []std.ArrayList(u8),
    max_value_bytes: usize,
    budget: *Budget,
    value_bytes: *usize,

    fn onContent(raw: *anyopaque, event: tree_mod.Tree.ContentEvent) anyerror!void {
        const self: *ContentContext = @ptrCast(@alignCast(raw));
        const index = self.indices.get(event.parent_index) orelse return;
        const builder = &self.builders[index];
        try direct_text.append(self.temp_a, self.owned_a, builder, event.value, self.max_value_bytes, self.budget, self.value_bytes);
    }
};

const Scan = struct {
    temp_a: std.mem.Allocator,
    owned_a: std.mem.Allocator,
    tree: *const tree_mod.Tree,
    options: Options,
    budget: *Budget,
    roots: *std.ArrayList(Root),
    nodes: *std.ArrayList(Node),
    builders: *std.ArrayList(std.ArrayList(u8)),
    indices: *std.AutoHashMapUnmanaged(usize, usize),
    unknown_children: *usize,
    count_mismatches: *usize,

    fn visit(self: *Scan, root_index: usize, element_index: usize, parent_node_index: ?usize, depth: usize) !void {
        if (depth > self.options.max_depth or self.nodes.items.len >= self.options.max_nodes) return error.LimitExceeded;
        const element = self.tree.elements[element_index];
        const kind = kindOf(element) orelse return error.InvalidParameterKind;
        const root = self.roots.items[root_index];
        const base = self.tree.elements[root.element_index].start_tag.start;
        if (element.start_tag.start < base or element.end < element.start_tag.start or element.end - base > root.raw_xml.len) return error.InvalidSourceSpan;
        var attributes: [2]?@import("../xml/attribute_value.zig").Value = undefined;
        try self.tree.unprefixedAttributeValues(self.temp_a, element_index, &.{ "name", "cnt" }, &attributes);
        var name: ?[]const u8 = null;
        var cnt: ?[]const u8 = null;
        if (attributes[0]) |attribute| {
            const decoded = try attribute.toUtf8(self.temp_a, self.options.max_attribute_bytes);
            defer self.temp_a.free(decoded);
            name = try self.budget.copy(self.owned_a, decoded);
        }
        if (attributes[1]) |attribute| {
            const decoded = try attribute.toUtf8(self.temp_a, self.options.max_attribute_bytes);
            defer self.temp_a.free(decoded);
            cnt = try self.budget.copy(self.owned_a, decoded);
            if (isList(kind)) _ = try values.unsigned32(decoded);
        }
        const index = self.nodes.items.len;
        try self.nodes.append(self.owned_a, .{
            .root_index = root_index,
            .element_index = element_index,
            .parent_node_index = parent_node_index,
            .depth = depth,
            .kind = kind,
            .raw_xml = root.raw_xml[element.start_tag.start - base .. element.end - base],
            .name = name,
            .cnt = cnt,
        });
        try self.builders.append(self.owned_a, .empty);
        if (!isList(kind)) try self.indices.put(self.temp_a, element_index, index);
        var child = element.first_child;
        while (child) |child_index| : (child = self.tree.elements[child_index].next_sibling) {
            self.nodes.items[index].direct_children += 1;
            const child_kind = kindOf(self.tree.elements[child_index]);
            if (isList(kind) and child_kind != null and child_kind.? != .parameter_set) {
                try self.visit(root_index, child_index, index, depth + 1);
            } else {
                self.nodes.items[index].unknown_children += 1;
                self.unknown_children.* += 1;
            }
        }
        if (cnt) |raw_cnt| {
            if (isList(kind)) {
                const declared = try values.unsigned32(raw_cnt);
                const mismatch = @as(usize, declared) != self.nodes.items[index].direct_children;
                self.nodes.items[index].count_mismatch = mismatch;
                self.count_mismatches.* += @intFromBool(mismatch);
            }
        }
    }
};

/// Observes every 2011 hp:parameterset directly under any selected section
/// element. Parameter values remain strings; no application meaning is inferred.
pub fn inspect(a: std.mem.Allocator, sections: []const tree_mod.Tree, options: Options) !Report {
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const owned_a = arena.allocator();
    var budget: Budget = .{ .max = options.max_owned_bytes };
    var roots: std.ArrayList(Root) = .empty;
    var nodes: std.ArrayList(Node) = .empty;
    var builders: std.ArrayList(std.ArrayList(u8)) = .empty;
    var value_bytes: usize = 0;
    var unknown_children: usize = 0;
    var count_mismatches: usize = 0;
    for (sections, 0..) |*tree, ordinal| {
        if (tree.part_kind != .section or tree.section_ordinal != ordinal or tree.elements.len == 0) return error.InvalidPartKind;
        var indices: std.AutoHashMapUnmanaged(usize, usize) = .empty;
        defer indices.deinit(a);
        const first_node = nodes.items.len;
        var scan: Scan = .{
            .temp_a = a,
            .owned_a = owned_a,
            .tree = tree,
            .options = options,
            .budget = &budget,
            .roots = &roots,
            .nodes = &nodes,
            .builders = &builders,
            .indices = &indices,
            .unknown_children = &unknown_children,
            .count_mismatches = &count_mismatches,
        };
        for (tree.elements, 0..) |element, element_index| {
            if (!element.is(document_xml.paragraph_uri, "parameterset")) continue;
            const parent = element.parent orelse continue;
            if (roots.items.len >= options.max_roots) return error.LimitExceeded;
            const source = try budget.copy(owned_a, tree.sourceOf(element_index));
            const parent_name = tree.elements[parent].name;
            if (parent_name.uri.len > options.max_attribute_bytes) return error.LimitExceeded;
            // XML names have no character references; reuse the literal
            // UTF-8 decoder for either supported source encoding.
            const parent_local = try (xml.text_content.View{
                .kind = .cdata,
                .raw = parent_name.local.raw,
                .encoding = parent_name.local.encoding,
                .scalars = 0,
                .reference_options = .{},
            }).toUtf8(a, options.max_attribute_bytes);
            defer a.free(parent_local);
            const parent_uri = try budget.copy(owned_a, parent_name.uri);
            const parent_local_name = try budget.copy(owned_a, parent_local);
            const root_index = roots.items.len;
            try roots.append(owned_a, .{
                .section_ordinal = ordinal,
                .parent_element_index = parent,
                .parent_uri = parent_uri,
                .parent_local_name = parent_local_name,
                .element_index = element_index,
                .owner = ownerOf(tree.elements[parent]),
                .raw_xml = source,
                .first_node = nodes.items.len,
                .node_count = 0,
            });
            try scan.visit(root_index, element_index, null, 0);
            roots.items[root_index].node_count = nodes.items.len - roots.items[root_index].first_node;
        }
        if (indices.count() == 0) continue;
        var content: ContentContext = .{
            .temp_a = a,
            .owned_a = owned_a,
            .indices = &indices,
            .builders = builders.items,
            .max_value_bytes = options.max_value_bytes,
            .budget = &budget,
            .value_bytes = &value_bytes,
        };
        try tree.visitContent(a, .{ .context = &content, .on_content = ContentContext.onContent });
        for (nodes.items[first_node..], first_node..) |*node, index| {
            if (!isList(node.kind)) node.value = try builders.items[index].toOwnedSlice(owned_a);
        }
    }
    return .{
        .arena = arena,
        .sections = sections.len,
        .roots = try roots.toOwnedSlice(owned_a),
        .nodes = try nodes.toOwnedSlice(owned_a),
        .value_bytes = value_bytes,
        .owned_bytes = budget.used,
        .unknown_children = unknown_children,
        .count_mismatches = count_mismatches,
    };
}
