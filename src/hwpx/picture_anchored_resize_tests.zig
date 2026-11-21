//! Own synthetic source only. These Native tests require an explicitly assigned run.
const std = @import("std");
const editor = @import("editor_session.zig");
const History = @import("editor_history.zig").History;
const anchored = @import("picture_anchored_resize.zig");
const a = std.testing.allocator;
const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:p id='0'><p:run charPrIDRef='0'><p:t>A</p:t><p:pic id='17' lock='0' reverse='0'><p:sz width='400' height='200' widthRelTo='ABSOLUTE' heightRelTo='ABSOLUTE' protect='0'/><p:orgSz width='400' height='200'/><p:curSz width='400' height='200'/><p:pos treatAsChar='0' affectLSpacing='0' flowWithText='0' allowOverlap='1' holdAnchorAndSO='0' vertRelTo='PAGE' horzRelTo='PAGE' vertAlign='TOP' horzAlign='LEFT' horzOffset='1000' vertOffset='2000'/><p:flip horizontal='0' vertical='0'/><p:rotationInfo angle='0' centerX='200' centerY='100'/><p:renderingInfo><c:transMatrix e1='1' e2='0' e3='0' e4='0' e5='1' e6='0'/><c:scaMatrix e1='1' e2='0' e3='0' e4='0' e5='1' e6='0'/><c:rotMatrix e1='1' e2='0' e3='0' e4='0' e5='1' e6='0'/></p:renderingInfo><p:imgRect><c:pt0 x='0' y='0'/><c:pt1 x='400' y='0'/><c:pt2 x='400' y='200'/><c:pt3 x='0' y='200'/></p:imgRect><p:imgClip left='0' right='4800' top='0' bottom='2400'/></p:pic><p:t>B</p:t></p:run></p:p></s:sec>";
fn picture(s: *const editor.Session) !usize {
    var result: ?usize = null;
    for (s.sections[0].tree.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "pic")) {
        if (result != null) return error.ExpectedOnePicture;
        result = index;
    };
    return result orelse error.ExpectedOnePicture;
}
fn command(node: usize, size: [2]u32, intent: anchored.Intent) @import("editor_history.zig").Command {
    return .{ .kind = .picture_resize, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .picture_node = node, .picture_size = size, .picture_resize_anchor = intent };
}
test "anchored picture HX eight fixed points use exact integer offsets" {
    const offsets = [_][2]i32{ .{ 1000, 2000 }, .{ 900, 2000 }, .{ 800, 2000 }, .{ 1000, 1950 }, .{ 800, 1950 }, .{ 1000, 1900 }, .{ 900, 1900 }, .{ 800, 1900 } };
    for (std.enums.values(anchored.Anchor), offsets) |anchor, wanted| try std.testing.expectEqualDeep(wanted, try anchored.anchoredOffsets(.{ 1000, 2000 }, .{ 400, 200 }, .{ 600, 300 }, anchor));
}
test "anchored picture HX rejects half units zero sizes and offset overflow" {
    try std.testing.expectError(error.NonIntegralAnchoredPictureOffset, anchored.anchoredOffsets(.{ 0, 0 }, .{ 400, 200 }, .{ 401, 200 }, .top_center));
    try std.testing.expectError(error.NonIntegralAnchoredPictureOffset, anchored.anchoredOffsets(.{ 0, 0 }, .{ 400, 200 }, .{ 400, 201 }, .center_left));
    try std.testing.expectError(error.InvalidResizeAxisSize, anchored.anchoredOffsets(.{ 0, 0 }, .{ 400, 200 }, .{ 0, 200 }, .top_left));
    try std.testing.expectError(error.InvalidPictureOffset, anchored.anchoredOffsets(.{ std.math.maxInt(i32), 0 }, .{ 400, 200 }, .{ 1, 200 }, .top_right));
}
test "anchored picture HX one history owns eight position size saves undo redo and fresh source" {
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(bytes);
    for (std.enums.values(anchored.Anchor)) |anchor| {
        var s = try editor.open(a, bytes, .{});
        defer s.deinit();
        s.history_delta_managed = true;
        var h = try History.initV2(&s, .{});
        defer h.deinit();
        const node = try picture(&s);
        const before = try anchored.observe(&s, 0, node);
        const target = [2]u32{ 600, 300 };
        const intent: anchored.Intent = .{ .anchor = anchor, .expected = before };
        try std.testing.expect(try h.apply(&s, command(node, target, intent)));
        try std.testing.expectEqual(@as(u32, 1), h.revision());
        const after = try anchored.observe(&s, 0, node);
        try std.testing.expectEqualDeep(target, after.size);
        try std.testing.expectEqualDeep(try anchored.anchoredOffsets(before.offsets, before.size, target, anchor), after.offsets);
        const saved = try s.save();
        defer a.free(saved);
        var fresh = try editor.open(a, saved, .{});
        defer fresh.deinit();
        const reopened = try anchored.observe(&fresh, 0, try picture(&fresh));
        try std.testing.expectEqualDeep(after.size, reopened.size);
        try std.testing.expectEqualDeep(after.offsets, reopened.offsets);
        const original = try @import("picture_dimension_values.zig").read(a, &fresh.sections[0].tree, try picture(&fresh));
        try std.testing.expectEqualDeep([2]?u32{ 400, 200 }, original.original);
        var transform = try @import("picture_transform_values.zig").read(a, &fresh.sections[0].tree, try picture(&fresh), 1024);
        defer transform.deinit(a);
        try std.testing.expectEqualDeep([2]?i64{ 200, 100 }, transform.center);
        const source = fresh.sections[0].tree.source;
        try std.testing.expect(std.mem.indexOf(u8, source, "right='4800'") != null);
        try std.testing.expect(std.mem.indexOf(u8, source, "bottom='2400'") != null);
        try std.testing.expect(try h.undo(&s));
        const undo = try s.save();
        defer a.free(undo);
        try std.testing.expectEqualSlices(u8, bytes, undo);
        try std.testing.expect(try h.redo(&s));
        const redo = try s.save();
        defer a.free(redo);
        try std.testing.expectEqualSlices(u8, saved, redo);
    }
}
test "anchored picture HX inline source is rejected without conversion history or bytes" {
    const inline_xml = try std.mem.replaceOwned(u8, a, xml, "treatAsChar='0'", "treatAsChar='1'");
    defer a.free(inline_xml);
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, inline_xml);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    try std.testing.expectError(error.UnsupportedAnchoredInlinePictureResize, anchored.observe(&s, 0, try picture(&s)));
    const saved = try s.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
    try std.testing.expectEqual(@as(u32, 0), h.revision());
}
test "anchored picture HX stale serial source owner frame and offset never publish" {
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    const node = try picture(&s);
    const expected = try anchored.observe(&s, 0, node);
    for (0..6) |index| {
        var wrong = expected;
        switch (index) {
            0 => wrong.serial += 1,
            1 => wrong.source_sha256[0] ^= 1,
            2 => wrong.picture_node += 1,
            3 => wrong.size[0] += 1,
            4 => wrong.offsets[0] += 1,
            else => wrong.section += 1,
        }
        try std.testing.expectError(error.StaleAnchoredPictureResize, h.apply(&s, command(node, .{ 600, 300 }, .{ .anchor = .bottom_right, .expected = wrong })));
        const saved = try s.save();
        defer a.free(saved);
        try std.testing.expectEqualSlices(u8, bytes, saved);
        try std.testing.expectEqual(@as(u32, 0), h.revision());
    }
}
test "anchored picture HX rejects unverified placement transform and protection" {
    const cases = [_][2][]const u8{ .{ "flowWithText='0'", "flowWithText='1'" }, .{ "vertAlign='TOP'", "vertAlign='CENTER'" }, .{ "lock='0'", "lock='1'" }, .{ "protect='0'", "protect='1'" }, .{ "angle='0'", "angle='30'" }, .{ "horizontal='0'", "horizontal='1'" }, .{ "widthRelTo='ABSOLUTE'", "widthRelTo='PAGE'" } };
    for (cases) |item| {
        const bad = try std.mem.replaceOwned(u8, a, xml, item[0], item[1]);
        defer a.free(bad);
        const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, bad);
        defer a.free(bytes);
        var s = try editor.open(a, bytes, .{});
        defer s.deinit();
        if (anchored.observe(&s, 0, try picture(&s))) |_| return error.AcceptedUnsupportedAnchoredPicture else |_| {}
        const saved = try s.save();
        defer a.free(saved);
        try std.testing.expectEqualSlices(u8, bytes, saved);
    }
}
test "anchored picture HX no op retains history and mixed batch is refused" {
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    const node = try picture(&s);
    const expected = try anchored.observe(&s, 0, node);
    const cmd = command(node, expected.size, .{ .anchor = .bottom_right, .expected = expected });
    try std.testing.expect(!try h.apply(&s, cmd));
    try std.testing.expectEqual(@as(u32, 0), h.revision());
    try std.testing.expectError(error.InvalidAnchoredPictureResizeCommand, h.applyBatch(&s, &.{ cmd, cmd }));
}
test "anchored picture HX preserves an existing pending text intent across its one undo" {
    const source = try std.mem.replaceOwned(u8, a, xml, "</s:sec>", "<p:p id='8'><p:run charPrIDRef='0'><p:t>KEEP</p:t></p:run></p:p></s:sec>");
    defer a.free(source);
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, source);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    const section = &s.sections[0];
    var text_paragraph: ?usize = null;
    var text_owner: ?usize = null;
    for (section.sites.items, section.locations) |site, location| if (std.mem.eql(u8, site.text, "KEEP")) {
        try std.testing.expect(text_paragraph == null);
        text_paragraph = location.paragraph_ordinal;
        text_owner = try @import("paragraph_site_owner.zig").resolve(&section.tree, &section.sites, section.locations, location.paragraph_ordinal);
    };
    const selected = text_paragraph orelse return error.MissingPendingTextFixtureOwner;
    const owner_node = text_owner orelse return error.MissingPendingTextFixtureOwner;
    const id = try section.tree.attributeValue(a, owner_node, "", "id") orelse return error.MissingPendingTextFixtureOwner;
    const id_text = try id.toUtf8(a, 100);
    defer a.free(id_text);
    try std.testing.expectEqualStrings("8", id_text);
    try std.testing.expectEqual(try std.math.add(usize, section.first_paragraph, 1), selected);
    try @import("plain_paragraph_policy.zig").validate(&section.tree, &section.sites, section.locations, selected);
    try std.testing.expect(try h.apply(&s, .{ .kind = .plain, .paragraph = selected, .start = 0, .deleted = 0, .inserted = "OWN" }));
    const text_before = try s.save();
    defer a.free(text_before);
    const node = try picture(&s);
    const expected = try anchored.observe(&s, 0, node);
    try std.testing.expect(try h.apply(&s, command(node, .{ 600, 300 }, .{ .anchor = .bottom_right, .expected = expected })));
    try std.testing.expectEqual(@as(u32, 2), h.revision());
    try std.testing.expect(try h.undo(&s));
    const restored = try s.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, text_before, restored);
}
fn allocationCase(allocator: std.mem.Allocator) !void {
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(allocator, xml);
    defer allocator.free(bytes);
    var s = try editor.open(allocator, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    const node = try picture(&s);
    const expected = try anchored.observe(&s, 0, node);
    const changed = h.apply(&s, command(node, .{ 600, 300 }, .{ .anchor = .bottom_right, .expected = expected })) catch |err| {
        try std.testing.expectEqual(@as(u32, 0), h.revision());
        try std.testing.expectEqual(@as(usize, 0), s.sections[0].picture_dimensions.items.len);
        try std.testing.expectEqual(@as(usize, 0), s.sections[0].picture_matrices.items.len);
        try std.testing.expectEqual(@as(usize, 0), s.sections[0].picture_frames.items.len);
        return err;
    };
    try std.testing.expect(changed);
    try std.testing.expectEqual(@as(u32, 1), h.revision());
}
test "managed picture anchoring HX allocation failures preserve all three owners" {
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}
