//! Bookmark-name result only; never reuse stored output as a current value.
const std = @import("std");
const command = @import("cross_reference_command.zig");
const target = @import("cross_reference_name_target.zig");

/// Result borrows the resolved site name. No mutation, I/O or page calculation.
pub fn supports(view: command.View) !bool {
    const semantic = try view.semantics();
    return view.external_document == null and semantic.object == .bookmark and semantic.content == .number_or_name;
}
pub fn evaluate(view: command.View, sites: []const target.Site) ![]const u8 {
    if (!(try supports(view))) return if (view.external_document != null) error.UnsupportedExternalCrossReference else error.UnsupportedCrossReferenceResultKind;
    const site = (try target.resolveCommand(view, sites)) orelse return error.UnresolvedCrossReferenceTarget;
    return site.name;
}

fn wire(comptime text: []const u8) [text.len * 2]u8 {
    var bytes: [text.len * 2]u8 = @splat(0);
    for (text, 0..) |c, index| bytes[index * 2] = c;
    return bytes;
}

test "cross reference bookmark name result rejects missing stale cached substitutes and external aliases" {
    const site = target.Site{ .section = 0, .record_offset = 12, .control_id = @import("control_rules.zig").id("bokm"), .name = &wire(" name ") };
    const view = try command.View.parse(&wire("? name ;6;1;1;0;"));
    const result = try evaluate(view, &.{site});
    try std.testing.expectEqualSlices(u8, site.name, result);
    try std.testing.expectEqual(@intFromPtr(site.name.ptr), @intFromPtr(result.ptr));
    try std.testing.expectError(error.UnresolvedCrossReferenceTarget, evaluate(view, &.{}));
    try std.testing.expectError(error.UnresolvedCrossReferenceTarget, evaluate(try command.View.parse(&wire("?name;6;1;0;0;")), &.{site}));
    try std.testing.expectError(error.AmbiguousCrossReferenceTarget, evaluate(view, &.{ site, site }));
    try std.testing.expectError(error.UnsupportedExternalCrossReference, evaluate(try command.View.parse(&wire("C:\\other.hwp? name ;6;1;0;0")), &.{site}));
    var renamed = site;
    renamed.name = &wire("current");
    try std.testing.expectError(error.UnresolvedCrossReferenceTarget, evaluate(view, &.{renamed}));
    try std.testing.expectEqualSlices(u8, renamed.name, try evaluate(try command.View.parse(&wire("?current;6;1;0;0")), &.{renamed}));
    inline for (.{ "? name ;6;0;1;0;", "? name ;6;2;1;0;", "? name ;6;3;1;0;", "?#12;0;1;0;0;" }) |text| {
        try std.testing.expectError(error.UnsupportedCrossReferenceResultKind, evaluate(try command.View.parse(&wire(text)), &.{site}));
    }
}
