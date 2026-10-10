//! Shared source-bound attribute replacement; value semantics are injected.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const writer = @import("xml_source_writer.zig");

pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, comptime names: []const []const u8, comptime Value: type, values: [names.len]Value, comptime equal: anytype, comptime serialize: anytype, max_bytes: usize) ![]u8 {
    comptime {
        for (names, 0..) |name, index| {
            if (name.len == 0) @compileError("Attribute name must not be empty");
            for (names[0..index]) |previous| if (std.mem.eql(u8, previous, name)) @compileError("Duplicate attribute name");
        }
    }
    if (node >= tree.elements.len) return error.InvalidXmlAttributeNode;
    if (tree.elements[node].name.local.encoding != .utf8) return error.UnsupportedEditEncoding;
    var attributes: [names.len]?@import("../xml/attribute_value.zig").Value = undefined;
    try tree.unprefixedAttributeValues(a, node, names, &attributes);
    const span = tree.elements[node].start_tag;
    const raw = tree.source[span.start..span.end];
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    var owned: std.ArrayList([]u8) = .empty;
    defer {
        for (owned.items) |bytes| a.free(bytes);
        owned.deinit(a);
    }
    for (attributes, values) |attribute, value| {
        const existing = attribute orelse return error.MissingXmlAttribute;
        if (try equal(a, existing, value)) continue;
        const replacement = try serialize(a, existing.raw[0], value);
        owned.append(a, replacement) catch |err| {
            a.free(replacement);
            return err;
        };
        const start = @intFromPtr(existing.raw.ptr) - @intFromPtr(raw.ptr);
        try changes.append(a, .{ .start = start, .end = start + existing.raw.len, .text = "", .serialized_xml = replacement });
    }
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, left: writer.Change, right: writer.Change) bool {
            return left.start < right.start;
        }
    }.less);
    return writer.write(a, raw, changes.items, max_bytes);
}
