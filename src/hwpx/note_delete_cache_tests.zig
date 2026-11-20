//! Exact source-scope matrix; distinct from Session/History lifecycle evidence.
const std = @import("std");
const scopes = @import("page_settings_layout_cache.zig");
const plans = @import("note_removal_plan.zig");
const owners = @import("note_mutation_owner.zig");
const a = std.testing.allocator;
const head = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:opaque'>";
const tail = "</s:sec>";
const known_cache = "<p:linesegarray><p:lineseg textpos='0' vertpos='0' vertsize='100' textheight='100' baseline='80' spacing='0' horzpos='0' horzsize='500' flags='0'/></p:linesegarray>";
const unknown_cache = "<p:linesegarray x:keep='opaque'><x:leaf keep='yes'/></p:linesegarray>";
const note_begin = "<p:ctrl><p:footNote id=''><p:subList id=''><p:p><p:run><p:ctrl><p:autoNum num='1' numType='FOOTNOTE'><p:autoNumFormat type='DIGIT'/></p:autoNum></p:ctrl><p:t>body</p:t></p:run>";
const note_end = "</p:p></p:subList></p:footNote></p:ctrl>";
fn find(tree: *const @import("xml_part_tree.zig").Tree) !usize {
    for (tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "footNote")) return index;
    }
    return error.MissingTestNote;
}
fn removal(allocator: std.mem.Allocator, source: []const u8) ![]u8 {
    var tree = try @import("section_tree.zig").parse(allocator, source, 0, 0, .{});
    defer tree.deinit(allocator);
    const owner = try owners.read(&tree, try find(&tree));
    try scopes.validateSubtree(allocator, &tree, .{ .root_node = owner.note_node });
    const plan = try plans.prepare(allocator, &tree, .{ .section = 0, .note_node = owner.note_node, .kind = .foot, .expected_source_sha256 = plans.digest(tree.source), .expected_marker_sha256 = plans.digest(tree.sourceOf(owner.control_node)) });
    return @import("xml_source_writer.zig").write(allocator, tree.source, plan.changes(), 100_000);
}
test "HWPX N02 scoped cache target free preserves unrelated prefix suffix picture other note matrix" {
    for ([_][]const u8{ known_cache, unknown_cache }) |cache| {
        const prefix = try std.fmt.allocPrint(a, "<p:p><p:run><p:t>prefix</p:t></p:run>{s}</p:p>", .{cache});
        defer a.free(prefix);
        const suffix = try std.fmt.allocPrint(a, "<p:p><p:run><p:t>suffix</p:t></p:run>{s}</p:p>", .{cache});
        defer a.free(suffix);
        const picture = try std.fmt.allocPrint(a, "<p:p><p:run><p:pic><p:subList><p:p><p:run><p:t>picture retained</p:t></p:run>{s}</p:p></p:subList></p:pic></p:run></p:p>", .{cache});
        defer a.free(picture);
        const other_note = try std.fmt.allocPrint(a, "<p:p><p:run><p:ctrl><p:endNote id=''><p:subList><p:p><p:run><p:ctrl><p:autoNum num='1' numType='ENDNOTE'/></p:ctrl><p:t>other</p:t></p:run>{s}</p:p></p:subList></p:endNote></p:ctrl></p:run></p:p>", .{cache});
        defer a.free(other_note);
        for ([_][]const u8{ prefix, suffix, picture, other_note }, 0..) |outside, index| {
            const before = if (index == 0) outside else "";
            const after = if (index == 0) "" else outside;
            const source = try std.fmt.allocPrint(a, "{s}{s}<p:p><p:run><p:t>A</p:t>{s}{s}<p:t>B</p:t></p:run></p:p>{s}{s}", .{ head, before, note_begin, note_end, after, tail });
            defer a.free(source);
            const expected = try std.fmt.allocPrint(a, "{s}{s}<p:p><p:run><p:t>A</p:t><p:t>B</p:t></p:run></p:p>{s}{s}", .{ head, before, after, tail });
            defer a.free(expected);
            const changed = try removal(a, source);
            defer a.free(changed);
            try std.testing.expectEqualStrings(expected, changed);
        }
    }
}
test "HWPX N02 scoped target note cache validates leaf children and opaque data" {
    for ([_][]const u8{
        "<p:linesegarray><p:lineseg><x:child/></p:lineseg></p:linesegarray>",
        "<p:linesegarray><p:lineseg>hidden</p:lineseg></p:linesegarray>",
        "<p:linesegarray><x:child/></p:linesegarray>",
        "<p:linesegarray>hidden</p:linesegarray>",
        "<p:linesegarray x:unknown='retain'/>",
        "<p:linesegarray><p:lineseg x:unknown='retain'/></p:linesegarray>",
    }) |cache| {
        const source = try std.fmt.allocPrint(a, "{s}<p:p><p:run>{s}{s}{s}</p:run></p:p>{s}", .{ head, note_begin, cache, note_end, tail });
        defer a.free(source);
        try std.testing.expectError(error.UnsupportedPageLayoutCache, removal(a, source));
    }
}
test "HWPX N02 scoped valid target cache removes only note and actual host cache" {
    const source = head ++ "<p:p><p:run><p:t>A</p:t>" ++ note_begin ++ known_cache ++ note_end ++ "<p:t>B</p:t></p:run>" ++ known_cache ++ "</p:p><p:p><p:run><p:t>outside</p:t></p:run>" ++ unknown_cache ++ "</p:p>" ++ tail;
    const changed = try removal(a, source);
    defer a.free(changed);
    try std.testing.expectEqualStrings(head ++ "<p:p><p:run><p:t>A</p:t><p:t>B</p:t></p:run></p:p><p:p><p:run><p:t>outside</p:t></p:run>" ++ unknown_cache ++ "</p:p>" ++ tail, changed);
}
test "HWPX N02 scoped validation leaves page geometry fullsection strict policy unchanged" {
    const source = head ++ "<p:p><p:run>" ++ note_begin ++ note_end ++ "</p:run></p:p><p:p><p:run><p:t>outside</p:t></p:run>" ++ unknown_cache ++ "</p:p>" ++ tail;
    const changed = try removal(a, source);
    defer a.free(changed);
    try std.testing.expectError(error.UnsupportedPageLayoutCache, scopes.remove(a, source, 0, 0, 100_000));
}
