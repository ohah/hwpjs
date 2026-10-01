const std = @import("std");
const trees = @import("xml_part_tree.zig");
const sites_module = @import("text_sites.zig");
const locations_module = @import("text_site_locations.zig");
const edit = @import("plain_paragraph_edit.zig");

test "HWPX note edit allocation failures retain numbering and current text" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:footNote><p:subList><p:p><p:run><p:ctrl><p:autoNum num='1' numType='FOOTNOTE'><p:autoNumFormat/></p:autoNum></p:ctrl><p:t>A😀</p:t></p:run></p:p></p:subList></p:footNote></s:sec>";
    var tree = try trees.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const trees.Tree) !void {
            var sites = try sites_module.collect(allocator, parsed, .{});
            defer sites.deinit(allocator);
            const locations = try locations_module.build(allocator, parsed, &sites, .{});
            defer allocator.free(locations);
            _ = edit.splice(allocator, parsed, &sites, locations, 1, 1, 2, "한<&", 10000) catch |err| {
                try std.testing.expectEqualStrings("A😀", sites.items[0].text);
                try std.testing.expectEqualSlices(u8, source, parsed.source);
                return err;
            };
            const saved = try @import("text_sites_save.zig").write(allocator, parsed, &sites, .{}, 10000);
            defer allocator.free(saved);
            try std.testing.expect(std.mem.indexOf(u8, saved, "<p:autoNum num='1' numType='FOOTNOTE'><p:autoNumFormat/></p:autoNum>") != null);
            try std.testing.expect(std.mem.indexOf(u8, saved, "A한&lt;&amp;") != null);
        }
    }.run, .{&tree});
}

test "HWPX note edit rejects unowned nonprefix mixed and hidden numbering" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
    const marker = "<p:ctrl><p:autoNum num='1' numType='FOOTNOTE'><p:autoNumFormat/></p:autoNum></p:ctrl>";
    const body_prefix = "<p:footNote><p:subList><p:p><p:run>";
    const body_suffix = "<p:t>본문</p:t></p:run></p:p></p:subList></p:footNote>";
    const cases = [_][]const u8{
        "<p:p><p:run>" ++ marker ++ "<p:t>본문</p:t></p:run></p:p>",
        body_prefix ++ "<p:t>앞</p:t>" ++ marker ++ body_suffix,
        body_prefix ++ "<p:ctrl><p:autoNum><p:autoNumFormat/></p:autoNum><p:fieldBegin/></p:ctrl>" ++ body_suffix,
        body_prefix ++ "<p:ctrl>hidden<p:autoNum><p:autoNumFormat/></p:autoNum></p:ctrl>" ++ body_suffix,
        body_prefix ++ "<p:ctrl><p:autoNum>hidden<p:autoNumFormat/></p:autoNum></p:ctrl>" ++ body_suffix,
        body_prefix ++ "<p:ctrl><p:autoNum><p:autoNumFormat>hidden</p:autoNumFormat></p:autoNum></p:ctrl>" ++ body_suffix,
        body_prefix ++ "<p:ctrl><p:autoNum><p:autoNumFormat><p:t>hidden</p:t></p:autoNumFormat></p:autoNum></p:ctrl>" ++ body_suffix,
        body_prefix ++ "<p:ctrl><autoNum xmlns='urn:foreign'><p:autoNumFormat/></autoNum></p:ctrl>" ++ body_suffix,
    };
    for (cases) |body| {
        const source = try std.mem.concat(a, u8, &.{ prefix, body, "</s:sec>" });
        defer a.free(source);
        var tree = try trees.parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sites = try sites_module.collect(a, &tree, .{});
        defer sites.deinit(a);
        const locations = try locations_module.build(a, &tree, &sites, .{});
        defer a.free(locations);
        try std.testing.expectError(error.UnsupportedParagraphControl, edit.splice(a, &tree, &sites, locations, 1, 0, 0, "new", 10000));
        const saved = try @import("text_sites_save.zig").write(a, &tree, &sites, .{}, 10000);
        defer a.free(saved);
        try std.testing.expectEqualSlices(u8, source, saved);
    }
}

test "HWPX note edit actual four bodies preserve numbers save reopen and restore" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwpx", a, .limited(2_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    for ([_]usize{ 2, 3, 5, 6 }) |paragraph| {
        try std.testing.expect(try session.splice(0, paragraph, 0, 0, "검증😀<&"));
    }
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    for (session.sections[0].sites.items, reopened.sections[0].sites.items) |expected, actual| try std.testing.expectEqualStrings(expected.text, actual.text);
    const original = &session.sections[0].tree;
    const updated = &reopened.sections[0].tree;
    var count: usize = 0;
    for (original.elements, updated.elements, 0..) |before, after, index| {
        if (!before.is(@import("document_xml.zig").paragraph_uri, "autoNum")) continue;
        try std.testing.expect(after.is(@import("document_xml.zig").paragraph_uri, "autoNum"));
        try std.testing.expectEqualSlices(u8, original.sourceOf(index), updated.sourceOf(index));
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 4), count);
    try std.testing.expectError(error.UnsupportedParagraphControl, session.splice(0, 1, 0, 0, "x"));
    for ([_]usize{ 2, 3, 5, 6 }) |paragraph| {
        try std.testing.expect(try session.splice(0, paragraph, 0, 6, ""));
    }
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
}
