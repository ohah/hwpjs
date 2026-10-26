//! Field kinds whose labels/topology use the existing text-field adapters.
const std = @import("std");
pub fn supported(kind: []const u8) bool {
    return std.mem.eql(u8, kind, "HYPERLINK") or std.mem.eql(u8, kind, "CLICK_HERE") or std.mem.eql(u8, kind, "BOOKMARK");
}

test "text field kinds are exact and exclude computed or unknown fields" {
    try std.testing.expect(supported("HYPERLINK"));
    try std.testing.expect(supported("CLICK_HERE"));
    try std.testing.expect(supported("BOOKMARK"));
    for ([_][]const u8{ "FORMULA", "DATE", "", "hyperlink", "HYPERLINK ", "HYPERLINK\x00", "bookmark", "BOOKMARK ", "BOOKMARK\x00" }) |kind| try std.testing.expect(!supported(kind));
}
