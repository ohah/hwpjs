const std = @import("std");
const xml = @import("../xml/root.zig");

const prefix = "http://www.owpml.org/owpml/";

/// Recognizes the URI shape of later OWPML root namespaces for an explicit
/// unsupported-version diagnostic. This does not confer schema support.
pub fn isVersionedRoot(name: xml.namespaces.ExpandedName, local: []const u8, uri_suffix: []const u8) bool {
    if (!name.local.equals(local, false)) return false;
    const uri = name.uri;
    if (!std.mem.startsWith(u8, uri, prefix)) return false;
    const rest = uri[prefix.len..];
    if (rest.len != 4 + uri_suffix.len + 1 or rest[4] != '/') return false;
    for (rest[0..4]) |byte| if (!std.ascii.isDigit(byte)) return false;
    return std.mem.eql(u8, rest[5..], uri_suffix);
}

test "HWPX namespace profile recognizes only exact versioned root URI shapes" {
    const View = @import("../xml/text.zig").View;
    const name: xml.namespaces.ExpandedName = .{ .uri = "http://www.owpml.org/owpml/2021/section", .local = View{ .raw = "sec", .encoding = .utf8 } };
    try std.testing.expect(isVersionedRoot(name, "sec", "section"));
    try std.testing.expect(!isVersionedRoot(name, "head", "section"));
    try std.testing.expect(!isVersionedRoot(name, "sec", "head"));
    try std.testing.expect(isVersionedRoot(.{ .uri = "http://www.owpml.org/owpml/2024/head", .local = .{ .raw = "head", .encoding = .utf8 } }, "head", "head"));
    try std.testing.expect(!isVersionedRoot(.{ .uri = "http://www.owpml.org/owpml/20x1/section", .local = name.local }, "sec", "section"));
    try std.testing.expect(!isVersionedRoot(.{ .uri = "urn:other", .local = name.local }, "sec", "section"));
}
