const std = @import("std");
const trees = @import("xml_part_tree.zig");
const owners = @import("note_mutation_owner.zig");
const plans = @import("note_removal_plan.zig");
const a = std.testing.allocator;
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:opaque'>";
const body = "<p:subList><p:p><p:run><p:ctrl><p:autoNum num='1' numType='FOOTNOTE'><p:autoNumFormat/></p:autoNum></p:ctrl><p:t>body</p:t></p:run></p:p></p:subList>";
const marker = "<p:ctrl><p:footNote>" ++ body ++ "</p:footNote></p:ctrl>";
const before = "<p:p data-opaque='keep'><p:run><p:t>A</p:t>";
const after = "<p:t>B</p:t></p:run></p:p><x:tail keep='yes'/>";
const cache = "<p:linesegarray><p:lineseg textpos='0' vertpos='0' vertsize='100' textheight='100' baseline='80' spacing='0' horzpos='0' horzsize='500' flags='0'/></p:linesegarray>";
fn firstNote(tree: *const trees.Tree) !usize {
    for (tree.elements, 0..) |element, index|
        if (element.is(@import("document_xml.zig").paragraph_uri, "footNote") or
            element.is(@import("document_xml.zig").paragraph_uri, "endNote")) return index;
    return error.MissingTestNote;
}
fn targetFor(tree: *const trees.Tree) !plans.Target {
    const owner = try owners.read(tree, try firstNote(tree));
    return .{ .section = owner.section, .note_node = owner.note_node, .kind = owner.kind, .expected_source_sha256 = plans.digest(tree.source), .expected_marker_sha256 = plans.digest(tree.sourceOf(owner.control_node)) };
}

