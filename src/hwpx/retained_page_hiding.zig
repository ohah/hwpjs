//! Opaque page-hiding leaf retention, not flag interpretation or page layout.
const Tree = @import("xml_part_tree.zig").Tree;

pub fn settingSupported(tree: *const Tree, index: usize) bool {
    if (index >= tree.elements.len) return false;
    const setting = tree.elements[index];
    return setting.is(@import("document_xml.zig").paragraph_uri, "pageHiding") and
        setting.first_child == null and @import("element_whitespace_gaps.zig").empty(tree, index);
}

test "HWPX retained page hiding rejects hidden text nested payload and foreign names" {
    const std = @import("std");
    const a = std.testing.allocator;
    const cases = [_]struct { body: []const u8, accepted: bool }{
        .{ .body = "<p:pageHiding hideHeader='1' hideFooter='0' custom='retained'/>", .accepted = true },
        .{ .body = "<p:pageHiding/>", .accepted = true },
        .{ .body = "<p:pageHiding>hidden</p:pageHiding>", .accepted = false },
        .{ .body = "<p:pageHiding><p:t/></p:pageHiding>", .accepted = false },
        .{ .body = "<x:pageHiding/>", .accepted = false },
        .{ .body = "<p:unknown/>", .accepted = false },
        .{ .body = "hidden<p:pageHiding/>", .accepted = false },
    };
    for (cases) |case| {
        const source = try std.mem.concat(a, u8, &.{
            "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run><p:ctrl>",
            case.body,
            "</p:ctrl><p:t/></p:run></p:p></s:sec>",
        });
        defer a.free(source);
        var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectEqual(case.accepted, @import("retained_run_metadata.zig").supported(&tree, 3));
        try std.testing.expect(!settingSupported(&tree, tree.elements.len));
        try std.testing.expectEqualStrings(source, tree.source);
    }
}
