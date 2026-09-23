const std = @import("std");
const xml = @import("../xml/root.zig");

fn parseStartTag(a: std.mem.Allocator, tree: anytype, index: usize) !xml.tags.Tag {
    const element = tree.elements[index];
    const raw = tree.source[element.start_tag.start..element.start_tag.end];
    var input = try xml.input.Input.init(raw, element.name.local.encoding, .{ .max_bytes = raw.len, .max_characters = raw.len });
    var tag = try xml.tags.parse(a, &input, .{});
    if (input.offset != raw.len or tag.kind == .end) {
        tag.deinit(a);
        return error.InvalidSourceSpan;
    }
    return tag;
}

/// Reconstructs the original namespace scope from the indexed ancestors.
/// This reuses the XML tag/value/namespace SSOT without retaining a second
/// per-element attribute table. Returned Value slices borrow the part source.
pub fn find(a: std.mem.Allocator, tree: anytype, index: usize, uri: []const u8, local: []const u8) !?xml.attribute_value.Value {
    if (index >= tree.elements.len) return error.InvalidElementIndex;
    // XML default namespaces never apply to unprefixed attributes. Most HWPX
    // fields use this path, so they need only the selected start tag.
    if (uri.len == 0) {
        var tag = try parseStartTag(a, tree, index);
        defer tag.deinit(a);
        for (tag.attributes) |attribute| {
            if (try xml.namespaces.isDeclaration(attribute.name)) continue;
            const name = try xml.qname.parse(attribute.name);
            if (name.prefix == null and name.local.equals(local, false)) return attribute.value;
        }
        return null;
    }
    var ancestry: std.ArrayList(usize) = .empty;
    defer ancestry.deinit(a);
    var cursor: usize = index;
    while (true) {
        try ancestry.append(a, cursor);
        const parent = tree.elements[cursor].parent orelse break;
        if (parent >= cursor) return error.InvalidSectionTreeDepth;
        cursor = parent;
    }
    var scope: xml.namespaces.State = .{};
    defer scope.deinit(a);
    var remaining = ancestry.items.len;
    while (remaining != 0) {
        remaining -= 1;
        const element_index = ancestry.items[remaining];
        var tag = try parseStartTag(a, tree, element_index);
        defer tag.deinit(a);
        _ = try scope.enter(a, tag, .{});
        if (element_index != index) continue;
        for (tag.attributes) |attribute| {
            if (try xml.namespaces.isDeclaration(attribute.name)) continue;
            const expanded = try scope.expandAttribute(attribute.name);
            if (std.mem.eql(u8, expanded.uri, uri) and expanded.local.equals(local, false)) return attribute.value;
        }
        return null;
    }
    unreachable;
}
