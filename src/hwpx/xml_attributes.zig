const std = @import("std");
const xml = @import("../xml/root.zig");

pub fn element(tag: xml.tags.Tag, scope: *const xml.namespaces.State, uri: []const u8, local: []const u8) !bool {
    const name = try scope.expandElement(tag.name);
    return std.mem.eql(u8, name.uri, uri) and name.local.equals(local, false);
}

/// Returns owned, XML-normalized UTF-8. XML's expanded-attribute uniqueness
/// check is performed by the shared document visitor before this lookup.
pub fn attribute(a: std.mem.Allocator, tag: xml.tags.Tag, scope: *const xml.namespaces.State, local: []const u8, max_bytes: usize) !?[]u8 {
    return attributeInNamespace(a, tag, scope, "", local, max_bytes);
}

pub fn attributeInNamespace(a: std.mem.Allocator, tag: xml.tags.Tag, scope: *const xml.namespaces.State, uri: []const u8, local: []const u8, max_bytes: usize) !?[]u8 {
    for (tag.attributes) |attr| {
        if (try xml.namespaces.isDeclaration(attr.name)) continue;
        const name = try scope.expandAttribute(attr.name);
        if (std.mem.eql(u8, name.uri, uri) and name.local.equals(local, false)) {
            return try attr.value.toUtf8(a, max_bytes);
        }
    }
    return null;
}
