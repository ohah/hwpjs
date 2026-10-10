//! Exact borrowed UTF-16 bookmark-name lookup. No normalization or fallback.
const std = @import("std");
const rules = @import("control_rules.zig");
pub const Site = struct { section: usize, record_offset: usize, control_id: u32, name: []const u8 };
pub fn resolve(name: []const u8, sites: []const Site) !?Site {
    if (name.len == 0 or name.len % 2 != 0) return error.InvalidCrossReferenceName;
    var found: ?Site = null;
    for (sites) |site| {
        if (site.control_id != rules.id("%bmk") and site.control_id != rules.id("bokm")) return error.InvalidCrossReferenceBookmark;
        if (site.name.len % 2 != 0) return error.InvalidCrossReferenceName;
        if (!std.mem.eql(u8, name, site.name)) continue;
        if (found != null) return error.AmbiguousCrossReferenceTarget;
        found = site;
    }
    return found;
}
pub fn resolveCommand(view: @import("cross_reference_command.zig").View, sites: []const Site) !?Site {
    if (view.external_document != null) return error.UnsupportedExternalCrossReference;
    if ((try view.semantics()).targetSpace() != .bookmark_name) return error.UnsupportedCrossReferenceTargetSpace;
    return resolve(view.target.name, sites);
}
test "cross reference name target preserves spaces case and duplicate ambiguity" {
    const first = Site{ .section = 0, .record_offset = 12, .control_id = rules.id("%bmk"), .name = &.{ ' ', 0, 'A', 0 } };
    try std.testing.expectEqual(@as(usize, 12), (try resolve(first.name, &.{first})).?.record_offset);
    try std.testing.expect(try resolve(&.{ 'A', 0 }, &.{first}) == null);
    try std.testing.expect(try resolve(&.{ ' ', 0, 'a', 0 }, &.{first}) == null);
    try std.testing.expect(try resolve(first.name, &.{}) == null);
    var duplicate = first;
    duplicate.section = 2;
    duplicate.control_id = rules.id("bokm");
    try std.testing.expectError(error.AmbiguousCrossReferenceTarget, resolve(first.name, &.{ first, duplicate }));
    duplicate.control_id = rules.table_id;
    try std.testing.expectError(error.InvalidCrossReferenceBookmark, resolve(first.name, &.{ first, duplicate }));
    try std.testing.expectError(error.InvalidCrossReferenceName, resolve(&.{'A'}, &.{first}));
    try std.testing.expectError(error.InvalidCrossReferenceName, resolve(&.{}, &.{first}));
}

fn wire(comptime text: []const u8) [text.len * 2]u8 {
    var bytes: [text.len * 2]u8 = @splat(0);
    for (text, 0..) |c, index| bytes[index * 2] = c;
    return bytes;
}

test "cross reference name command never resolves an external alias or numeric object as bookmark" {
    const view = @import("cross_reference_command.zig").View;
    const site = Site{ .section = 0, .record_offset = 20, .control_id = rules.id("%bmk"), .name = &wire("name") };
    try std.testing.expectEqual(@as(usize, 20), (try resolveCommand(try view.parse(&wire("?name;6;1;0;0")), &.{site})).?.record_offset);
    try std.testing.expectError(error.UnsupportedExternalCrossReference, resolveCommand(try view.parse(&wire("C:\\other.hwp?name;6;1;0;0")), &.{site}));
    try std.testing.expectError(error.UnsupportedCrossReferenceTargetSpace, resolveCommand(try view.parse(&wire("?#20;0;1;0;0")), &.{site}));
    try std.testing.expectError(error.UnsupportedCrossReferenceTargetKind, resolveCommand(try view.parse(&wire("?#20;6;1;0;0")), &.{site}));
}
