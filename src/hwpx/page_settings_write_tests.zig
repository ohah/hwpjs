const std = @import("std");
const a = std.testing.allocator;
const editor = @import("editor_session.zig");
const histories = @import("editor_history.zig");
const own = @import("page_settings_edit_owners.zig");
const t = @import("page_settings_edit_types.zig");
const write = @import("page_settings_write.zig");
const pre = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:opaque'><p:p id='1'><p:run><p:secPr x:retain='a'>";
const post = "</p:secPr></p:run></p:p></s:sec>";
const page = "<p:pagePr landscape='WIDELY' width='60000' height='90000' gutterType='LEFT_ONLY' x:width='99'><p:margin header='1000' footer='1000' gutter='100' left='5000' right='6000' top='4000' bottom='5000' x:opaque='keep'/><x:extension a='&amp;'>keep</x:extension></p:pagePr>";
const changed: t.Values = .{ .orientation = .narrowly, .width = 70000, .height = 100000, .gutter_type = .top_bottom, .margin = .{ .header = 1200, .footer = 1300, .gutter = 2100, .left = 5100, .right = 6200, .top = 4100, .bottom = 5200 } };
fn parse(source: []const u8) !@import("xml_part_tree.zig").Tree {
    return @import("section_tree.zig").parse(a, source, 0, 0, .{});
}
test "page settings writer exact owner source surgery and explicit missing attributes" {
    for ([_][]const u8{ pre ++ page ++ post, pre ++ "<p:pagePr x:opaque='keep'/>" ++ post, pre ++ "<p:pagePr landscape='WIDELY' width='60000' height='90000' gutterType='LEFT_ONLY'><x:extension/></p:pagePr>" ++ post }) |source| {
        var tree = try parse(source);
        defer tree.deinit(a);
        const owners = try own.inspect(a, &.{tree});
        defer a.free(owners);
        try std.testing.expect(owners[0].target != null);
        const out = try write.writeTree(a, &tree, owners[0].target.?, changed, 100000);
        defer a.free(out);
        try std.testing.expect(std.mem.indexOf(u8, out, "x:opaque='keep'") != null or std.mem.indexOf(u8, out, "<x:extension/>") != null);
        var result = try parse(out);
        defer result.deinit(a);
        const next = try own.inspect(a, &.{result});
        defer a.free(next);
        try std.testing.expect(t.equals(next[0].target.?.expected, changed));
        try std.testing.expectEqualStrings(source, tree.source);
        const noop = try write.writeTree(a, &result, next[0].target.?, changed, 100000);
        defer a.free(noop);
        try std.testing.expectEqualSlices(u8, out, noop);
    }
}
test "page settings writer distinguishes missing duplicate and conditional owners" {
    const cases = [_]struct { source: []const u8, reason: @FieldType(t.Owner, "reason") }{
        .{ .source = pre ++ post, .reason = .MissingPageSettings },
        .{ .source = pre ++ "<x:switch><x:case>" ++ page ++ "</x:case></x:switch>" ++ post, .reason = .UnsupportedPageSettingsOwner },
        .{ .source = pre ++ page ++ page ++ post, .reason = .AmbiguousPageSettings },
        .{ .source = pre ++ "<p:pagePr><p:margin/><p:margin/></p:pagePr>" ++ post, .reason = .DuplicatePageMargin },
        .{ .source = pre ++ "<p:pagePr><x:switch><p:margin/></x:switch></p:pagePr>" ++ post, .reason = .UnsupportedPageSettingsOwner },
    };
    for (cases) |c| {
        var tree = try parse(c.source);
        defer tree.deinit(a);
        const owners = try own.inspect(a, &.{tree});
        defer a.free(owners);
        try std.testing.expectEqual(c.reason, owners[0].reason);
        try std.testing.expect(owners[0].target == null);
    }
}
fn request(targets: []const t.Target) t.Request {
    return .{ .binding = .{ .session = "s1", .revision = 0, .serial = "0" }, .scope = .section, .targets = targets, .values = changed };
}
fn command(r: *const t.Request) histories.Command {
    return .{ .kind = .page_settings, .page_settings = r, .section = 0, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "" };
}
test "page settings writer native prepare commit one history undo redo and reopen" {
    const input = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try histories.History.initV2(&session, .{});
    defer history.deinit();
    const owners = try own.observe(a, &session);
    defer a.free(owners);
    const targets = [_]t.Target{owners[0].target.?};
    const r = request(&targets);
    try std.testing.expect(try history.apply(&session, command(&r)));
    try std.testing.expectEqual(@as(u32, 1), history.revision());
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expect(!std.mem.eql(u8, input, saved));
    try std.testing.expect(try history.undo(&session));
    const undo = try session.save();
    defer a.free(undo);
    try std.testing.expectEqualSlices(u8, input, undo);
    try std.testing.expect(try history.redo(&session));
    const redo = try session.save();
    defer a.free(redo);
    try std.testing.expectEqualSlices(u8, saved, redo);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const read = try own.observe(a, &reopened);
    defer a.free(read);
    try std.testing.expect(t.equals(read[0].target.?.expected, changed));
    try std.testing.expectError(error.StalePageSettingsSnapshot, history.apply(&session, command(&r)));
}
fn attempt(input: []const u8, offset: ?usize) !usize {
    var failing = std.testing.FailingAllocator.init(a, .{});
    const allocator = failing.allocator();
    var session = try editor.open(allocator, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try histories.History.initV2(&session, .{});
    defer history.deinit();
    const text: histories.Command = .{ .kind = .plain, .section = 0, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "redo" };
    try std.testing.expect(try history.apply(&session, text));
    try std.testing.expect(try history.undo(&session));
    const before = try session.save();
    defer allocator.free(before);
    const revision = history.revision();
    const owners = try own.observe(allocator, &session);
    defer allocator.free(owners);
    const targets = [_]t.Target{owners[0].target.?};
    const r = request(&targets);
    const first = failing.alloc_index;
    if (offset) |i| failing.fail_index = first + i;
    const result = history.apply(&session, command(&r));
    const count = failing.alloc_index - first;
    failing.fail_index = std.math.maxInt(usize);
    if (offset != null) {
        try std.testing.expectError(error.OutOfMemory, result);
        const actual = try session.save();
        defer allocator.free(actual);
        try std.testing.expectEqualSlices(u8, before, actual);
        try std.testing.expectEqual(revision, history.revision());
        try std.testing.expectEqual(@as(usize, 1), history.stats().redoCount);
        try std.testing.expect(!history.stats().poisoned);
        try std.testing.expect(try history.redo(&session));
    } else try std.testing.expect(try result);
    return count;
}
test "page settings writer every prepare commit allocation failure preserves source revision and redo" {
    const input = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(input);
    const count = try attempt(input, null);
    for (0..count) |i| _ = try attempt(input, i);
    std.debug.print("{d} page-settings allocation rollback points\n", .{count});
}
test "page settings writer invalid values and forged expected owner reject atomically" {
    const input = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(input);
    var s = try editor.open(a, input, .{});
    defer s.deinit();
    const owners = try own.observe(a, &s);
    defer a.free(owners);
    var targets = [_]t.Target{owners[0].target.?};
    var r = request(&targets);
    targets[0].owner_node += 1;
    try std.testing.expectError(error.StalePageSettingsSnapshot, own.validateTargets(a, &s, r));
    targets[0] = owners[0].target.?;
    r.values.width = 0;
    try std.testing.expectError(error.InvalidPageSettingsGeometry, own.validateTargets(a, &s, r));
    const out = try s.save();
    defer a.free(out);
    try std.testing.expectEqualSlices(u8, input, out);
}

test "page settings writer invalidates known line caches and rejects unknown cache payload" {
    const good = "<p:linesegarray><p:lineseg textpos='0' vertpos='0' vertsize='1200' textheight='1000' baseline='800' spacing='200' horzpos='0' horzsize='48000' flags='0'/></p:linesegarray>";
    const source = pre ++ page ++ post;
    const cached = try std.mem.replaceOwned(u8, a, source, "</p:p>", "</p:p>");
    defer a.free(cached);
    const input = try std.mem.replaceOwned(u8, a, cached, "</p:run>", "</p:run>" ++ good);
    defer a.free(input);
    const out = try @import("page_settings_layout_cache.zig").remove(a, input, 0, 0, 100000);
    defer a.free(out);
    try std.testing.expectEqualSlices(u8, source, out);
    for ([_][]const u8{ "<p:linesegarray x:opaque='keep'/>", "<p:linesegarray><x:opaque/></p:linesegarray>", "<p:linesegarray><p:lineseg x:opaque='keep'/></p:linesegarray>" }) |unknown| {
        const tail = try std.fmt.allocPrint(a, "</p:run>{s}", .{unknown});
        defer a.free(tail);
        const extended_source = try std.mem.replaceOwned(u8, a, source, "</p:run>", tail);
        defer a.free(extended_source);
        try std.testing.expectError(error.UnsupportedPageLayoutCache, @import("page_settings_layout_cache.zig").remove(a, extended_source, 0, 0, 100000));
    }
}
