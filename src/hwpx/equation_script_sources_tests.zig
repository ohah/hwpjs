const std = @import("std");
const editor = @import("editor_session.zig");
const sources = @import("equation_script_sources.zig");
const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run>" ++
    "<p:equation><p:script>A</p:script></p:equation>" ++
    "<p:equation><x:script/></p:equation>" ++
    "<p:equation><p:script/><p:script/></p:equation>" ++
    "<p:equation><p:script><x:child/></p:script></p:equation>" ++
    "<p:switch><p:case required-namespace='urn:unsupported'><p:p><p:run><p:equation><p:script>x</p:script></p:equation></p:run></p:p></p:case><p:default/></p:switch>" ++
    "<p:t><p:p><p:run><p:equation><p:script>x</p:script></p:equation></p:run></p:p></p:t>" ++
    "<x:equation/><p:script>not an equation</p:script></p:run></p:p></s:sec>";

test "equation script sources retain unavailable rows and immutable identities" {
    const a = std.testing.allocator;
    // Source-only fixture deliberately contains nested script content that a
    // document-wide semantic inspection would reject. Listing must retain it.
    var session = try @import("editor_history_test_fixture.zig").open(a, xml, 1);
    defer session.deinit();
    const rows = try sources.read(a, &session, 0);
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 6), rows.len);
    const expected = [_]?sources.Issue{ null, .missing_script, .multiple_scripts, .nested_script, .inactive, .inline_text_descendant };
    for (rows, expected) |row, issue| try std.testing.expectEqual(issue, row.issue);
    try std.testing.expectEqual(@as(usize, 0), rows[1].script_count);
    try std.testing.expect(rows[1].script_node == null);
    try std.testing.expectEqual(@as(usize, 2), rows[2].script_count);
    try std.testing.expect(!rows[4].active);
    try std.testing.expectError(error.InvalidSectionIndex, sources.read(a, &session, 999));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const editor.Session) !void {
            const items = try sources.read(allocator, original, 0);
            defer allocator.free(items);
            try std.testing.expectEqual(@as(usize, 6), items.len);
        }
    }.run, .{&session});
}

test "equation script sources stay original across current edits and history" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/수식-문자처럼취급-아님.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const before = try sources.read(a, &session, 0);
    defer a.free(before);
    try std.testing.expectEqual(@as(usize, 1), before.len);
    try std.testing.expect(before[0].issue == null);
    try std.testing.expect(try session.setEquationScript(0, before[0].node, "new😀<&"));
    const after = try sources.read(a, &session, 0);
    defer a.free(after);
    try std.testing.expectEqualDeep(before, after);
    const text = try session.equationScript(0, after[0].node);
    defer a.free(text);
    try std.testing.expectEqualStrings("new😀<&", text);
}

test "equation script sources expose unsupported UTF16 instead of dropping equations" {
    const a = std.testing.allocator;
    for ([_]std.builtin.Endian{ .little, .big }) |endian| {
        const bytes = try a.alloc(u8, 2 + xml.len * 2);
        defer a.free(bytes);
        std.mem.writeInt(u16, bytes[0..2], 0xfeff, endian);
        for (xml, 0..) |byte, index| std.mem.writeInt(u16, bytes[2 + index * 2 ..][0..2], byte, endian);
        // The editable Session opener rejects UTF16 in text-site collection.
        // Exercise this source projection over a parsed tree, not a false claim
        // that UTF16 is publicly editable. All storage here remains borrowed.
        var tree = try @import("xml_part_tree.zig").parse(a, bytes, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sections = [_]editor.Section{.{ .tree = tree, .sites = .{ .items = &.{} }, .locations = &.{}, .entry_index = 0, .first_paragraph = 1, .last_paragraph = 1 }};
        const session: editor.Session = .{ .allocator = a, .source = bytes, .sections = &sections, .options = .{} };
        const rows = try sources.read(a, &session, 0);
        defer a.free(rows);
        try std.testing.expectEqual(@as(usize, 6), rows.len);
        try std.testing.expectEqual(sources.Issue.unsupported_encoding, rows[0].issue.?);
        try std.testing.expectEqual(sources.Issue.inactive, rows[4].issue.?);
        try std.testing.expectEqual(sources.Issue.inline_text_descendant, rows[5].issue.?);
    }
}
