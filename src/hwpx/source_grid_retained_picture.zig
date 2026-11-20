//! Direct cell pictures are borrowed whole. Comments are admitted only after the
//! picture owner and known child structure have been proved, never by tag alone.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const xml = @import("document_xml.zig");

pub fn validate(a: std.mem.Allocator, tree: *const Tree, picture: usize, table: usize, limit: usize) !?usize {
    if (@import("run_anchor.zig").kind(tree, picture) != .picture) return error.UnsupportedSourceTableStructure;
    const paragraph = try @import("picture_display_host.zig").sourceTemplate(tree, picture);
    var owner = paragraph;
    for ([_][]const u8{ "subList", "tc", "tr", "tbl" }) |name| {
        owner = tree.elements[owner].parent orelse return error.UnsupportedSourceTableStructure;
        if (!fields.childIs(tree, owner, name)) return error.UnsupportedSourceTableStructure;
    }
    if (owner != table) return error.UnsupportedSourceTableStructure;
    const names = [_][]const u8{ "offset", "orgSz", "curSz", "flip", "rotationInfo", "renderingInfo", "imgRect", "imgClip", "inMargin", "img", "effects", "sz", "pos", "outMargin", "shapeComment" };
    var seen: [names.len]bool = @splat(false);
    var comment: ?usize = null;
    var image = false;
    var cursor = tree.elements[picture].first_child;
    while (cursor) |node| : (cursor = tree.elements[node].next_sibling) {
        var slot: ?usize = null;
        for (names, 0..) |name, i| {
            const uri = if (std.mem.eql(u8, name, "img")) xml.core_uri else xml.paragraph_uri;
            if (tree.elements[node].is(uri, name)) {
                slot = i;
                break;
            }
        }
        const i = slot orelse return error.UnsupportedSourceTableStructure;
        if (seen[i]) return error.UnsupportedSourceTableStructure;
        seen[i] = true;
        if (fields.childIs(tree, node, "renderingInfo")) {
            var matrix = tree.elements[node].first_child;
            while (matrix) |m| : (matrix = tree.elements[m].next_sibling) {
                if (@import("picture_matrix_fields.zig").kind(tree, m) == null or tree.elements[m].first_child != null) return error.UnsupportedSourceTableStructure;
            }
        } else if (fields.childIs(tree, node, "imgRect")) {
            const rectangle = try @import("picture_rectangle_values.zig").read(a, tree, picture);
            if (!rectangle.present or rectangle.unknown_children != 0) return error.UnsupportedSourceTableStructure;
            var point = tree.elements[node].first_child;
            while (point) |pt| : (point = tree.elements[pt].next_sibling) if (tree.elements[pt].first_child != null) return error.UnsupportedSourceTableStructure;
        } else if (tree.elements[node].first_child != null) return error.UnsupportedSourceTableStructure;
        if (fields.childIs(tree, node, "shapeComment")) comment = node;
        if (tree.elements[node].is(xml.core_uri, "img")) {
            const raw = (try tree.attributeValue(a, node, "", "binaryItemIDRef")) orelse return error.UnsupportedSourceTableStructure;
            const id = try raw.toUtf8(a, limit);
            defer a.free(id);
            if (id.len == 0) return error.UnsupportedSourceTableStructure;
            image = true;
        }
    }
    if (!image) return error.UnsupportedSourceTableStructure;
    const box = try @import("picture_geometry_values.zig").read(a, tree, picture);
    if (box.width == null or box.height == null) return error.UnsupportedSourceTableGeometry;
    _ = try @import("picture_dimension_values.zig").read(a, tree, picture);
    _ = try @import("picture_crop_values.zig").read(a, tree, picture);
    _ = try @import("picture_flow_values.zig").read(a, tree, picture);
    var transforms = try @import("picture_transform_values.zig").read(a, tree, picture, limit);
    defer transforms.deinit(a);
    if (transforms.unknown_matrix_nodes != 0) return error.UnsupportedSourceTableStructure;
    for (transforms.matrices) |matrix| for (matrix.values) |value| if (value) |number| {
        if (!std.math.isFinite(number)) return error.UnsupportedSourceTableGeometry;
    };
    return comment;
}

pub fn comments(a: std.mem.Allocator, tree: *const Tree, table: usize, limit: usize) ![]bool {
    const accepted = try a.alloc(bool, tree.elements.len);
    errdefer a.free(accepted);
    @memset(accepted, false);
    const root = tree.elements[table];
    for (tree.elements, 0..) |e, node| {
        if (e.start_tag.start <= root.start_tag.start or e.end > root.end or !fields.childIs(tree, node, "pic")) continue;
        if (try validate(a, tree, node, table, limit)) |comment| accepted[comment] = true;
    }
    return accepted;
}
