const std = @import("std");
pub const xml = "http://www.w3.org/XML/1998/namespace";
pub const xmlns = "http://www.w3.org/2000/xmlns/";
/// Normalized attribute scalars -> owned UTF-8, with exact character identity.
/// No URI dereference, case folding, percent decoding, or URI syntax validation.
pub fn normalize(a: std.mem.Allocator, value: @import("attribute_value.zig").Value, max_bytes: usize) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    var iterator = try value.iterator();
    while (try iterator.next()) |part| {
        const c = part.scalar() orelse return error.UnresolvedXmlEntity;
        var encoded: [4]u8 = undefined;
        const n = try std.unicode.utf8Encode(c, &encoded);
        if (n > max_bytes - out.items.len) return error.LimitExceeded;
        try out.appendSlice(a, encoded[0..n]);
    }
    return out.toOwnedSlice(a);
}
pub fn validate(prefix: @import("text.zig").View, uri: []const u8) !void {
    const is_xml = prefix.equals("xml", false);
    if (prefix.equals("xmlns", false) or std.mem.eql(u8, uri, xmlns)) return error.ReservedXmlNamespace;
    if (is_xml != std.mem.eql(u8, uri, xml)) return error.ReservedXmlNamespace;
    if (prefix.raw.len != 0 and uri.len == 0) return error.EmptyXmlPrefixBinding;
}
