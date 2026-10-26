//! 헤더 테두리 원값 관측입니다. 가시성/폭 단위/그리기 정책을 추정하지 않습니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const xml = @import("document_xml.zig");
const fields = @import("table_xml_fields.zig");
pub const edge_names = [_][]const u8{ "leftBorder", "rightBorder", "topBorder", "bottomBorder" };
pub const Edge = struct { style: ?[]const u8 = null, width: ?[]const u8 = null, color: ?[]const u8 = null };
pub const Source = struct {
    arena: std.heap.ArenaAllocator,
    id: u32,
    node: usize,
    edges: [4]?Edge = @splat(null),
    diagonal: ?Edge = null,
    slash: ?[]const u8 = null,
    back_slash: ?[]const u8 = null,
    slash_node: ?usize = null,
    back_slash_node: ?usize = null,
    three_d: ?[]const u8 = null,
    shadow: ?[]const u8 = null,
    center_line: ?[]const u8 = null,
    fill_node: ?usize = null,
    fill_report: ?@import("fill_brush.zig").Report = null,
    semantic_face_colors: ?[]@import("source_color_profile.zig").SemanticFaceColor = null,
    source_color_profile: ?@import("source_color_profile.zig").Profile = null,
    unknown_children: usize = 0,
    unknown_attributes: usize = 0,
    pub fn jsonStringify(self: Source, writer: anytype) !void {
        try writer.beginObject();
        inline for (@import("../reflection.zig").fields(Source)) |field| {
            if (comptime std.mem.eql(u8, field.name, "arena")) {
                // Arena is ownership, not wire data.
            } else if (comptime std.mem.eql(u8, field.name, "semantic_face_colors") or std.mem.eql(u8, field.name, "source_color_profile")) {
                if (@field(self, field.name)) |value| {
                    try writer.objectField(field.name);
                    try writer.write(value);
                }
            } else {
                try writer.objectField(field.name);
                try writer.write(@field(self, field.name));
            }
        }
        try writer.endObject();
    }
    pub fn deinit(self: *Source) void {
        self.arena.deinit();
        self.* = undefined;
    }
};
fn attribute(a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8) !?[]const u8 {
    const raw = (try tree.attributeValue(a, node, "", name)) orelse return null;
    return try raw.toUtf8(a, 4096);
}
fn edge(a: std.mem.Allocator, tree: *const Tree, node: usize) !Edge {
    return .{ .style = try attribute(a, tree, node, "type"), .width = try attribute(a, tree, node, "width"), .color = try attribute(a, tree, node, "color") };
}
fn unknownAttributes(a: std.mem.Allocator, tree: *const Tree, node: usize, names: []const []const u8) !usize {
    var tag = try @import("xml_part_attributes.zig").parseStartTag(a, tree, node);
    defer tag.deinit(a);
    const lexical = @import("../xml/root.zig");
    var count: usize = 0;
    for (tag.attributes) |attribute_value| {
        if (try lexical.namespaces.isDeclaration(attribute_value.name)) continue;
        const name = try lexical.qname.parse(attribute_value.name);
        var known = false;
        if (name.prefix == null) for (names) |wanted| {
            if (name.local.equals(wanted, false)) {
                known = true;
                break;
            }
        };
        if (!known) count += 1;
    }
    return count;
}
fn selectContainer(tree: *const Tree) !usize {
    if (tree.elements.len == 0 or !tree.elements[0].is(xml.head_uri, "head")) return error.InvalidBorderFillHeader;
    var container: ?usize = null;
    for (tree.elements, 0..) |element, index| {
        if (!element.is(xml.head_uri, "borderFills")) continue;
        const parent = element.parent orelse continue;
        if (!tree.elements[parent].is(xml.head_uri, "refList") or tree.elements[parent].parent != 0) continue;
        if (container != null) return error.DuplicateBorderFills;
        container = index;
    }
    return container orelse return error.MissingBorderFills;
}
fn sourceId(a: std.mem.Allocator, tree: *const Tree, node: usize) !u32 {
    const value = (try fields.optionalUnsigned(a, tree, node, "id", 4096)) orelse return error.MissingBorderFillId;
    return value;
}
/// Same original single-read selector; shared decoder is below.
pub fn read(a: std.mem.Allocator, tree: *const Tree, id: u32) !Source {
    const root = try selectContainer(tree);
    var found: ?usize = null;
    var cursor = tree.elements[root].first_child;
    while (cursor) |node| : (cursor = tree.elements[node].next_sibling) {
        if (!tree.elements[node].is(xml.head_uri, "borderFill")) continue;
        const source_id = try sourceId(a, tree, node);
        if (source_id != id) continue;
        if (found != null) return error.DuplicateBorderFillId;
        found = node;
    }
    return decodeSelected(a, tree, id, found orelse return error.MissingBorderFillId);
}

