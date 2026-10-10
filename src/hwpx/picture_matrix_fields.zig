//! Shared matrix namespace, kind and coefficient order.
const Tree = @import("xml_part_tree.zig").Tree;
const std = @import("std");
pub const Kind = enum { translation, scale, rotation };
pub const names = [_][]const u8{ "e1", "e2", "e3", "e4", "e5", "e6" };
pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize) ![6]?f64 {
    if (kind(tree, node) == null) return error.InvalidPictureMatrixNode;
    var values: [6]?f64 = @splat(null);
    for (names, 0..) |name, index| {
        const raw = (try tree.attributeValue(a, node, "", name)) orelse continue;
        const bytes = try raw.toUtf8(a, 4096);
        defer a.free(bytes);
        values[index] = try @import("xml_values.zig").float64(bytes);
    }
    return values;
}
pub fn kind(tree: *const Tree, node: usize) ?Kind {
    if (node >= tree.elements.len) return null;
    const element = tree.elements[node];
    const uri = @import("document_xml.zig").core_uri;
    if (element.is(uri, "transMatrix")) return .translation;
    if (element.is(uri, "scaMatrix")) return .scale;
    if (element.is(uri, "rotMatrix")) return .rotation;
    return null;
}