test "HWPX N02 note owner joins existing marker ancestry and direct body list" {
    var tree = try trees.parse(a, prefix ++ before ++ marker ++ after ++ "</s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    const owner = try owners.read(&tree, try firstNote(&tree));
    try std.testing.expectEqual(owners.Kind.foot, owner.kind);
    try std.testing.expectEqual(@as(usize, 1), owner.direct_paragraphs);
    try std.testing.expectEqualStrings(marker, tree.sourceOf(owner.control_node));
    try std.testing.expectEqual(owner.note_node, (try @import("note_paragraph_context.zig").read(&tree, tree.elements[owner.list_node].first_child.?)).?.note_node);
    const end_body = "<p:subList><p:p><p:run><p:ctrl><p:autoNum num='1' numType='ENDNOTE'><p:autoNumFormat/></p:autoNum></p:ctrl><p:t>end body</p:t></p:run></p:p></p:subList>";
    var end_tree = try trees.parse(a, prefix ++ before ++ "<p:ctrl><p:endNote>" ++ end_body ++ "</p:endNote></p:ctrl>" ++ after ++ "</s:sec>", .section, 1, 0, .{});
    defer end_tree.deinit(a);
    const end_owner = try owners.read(&end_tree, try firstNote(&end_tree));
    try std.testing.expectEqual(owners.Kind.end, end_owner.kind);
    try std.testing.expectEqual(@as(usize, 1), end_owner.section);
}
test "HWPX N02 note owner preserves actual nonfirst section ordinal" {
    var tree = try trees.parse(a, prefix ++ before ++ marker ++ after ++ "</s:sec>", .section, 2, 9, .{});
    defer tree.deinit(a);
    var target = try targetFor(&tree);
    const plan = try plans.prepare(a, &tree, target);
    try std.testing.expectEqual(@as(usize, 2), plan.owner.section);
    target.section = 0;
    try std.testing.expectError(error.SourceBindingMismatch, plans.prepare(a, &tree, target));
}
test "HWPX N02 note marker removal plan retains all outside bytes and no source mutation" {
    const input = prefix ++ before ++ marker ++ after ++ "</s:sec>";
    var tree = try trees.parse(a, input, .section, 0, 0, .{});
    defer tree.deinit(a);
    const plan = try plans.prepare(a, &tree, try targetFor(&tree));
    try plan.verifySource(&tree);
    const changed = try @import("xml_source_writer.zig").write(a, tree.source, plan.changes(), 10000);
    defer a.free(changed);
    try std.testing.expectEqualStrings(prefix ++ before ++ after ++ "</s:sec>", changed);
    try std.testing.expectEqualStrings(input, tree.source);
}
test "HWPX N02 note removal planning rejects stale source marker and wrong kind" {
    const input = prefix ++ before ++ marker ++ after ++ "</s:sec>";
    var tree = try trees.parse(a, input, .section, 0, 0, .{});
    defer tree.deinit(a);
    const target = try targetFor(&tree);
    var wrong = target;
    wrong.expected_source_sha256[0] ^= 1;
    try std.testing.expectError(error.SourceHashMismatch, plans.prepare(a, &tree, wrong));
    wrong = target;
    wrong.expected_marker_sha256[0] ^= 1;
    try std.testing.expectError(error.StaleNoteMutationOwner, plans.prepare(a, &tree, wrong));
    wrong = target;
    wrong.kind = .end;
    try std.testing.expectError(error.SourceBindingMismatch, plans.prepare(a, &tree, wrong));
    try std.testing.expectEqualStrings(input, tree.source);
}
test "HWPX N02 note owner rejects mixed hidden foreign and duplicate list envelopes" {
    for ([_][]const u8{
        "<p:ctrl>hidden<p:footNote>" ++ body ++ "</p:footNote></p:ctrl>",
        "<p:ctrl><p:footNote>" ++ body ++ "</p:footNote><p:fieldBegin/></p:ctrl>",
        "<p:ctrl><p:footNote><x:subList/></p:footNote></p:ctrl>",
        "<p:ctrl><p:footNote>" ++ body ++ body ++ "</p:footNote></p:ctrl>",
    }) |fragment| {
        var tree = try trees.parse(a, prefix ++ before ++ fragment ++ after ++ "</s:sec>", .section, 0, 0, .{});
        defer tree.deinit(a);
        const result = owners.read(&tree, try firstNote(&tree));
        if (result) |_| return error.TestExpectedError else |err| {
            try std.testing.expect(err == error.UnsupportedNoteMutationOwner or err == error.UnsupportedNoteMutationBody);
        }
    }
}
test "HWPX N02 note removal validates and invalidates only exact host line cache" {
    const source = prefix ++ "<p:p><p:run><p:t>A</p:t>" ++ marker ++ "<p:t>B</p:t></p:run>" ++ cache ++ "</p:p><p:p><p:run><p:t>outside</p:t></p:run>" ++ cache ++ "</p:p></s:sec>";
    var tree = try trees.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const plan = try plans.prepare(a, &tree, try targetFor(&tree));
    try std.testing.expectEqual(@as(usize, 2), plan.count);
    const changed = try @import("xml_source_writer.zig").write(a, tree.source, plan.changes(), 10000);
    defer a.free(changed);
    try std.testing.expectEqualStrings(prefix ++ "<p:p><p:run><p:t>A</p:t><p:t>B</p:t></p:run></p:p><p:p><p:run><p:t>outside</p:t></p:run>" ++ cache ++ "</p:p></s:sec>", changed);
    try std.testing.expectEqualStrings(source, tree.source);
}
fn allocationTrial(allocator: std.mem.Allocator, source: []const u8, expected: []const u8) !void {
    var tree = try trees.parse(allocator, source, .section, 0, 0, .{});
    defer tree.deinit(allocator);
    const plan = try plans.prepare(allocator, &tree, try targetFor(&tree));
    const changed = try @import("xml_source_writer.zig").write(allocator, tree.source, plan.changes(), 10000);
    defer allocator.free(changed);
    try std.testing.expectEqualStrings(expected, changed);
    try std.testing.expectEqualStrings(source, tree.source);
}
test "HWPX N02 note span planning allocation failure ownership is independent and exact" {
    const source = prefix ++ "<p:p><p:run><p:t>A</p:t>" ++ marker ++ "<p:t>B</p:t></p:run>" ++ cache ++ "</p:p></s:sec>";
    const expected = prefix ++ "<p:p><p:run><p:t>A</p:t><p:t>B</p:t></p:run></p:p></s:sec>";
    try @import("../testing/allocation_failures.zig").check(allocationTrial, .{ source, expected });
}
test "HWPX N02 note planner rejects an opaque cache rather than dropping it" {
    const source = prefix ++ "<p:p><p:run><p:t>A</p:t>" ++ marker ++ "<p:t>B</p:t></p:run><p:linesegarray opaque='keep'/></p:p></s:sec>";
    var tree = try trees.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.UnsupportedSourceLineCache, plans.prepare(a, &tree, try targetFor(&tree)));
    try std.testing.expectEqualStrings(source, tree.source);
}
