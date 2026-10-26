const std = @import("std");

test "switch anchor text transaction preserves source and rolls back every allocation failure" {
    const a = std.testing.allocator;
    const object = "<p:switch><p:case p:required-namespace='urn:chart'><p:chart future='opaque'/></p:case><p:default><p:ole future='fallback'/></p:default></p:switch>";
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀</p:t>" ++ object ++ "<p:t>B</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree) !void {
            var sites = try @import("text_sites.zig").collect(allocator, parsed, .{});
            defer sites.deinit(allocator);
            const locations = try @import("text_site_locations.zig").build(allocator, parsed, &sites, .{});
            defer allocator.free(locations);
            _ = @import("anchor_paragraph_edit.zig").splice(allocator, parsed, &sites, locations, 1, 4, 1, "뒤😀<&", 10000) catch |err| {
                try std.testing.expectEqualStrings("A😀", sites.items[0].text);
                try std.testing.expectEqualStrings("B", sites.items[1].text);
                return err;
            };
            const saved = try @import("text_sites_save.zig").write(allocator, parsed, &sites, .{}, 10000);
            defer allocator.free(saved);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, object));
            try std.testing.expect(std.mem.indexOf(u8, saved, "뒤😀&lt;&amp;") != null);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(source, tree.source);
}

test "switch anchor actual chart surrounding text saves reopens and protects wrapper" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const original = try session.anchorText(0, 1);
    defer a.free(original);
    try std.testing.expectEqualStrings("\xef\xbf\xbc", original);
    const tree = &session.sections[0].tree;
    var wrapper: ?usize = null;
    for (tree.elements, 0..) |_, index| if (@import("run_anchor.zig").kind(tree, index) == .conditional_object) {
        try std.testing.expect(wrapper == null);
        wrapper = index;
    };
    const raw = try a.dupe(u8, tree.sourceOf(wrapper.?));
    defer a.free(raw);
    var history = try @import("editor_history.zig").History.init(&session, 8, 4000000);
    defer history.deinit();
    const baseline = try session.save();
    defer a.free(baseline);
    try std.testing.expect(try history.apply(&session, .{ .kind = .anchored, .paragraph = 1, .start = 1, .deleted = 0, .inserted = "한😀<&" }));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    const text = try reopened.anchorText(0, 1);
    defer a.free(text);
    try std.testing.expectEqualStrings("\xef\xbf\xbc한😀<&", text);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, reopened.sections[0].tree.source, raw));
    try std.testing.expectError(error.ProtectedInlineControl, session.spliceAnchored(0, 1, 0, 1, ""));
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, saved, unchanged);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, baseline, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}
