//! Prepared source-only tests. Native execution requires a separate frozen grant.
const std = @import("std");
const a = std.testing.allocator;
const editor = @import("editor_session.zig");
const t = @import("../model/object_outer_margins.zig");
const owners = @import("object_outer_margins.zig");
const writer = @import("object_outer_margins_write.zig");
const History = @import("editor_history.zig").History;
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:rect textWrap='TOP_AND_BOTTOM' textFlow='BOTH_SIDES'>";
const position = "<p:pos treatAsChar='0' flowWithText='0' allowOverlap='1' vertAlign='TOP'/>";
const margin = "<p:outMargin left='1' right='2' top='3' bottom='4'/>";
const text = "<p:drawText editable='0'><p:subList><p:p><p:run><p:t>own text</p:t></p:run></p:p></p:subList></p:drawText>";
const suffix = "</p:rect></p:run></p:p></s:sec>";
const before_margins: t.Margins = .{ .left = 1, .right = 2, .top = 3, .bottom = 4 };
const after_margins: t.Margins = .{ .left = 1, .right = 2, .top = 720, .bottom = 1440 };
fn rawTree(allocator: std.mem.Allocator, raw: []const u8) !@import("section_tree.zig").Tree {
    return @import("section_tree.zig").parse(allocator, raw, 0, 0, .{});
}
fn writeCase(allocator: std.mem.Allocator) !void {
    var tree = try rawTree(allocator, prefix ++ position ++ margin ++ text ++ suffix);
    defer tree.deinit(allocator);
    try std.testing.expectEqualDeep(before_margins, try owners.readExisting(allocator, &tree, 3));
    const output = try writer.writeTree(allocator, &tree, 3, before_margins, after_margins, 10000);
    defer allocator.free(output);
    try std.testing.expectEqualStrings(prefix ++ position ++ "<p:outMargin left='1' right='2' top='720' bottom='1440'/>" ++ text ++ suffix, output);
}
test "HWPX TOP margins direct writer preserves every other source byte and NoResize cleanup" {
    try writeCase(a);
    try @import("../testing/allocation_failures.zig").check(writeCase, .{});
}
test "HWPX TOP margins direct writer refuses either horizontal axis and stale expected margins" {
    var tree = try rawTree(a, prefix ++ position ++ margin ++ text ++ suffix);
    defer tree.deinit(a);
    var after = after_margins;
    after.left += 1;
    try std.testing.expectError(error.UnsupportedObjectOuterMargins, writer.writeTree(a, &tree, 3, before_margins, after, 10000));
    after = after_margins;
    after.right += 1;
    try std.testing.expectError(error.UnsupportedObjectOuterMargins, writer.writeTree(a, &tree, 3, before_margins, after, 10000));
    try std.testing.expectError(error.StaleObjectOuterMargins, writer.writeTree(a, &tree, 3, after_margins, after_margins, 10000));
}
test "HWPX TOP margins caption mixed content and nonqualified position remain refused" {
    inline for (.{ prefix ++ position ++ margin ++ text ++ "<p:caption/>" ++ suffix, prefix ++ position ++ margin ++ "<p:drawText><p:subList><p:p><p:run><p:pic/></p:run></p:p></p:subList></p:drawText>" ++ suffix, prefix ++ "<p:pos treatAsChar='0' flowWithText='1' allowOverlap='1' vertAlign='TOP'/>" ++ margin ++ text ++ suffix }) |raw| {
        var tree = try rawTree(a, raw);
        defer tree.deinit(a);
        try std.testing.expectError(error.UnsupportedObjectOuterMargins, owners.readExisting(a, &tree, 3));
    }
}
fn node(s: *const editor.Session) !u32 {
    var selected: ?u32 = null;
    for (s.sections[0].tree.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "rect")) {
        if (selected != null) return error.AmbiguousTestTextbox;
        selected = @intCast(index);
    };
    return selected orelse error.MissingTestTextbox;
}
fn observe(allocator: std.mem.Allocator, s: *const editor.Session, revision: u32) !t.Observation {
    const serial = try std.fmt.allocPrint(allocator, "{d}", .{s.mutation_serial});
    defer allocator.free(serial);
    return owners.observe(allocator, s, .{ .kind = .drawing, .section = 0, .node = try node(s) }, revision, .{ .session = "owned-top-margin-test", .serial = serial });
}
fn request(value: t.Observation, after: t.Margins) t.Request {
    return .{ .geometry = .{ .selector = value.geometry.selector, .owner = value.geometry.owner, .expected = value.geometry.frame, .historyRevision = value.geometry.historyRevision, .binding = value.geometry.binding, .patch = .{} }, .expectedMargins = value.margins, .margins = after };
}
fn apply(h: *History, s: *editor.Session, r: *const t.Request) !bool {
    return h.apply(s, .{ .kind = .object_outer_margins, .object_outer_margins = r, .section = r.geometry.selector.section, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "" });
}
fn topInput(allocator: std.mem.Allocator) ![]u8 {
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "tests/fixtures/hwpx/textbox-body-flow-approved.hwpx", allocator, .limited(8_000_000));
    defer allocator.free(bytes);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &digest, .{});
    var expected: [32]u8 = undefined;
    _ = try std.fmt.hexToBytes(&expected, "b98fa95d5aa0dd6ef114040e753f3d223787bea1839840124e2114e870d0bcd3");
    try std.testing.expectEqualSlices(u8, &expected, &digest);
    var s = try editor.open(allocator, bytes, .{});
    defer s.deinit();
    const serial = try std.fmt.allocPrint(allocator, "{d}", .{s.mutation_serial});
    defer allocator.free(serial);
    var flow = try @import("object_body_flow.zig").observe(allocator, &s, .{ .kind = .drawing, .section = 0, .node = try node(&s) }, 0, .{ .session = "owned-top-fixture", .serial = serial });
    defer flow.deinit(allocator);
    const r: @import("../model/object_body_flow.zig").Request = .{ .geometry = .{ .selector = flow.geometry.selector, .owner = flow.geometry.owner, .expected = flow.geometry.frame, .historyRevision = 0, .binding = flow.geometry.binding, .patch = .{} }, .expectedFlow = flow.flow, .flow = .{ .textWrap = .TOP_AND_BOTTOM, .textFlow = .BOTH_SIDES } };
    var candidate = (try @import("object_body_flow_write.zig").prepare(allocator, bytes, r, .{})) orelse return error.ExpectedTopFixture;
    defer candidate.deinit();
    return candidate.save();
}
const changed: t.Margins = .{ .left = 0, .right = 0, .top = 720, .bottom = 1440 };
test "HWPX TOP margins one history undo redo save fresh reopen preserve frame and clear known line caches" {
    const bytes = try topInput(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    var before = try observe(a, &s, 0);
    defer before.deinit(a);
    try std.testing.expect(before.verticalOnly);
    const prior = try s.save();
    defer a.free(prior);
    const r = request(before, changed);
    try std.testing.expect(try apply(&h, &s, &r));
    try std.testing.expectEqual(@as(u32, 1), h.revision());
    var after = try observe(a, &s, h.revision());
    defer after.deinit(a);
    try std.testing.expectEqualDeep(before.geometry.frame, after.geometry.frame);
    try std.testing.expectEqualDeep(changed, after.margins);
    for (s.sections[0].tree.elements) |element| try std.testing.expect(!element.is(@import("document_xml.zig").paragraph_uri, "linesegarray"));
    const saved = try s.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    var fresh = try observe(a, &reopened, 0);
    defer fresh.deinit(a);
    try std.testing.expectEqualDeep(changed, fresh.margins);
    try std.testing.expect(fresh.verticalOnly);
    try std.testing.expect(try h.undo(&s));
    const undone = try s.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, prior, undone);
    try std.testing.expect(try h.redo(&s));
    const redone = try s.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}
