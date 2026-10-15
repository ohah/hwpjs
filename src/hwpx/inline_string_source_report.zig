//! Original inline strings only; never a current paragraph/layout snapshot.
const std = @import("std");

pub fn read(a: std.mem.Allocator, session: *const @import("editor_session.zig").Session) !@import("inline_string_controls.zig").Report {
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, session.sections.len);
    defer a.free(trees);
    for (session.sections, trees) |section, *tree| {
        if (section.tree.elements.len == 0) return error.InvalidPartTree;
        // raw_xml is a JSON string in this packet, not an encoded byte blob.
        if (section.tree.elements[0].name.local.encoding != .utf8) return error.UnsupportedSourceEncoding;
        tree.* = section.tree;
    }
    return @import("inline_string_controls.zig").inspect(a, trees, .{});
}

test "inline string source report retains ownership on all allocation failures" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:dutmal><p:mainText>A😀</p:mainText><p:subText>주석</p:subText></p:dutmal></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sections = [_]@import("editor_session.zig").Section{.{ .tree = tree, .sites = .{ .items = &.{} }, .locations = &.{}, .entry_index = 0, .first_paragraph = 1, .last_paragraph = 1 }};
    const session: @import("editor_session.zig").Session = .{ .allocator = a, .source = &.{}, .sections = &sections, .options = .{} };
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, borrowed: *const @import("editor_session.zig").Session) !void {
            var report = try read(allocator, borrowed);
            defer report.deinit();
            try std.testing.expectEqual(@as(usize, 1), report.controls.len);
            try std.testing.expectEqualStrings("A😀", report.texts[0].value);
            try std.testing.expectEqualStrings("주석", report.texts[1].value);
        }
    };
    try Probe.run(a, &session);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{&session});
    try std.testing.expectEqualStrings(source, tree.source);
}