/// Request-owned ID inventory; borrowed immutable tree, owned map only.
/// Scan stops at the requested duplicate or the first numeric-ID failure.
/// A later query can resume after an unrelated requested duplicate, but never
/// skips a prior malformed ID. No unrequested duplicate becomes an error.
pub const Index = struct {
    const Entry = struct { node: usize, duplicate: bool = false };
    tree: *const Tree,
    source: []const u8,
    elements: []const @import("xml_part_tree.zig").Element,
    ids: std.AutoHashMap(u32, Entry),
    initialized: bool = false,
    complete: bool = false,
    cursor: ?usize = null,
    failure: ?anyerror = null,

    pub fn init(a: std.mem.Allocator, tree: *const Tree) Index {
        return .{ .tree = tree, .source = tree.source, .elements = tree.elements, .ids = .init(a) };
    }
    pub fn deinit(self: *Index) void {
        self.ids.deinit();
        self.* = undefined;
    }
    fn bind(self: *const Index, tree: *const Tree) !void {
        if (self.tree != tree or self.source.ptr != tree.source.ptr or self.source.len != tree.source.len or
            self.elements.ptr != tree.elements.ptr or self.elements.len != tree.elements.len) return error.SourceBindingMismatch;
    }
    fn select(self: *Index, a: std.mem.Allocator, tree: *const Tree, id: u32) !usize {
        try self.bind(tree);
        if (!self.initialized) {
            const root = try selectContainer(tree);
            self.cursor = tree.elements[root].first_child;
            self.initialized = true;
        }
        if (self.ids.get(id)) |entry| if (entry.duplicate) return error.DuplicateBorderFillId;
        while (!self.complete) {
            const node = self.cursor orelse {
                self.complete = true;
                break;
            };
            const next = tree.elements[node].next_sibling;
            if (!tree.elements[node].is(xml.head_uri, "borderFill")) {
                self.cursor = next;
                continue;
            }
            const value = sourceId(a, tree, node) catch |err| {
                if (err == error.OutOfMemory) return err;
                self.failure = err;
                self.complete = true;
                break;
            };
            if (self.ids.getPtr(value)) |entry| {
                entry.duplicate = true;
                self.cursor = next;
                if (value == id) return error.DuplicateBorderFillId;
            } else {
                try self.ids.put(value, .{ .node = node });
                self.cursor = next;
            }
        }
        if (self.failure) |err| return err;
        return if (self.ids.get(id)) |entry| entry.node else error.MissingBorderFillId;
    }
};

pub fn readWithIndex(a: std.mem.Allocator, tree: *const Tree, id: u32, index: *Index) !Source {
    return decodeSelected(a, tree, id, try index.select(a, tree, id));
}
fn decodeSelected(a: std.mem.Allocator, tree: *const Tree, id: u32, node: usize) !Source {
    var result: Source = .{ .arena = std.heap.ArenaAllocator.init(a), .id = id, .node = node };
    errdefer result.deinit();
    const owned = result.arena.allocator();
    result.unknown_attributes = try unknownAttributes(owned, tree, node, &.{ "id", "threeD", "shadow", "centerLine", "breakCellSeparateLine" });
    result.three_d = try attribute(owned, tree, node, "threeD");
    result.shadow = try attribute(owned, tree, node, "shadow");
    result.center_line = try attribute(owned, tree, node, "centerLine");
    var seen: [8]bool = @splat(false);
    var cursor = tree.elements[node].first_child;
    while (cursor) |child| : (cursor = tree.elements[child].next_sibling) {
        const element = tree.elements[child];
        var selected: ?usize = null;
        for (edge_names, 0..) |name, index| if (element.is(xml.head_uri, name)) {
            selected = index;
            break;
        };
        if (element.is(xml.head_uri, "diagonal")) selected = 4;
        if (element.is(xml.head_uri, "slash")) selected = 5;
        if (element.is(xml.head_uri, "backSlash")) selected = 6;
        if (element.is(xml.core_uri, "fillBrush")) selected = 7;
        const index = selected orelse {
            result.unknown_children += 1;
            continue;
        };
        if (seen[index]) return error.DuplicateBorderFillChild;
        seen[index] = true;
        if (index < 5) result.unknown_attributes += try unknownAttributes(owned, tree, child, &.{ "type", "width", "color" });
        if (index == 5 or index == 6) result.unknown_attributes += try unknownAttributes(owned, tree, child, &.{ "type", "Crooked", "isCounter" });
        if (index < 4) result.edges[index] = try edge(owned, tree, child) else switch (index) {
            4 => result.diagonal = try edge(owned, tree, child),
            5 => {
                result.slash_node = child;
                result.slash = try attribute(owned, tree, child, "type");
            },
            6 => {
                result.back_slash_node = child;
                result.back_slash = try attribute(owned, tree, child, "type");
            },
            7 => result.fill_node = child,
            else => unreachable,
        }
    }
    if (result.fill_node) |fill| result.fill_report = try @import("fill_brush.zig").inspectBrush(owned, tree, fill, .{});
    return result;
}