test "HWPX TOP margins no-op preserves prior redo and stale owner binding never commits" {
    const bytes = try topInput(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    var before = try observe(a, &s, 0);
    defer before.deinit(a);
    const r = request(before, changed);
    try std.testing.expect(try apply(&h, &s, &r));
    try std.testing.expect(try h.undo(&s));
    try std.testing.expectError(error.StaleObjectGeometryBinding, apply(&h, &s, &r));
    var current = try observe(a, &s, h.revision());
    defer current.deinit(a);
    const same = request(current, current.margins);
    try std.testing.expect(!try apply(&h, &s, &same));
    try std.testing.expectEqual(@as(usize, 1), h.stats().redoCount);
    try std.testing.expect(try h.redo(&s));
}
test "HWPX TOP margins horizontal edits wrong source expected values and frame never commit" {
    const bytes = try topInput(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    var before = try observe(a, &s, 0);
    defer before.deinit(a);
    var r = request(before, changed);
    r.margins.left = 1;
    try std.testing.expectError(error.UnsupportedObjectOuterMargins, apply(&h, &s, &r));
    r = request(before, changed);
    r.geometry.owner.sourceSha256[0] ^= 1;
    try std.testing.expectError(error.StaleObjectGeometryOwner, apply(&h, &s, &r));
    r = request(before, changed);
    r.expectedMargins.top = 1;
    try std.testing.expectError(error.StaleObjectOuterMargins, apply(&h, &s, &r));
    r = request(before, changed);
    r.geometry.expected.width += 1;
    try std.testing.expectError(error.StaleObjectGeometryOwner, apply(&h, &s, &r));
    try std.testing.expectEqual(@as(u32, 0), h.revision());
}
fn prepareCase(allocator: std.mem.Allocator, bytes: []const u8, r: t.Request) !void {
    var candidate = (try writer.prepare(allocator, bytes, r, .{})) orelse return error.ExpectedMarginCandidate;
    defer candidate.deinit();
    try std.testing.expectEqualDeep(changed, try owners.readExisting(allocator, &candidate.sections[0].tree, try node(&candidate)));
}
test "HWPX TOP margins complete candidate NoResize failure cleanup preserves original" {
    const bytes = try topInput(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    var before = try observe(a, &s, 0);
    defer before.deinit(a);
    const r = request(before, changed);
    try prepareCase(a, bytes, r);
    try @import("../testing/allocation_failures.zig").check(prepareCase, .{ bytes, r });
    try std.testing.expectEqualSlices(u8, bytes, s.source);
}

test "HWPX TOP margins known line cache removed and unknown cache is never erased" {
    const cached_text = "<p:drawText><p:subList><p:p><p:run><p:t>own text</p:t></p:run><p:linesegarray><p:lineseg textpos='0' vertpos='0' vertsize='10' textheight='10' baseline='8' spacing='0' horzpos='0' horzsize='100' flags='0'/></p:linesegarray></p:p></p:subList></p:drawText>";
    var tree = try rawTree(a, prefix ++ position ++ margin ++ cached_text ++ suffix);
    defer tree.deinit(a);
    const output = try writer.writeTree(a, &tree, 3, before_margins, after_margins, 10000);
    defer a.free(output);
    const cleared = try @import("page_settings_layout_cache.zig").remove(a, output, 0, 0, 10000);
    defer a.free(cleared);
    var parsed = try rawTree(a, cleared);
    defer parsed.deinit(a);
    try std.testing.expectEqualDeep(after_margins, try owners.readExisting(a, &parsed, 3));
    for (parsed.elements) |element| try std.testing.expect(!element.is(@import("document_xml.zig").paragraph_uri, "linesegarray"));
    const unknown = prefix ++ position ++ margin ++ text ++ "</p:rect></p:run><p:linesegarray unknown='1'/></p:p></s:sec>";
    try std.testing.expectError(error.UnsupportedPageLayoutCache, @import("page_settings_layout_cache.zig").remove(a, unknown, 0, 0, 10000));
}
test "HWPX TOP margins changed wrap invalidates old ticket and FRONT remains unavailable" {
    const bytes = try topInput(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    var before = try observe(a, &s, 0);
    defer before.deinit(a);
    const r = request(before, changed);
    var flow = try @import("object_body_flow.zig").observe(a, &s, before.geometry.selector, 0, before.geometry.binding);
    defer flow.deinit(a);
    const change: @import("../model/object_body_flow.zig").Request = .{ .geometry = r.geometry, .expectedFlow = flow.flow, .flow = .{ .textWrap = .IN_FRONT_OF_TEXT, .textFlow = flow.flow.textFlow } };
    try std.testing.expect(try h.apply(&s, .{ .kind = .object_body_flow, .object_body_flow = &change, .section = 0, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "" }));
    try std.testing.expectError(error.StaleObjectGeometryBinding, apply(&h, &s, &r));
    try std.testing.expectError(error.UnsupportedObjectOuterMargins, observe(a, &s, h.revision()));
}

test "HWPX TOP margins verified read preserves legacy Square API and exact axis policy" {
    const square_prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:rect textWrap='SQUARE' textFlow='BOTH_SIDES'>";
    var square_tree = try rawTree(a, square_prefix ++ position ++ margin ++ text ++ suffix);
    defer square_tree.deinit(a);
    const square = try owners.readVerified(a, &square_tree, 3);
    try std.testing.expect(!square.verticalOnly);
    try std.testing.expectEqualDeep(try owners.readExisting(a, &square_tree, 3), square.margins);
    try owners.validateChange(square.verticalOnly, square.margins, .{ .left = 7, .right = 8, .top = 9, .bottom = 10 });
    var top_tree = try rawTree(a, prefix ++ position ++ margin ++ text ++ suffix);
    defer top_tree.deinit(a);
    const top = try owners.readVerified(a, &top_tree, 3);
    try std.testing.expect(top.verticalOnly);
    try std.testing.expectEqualDeep(try owners.readExisting(a, &top_tree, 3), top.margins);
    try owners.validateChange(top.verticalOnly, top.margins, after_margins);
    try std.testing.expectError(error.UnsupportedObjectOuterMargins, owners.validateChange(top.verticalOnly, top.margins, .{ .left = 7, .right = 8, .top = 9, .bottom = 10 }));
}
