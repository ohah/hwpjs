const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Spec = @import("shape_xml_fields.zig").Spec;

pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize, spec: Spec) !?u32 {
    return readValue(a, tree, node, spec, false);
}

pub fn readExtended(a: std.mem.Allocator, tree: *const Tree, node: usize, spec: Spec) !?u32 {
    return readValue(a, tree, node, spec, true);
}

fn readValue(a: std.mem.Allocator, tree: *const Tree, node: usize, spec: Spec, extensions: bool) !?u32 {
    const raw = (try tree.attributeValue(a, node, "", spec.name)) orelse return null;
    const text = try raw.toUtf8(a, 4096);
    defer a.free(text);
    for (spec.model_values, 0..) |value, index| if (std.mem.eql(u8, value, text)) return @intCast(index);
    if (extensions) for (spec.known_extensions, 0..) |value, index| {
        if (std.mem.eql(u8, value, text)) return @intCast(spec.model_values.len + index);
    };
    return error.UnsupportedPictureGeometryEnum;
}
