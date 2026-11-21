//! Prepared focused roster. Source-only: Native execution is separately granted.
const std = @import("std");
const editor = @import("editor_session.zig");
const t = @import("../model/object_body_flow.zig");
const owners = @import("object_body_flow.zig");
const writer = @import("object_body_flow_write.zig");
const History = @import("editor_history.zig").History;
const a = std.testing.allocator;
const square: t.Flow = .{ .textWrap = .SQUARE, .textFlow = .BOTH_SIDES };
fn input(allocator: std.mem.Allocator) ![]u8 {
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "apps/docs/docs/public/editor/fixtures/textbox-body-flow-approved.hwpx", allocator, .limited(8_000_000));
    errdefer allocator.free(bytes);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &digest, .{});
    var expected: [32]u8 = undefined;
    _ = try std.fmt.hexToBytes(&expected, "b98fa95d5aa0dd6ef114040e753f3d223787bea1839840124e2114e870d0bcd3");
    try std.testing.expectEqualSlices(u8, &expected, &digest);
    return bytes;
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
    return owners.observe(allocator, s, .{ .kind = .drawing, .section = 0, .node = try node(s) }, revision, .{ .session = "owned-flow-test", .serial = serial });
}
fn request(value: t.Observation, after: t.Flow) t.Request {
    return .{ .geometry = .{ .selector = value.geometry.selector, .owner = value.geometry.owner, .expected = value.geometry.frame, .historyRevision = value.geometry.historyRevision, .binding = value.geometry.binding, .patch = .{} }, .expectedFlow = value.flow, .flow = after };
}
fn apply(h: *History, s: *editor.Session, r: *const t.Request) !bool {
    return h.apply(s, .{ .kind = .object_body_flow, .object_body_flow = r, .section = r.geometry.selector.section, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "" });
}
test "HWPX textbox body flow approved direct owner read preserves source and margins" {
    const bytes = try input(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    var current = try observe(a, &s, 0);
    defer current.deinit(a);
    try std.testing.expectEqualDeep(square, current.flow);
    try std.testing.expectEqual(@as(?bool, false), (try @import("drawing_text_values.zig").read(a, &s.sections[0].tree, try node(&s))).?.editable);
    try std.testing.expectEqualSlices(u8, bytes, s.source);
    try std.testing.expectEqualDeep([4]?i64{ 0, 0, 0, 0 }, (try @import("picture_flow_values.zig").readRectangle(a, &s.sections[0].tree, try node(&s))).outside_margins);
}
test "HWPX textbox body flow four wraps single history undo redo save fresh reopen" {
    const bytes = try input(a);
    defer a.free(bytes);
    inline for (.{ t.Wrap.SQUARE, .TOP_AND_BOTTOM, .BEHIND_TEXT, .IN_FRONT_OF_TEXT }) |wrap| {
        var s = try editor.open(a, bytes, .{});
        defer s.deinit();
        s.history_delta_managed = true;
        var h = try History.initV2(&s, .{});
        defer h.deinit();
        var before = try observe(a, &s, 0);
        defer before.deinit(a);
        const prior = try s.save();
        defer a.free(prior);
        const target: t.Flow = .{ .textWrap = wrap, .textFlow = .BOTH_SIDES };
        const r = request(before, target);
        const changed = try apply(&h, &s, &r);
        try std.testing.expectEqual(wrap != .SQUARE, changed);
        if (comptime wrap == .SQUARE) continue;
        try std.testing.expectEqual(@as(u32, 1), h.revision());
        const saved = try s.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        var final = try observe(a, &reopened, 0);
        defer final.deinit(a);
        try std.testing.expectEqualDeep(target, final.flow);
        try std.testing.expectEqualDeep(before.geometry.frame, final.geometry.frame);
        try std.testing.expectEqualDeep([4]?i64{ 0, 0, 0, 0 }, (try @import("picture_flow_values.zig").readRectangle(a, &reopened.sections[0].tree, try node(&reopened))).outside_margins);
        try std.testing.expect(try h.undo(&s));
        const undone = try s.save();
        defer a.free(undone);
        try std.testing.expectEqualSlices(u8, prior, undone);
        try std.testing.expect(try h.redo(&s));
        const redone = try s.save();
        defer a.free(redone);
        try std.testing.expectEqualSlices(u8, saved, redone);
    }
}
test "HWPX textbox body flow SQUARE accepts all four sides" {
    const bytes = try input(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    const tree = &s.sections[0].tree;
    inline for (.{ t.Side.BOTH_SIDES, .LEFT_ONLY, .RIGHT_ONLY, .LARGEST_ONLY }) |side| {
        const xml = try writer.writeTree(a, tree, try node(&s), square, .{ .textWrap = .SQUARE, .textFlow = side }, s.options.max_xml_bytes);
        defer a.free(xml);
        var after = try @import("section_tree.zig").parse(a, xml, 0, 0, .{});
        defer after.deinit(a);
        try std.testing.expectEqual(side, (try owners.readExisting(a, &after, try node(&s))).textFlow);
    }
}
test "HWPX textbox body flow no-op preserves prior redo and stale serial is rejected" {
    const bytes = try input(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    var before = try observe(a, &s, 0);
    defer before.deinit(a);
    const first = request(before, .{ .textWrap = .BEHIND_TEXT, .textFlow = .BOTH_SIDES });
    try std.testing.expect(try apply(&h, &s, &first));
    try std.testing.expect(try h.undo(&s));
    try std.testing.expectError(error.StaleObjectGeometryBinding, apply(&h, &s, &first));
    var current = try observe(a, &s, h.revision());
    defer current.deinit(a);
    const same = request(current, square);
    try std.testing.expect(!try apply(&h, &s, &same));
    try std.testing.expectEqual(@as(usize, 1), h.stats().redoCount);
    try std.testing.expect(try h.redo(&s));
}
test "HWPX textbox body flow wrong owner and expected flow never commit" {
    const bytes = try input(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    var before = try observe(a, &s, 0);
    defer before.deinit(a);
    var r = request(before, .{ .textWrap = .BEHIND_TEXT, .textFlow = .BOTH_SIDES });
    r.geometry.owner.sourceSha256[0] ^= 1;
    try std.testing.expectError(error.StaleObjectGeometryOwner, apply(&h, &s, &r));
    r = request(before, .{ .textWrap = .BEHIND_TEXT, .textFlow = .BOTH_SIDES });
    r.expectedFlow.textWrap = .TOP_AND_BOTTOM;
    try std.testing.expectError(error.StaleObjectBodyFlow, apply(&h, &s, &r));
    try std.testing.expectEqual(@as(u32, 0), h.revision());
}
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:rect id='own' textWrap='SQUARE' textFlow='BOTH_SIDES'>";
const properties = "<p:pos treatAsChar='0' flowWithText='0' allowOverlap='1' vertAlign='TOP'/><p:outMargin left='1' right='2' top='3' bottom='4'/>";
const text = "<p:drawText editable='1'><p:subList><p:p><p:run><p:t>own text</p:t></p:run></p:p></p:subList></p:drawText>";
const suffix = "</p:rect></p:run></p:p></s:sec>";
fn rawTree(allocator: std.mem.Allocator, raw: []const u8) !@import("section_tree.zig").Tree {
    return @import("section_tree.zig").parse(allocator, raw, 0, 0, .{});
}
fn writerCase(allocator: std.mem.Allocator) !void {
    var tree = try rawTree(allocator, prefix ++ properties ++ text ++ suffix);
    defer tree.deinit(allocator);
    const result = try writer.writeTree(allocator, &tree, 3, square, .{ .textWrap = .BEHIND_TEXT, .textFlow = .BOTH_SIDES }, 10000);
    defer allocator.free(result);
    try std.testing.expectEqualStrings("<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:rect id='own' textWrap='BEHIND_TEXT' textFlow='BOTH_SIDES'>" ++ properties ++ text ++ suffix, result);
}
test "HWPX textbox body flow writer preserves every other byte and NoResize failures" {
    try writerCase(a);
    try @import("../testing/allocation_failures.zig").check(writerCase, .{});
}
test "HWPX textbox body flow missing margins and inline owners are refused" {
    var missing = try rawTree(a, prefix ++ "<p:pos treatAsChar='0'/>" ++ text ++ suffix);
    defer missing.deinit(a);
    try std.testing.expectError(error.MissingObjectOuterMargins, owners.readExisting(a, &missing, 3));
    var inline_owner = try rawTree(a, prefix ++ "<p:pos treatAsChar='1'/><p:outMargin left='0' right='0' top='0' bottom='0'/>" ++ text ++ suffix);
    defer inline_owner.deinit(a);
    try std.testing.expectError(error.UnsupportedObjectOuterMargins, owners.readExisting(a, &inline_owner, 3));
}
test "HWPX textbox body flow unknown extended wrap and mixed nested controls are refused" {
    var mixed = try rawTree(a, prefix ++ properties ++ "<p:drawText><p:subList><p:p><p:run><p:pic/></p:run></p:p></p:subList></p:drawText>" ++ suffix);
    defer mixed.deinit(a);
    try std.testing.expectError(error.UnsupportedObjectBodyFlowContent, owners.readExisting(a, &mixed, 3));
    var extended = try rawTree(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:rect textWrap='TIGHT' textFlow='BOTH_SIDES'>" ++ properties ++ text ++ suffix);
    defer extended.deinit(a);
    try std.testing.expectError(error.UnsupportedObjectBodyFlow, owners.readExisting(a, &extended, 3));
}
test "HWPX textbox body flow non-square side edits are refused without rewriting" {
    var tree = try rawTree(a, prefix ++ properties ++ text ++ suffix);
    defer tree.deinit(a);
    try std.testing.expectError(error.UnsupportedObjectBodyFlowSide, writer.writeTree(a, &tree, 3, square, .{ .textWrap = .BEHIND_TEXT, .textFlow = .LEFT_ONLY }, 10000));
}
test "HWPX textbox body flow original approved caption remains preserved and refused" {
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "apps/docs/docs/public/editor/fixtures/textbox.hwpx", a, .limited(8_000_000));
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    try std.testing.expectError(error.UnsupportedObjectBodyFlowCaption, owners.readExisting(a, &s.sections[0].tree, try node(&s)));
    const saved = try s.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}
fn prepareCase(allocator: std.mem.Allocator, bytes: []const u8) !void {
    var s = try editor.open(allocator, bytes, .{});
    defer s.deinit();
    var before = try observe(allocator, &s, 0);
    defer before.deinit(allocator);
    var candidate = (try writer.prepare(allocator, bytes, request(before, .{ .textWrap = .BEHIND_TEXT, .textFlow = .BOTH_SIDES }), .{})).?;
    defer candidate.deinit();
    try std.testing.expectEqual(t.Wrap.BEHIND_TEXT, (try owners.readExisting(allocator, &candidate.sections[0].tree, try node(&candidate))).textWrap);
    try std.testing.expectEqualSlices(u8, bytes, s.source);
}
test "HWPX textbox body flow complete candidate NoResize failures keep original unchanged" {
    const bytes = try input(a);
    defer a.free(bytes);
    try prepareCase(a, bytes);
    try @import("../testing/allocation_failures.zig").check(prepareCase, .{bytes});
}
test "HWPX textbox body flow strict portable wire rejects numeric enums null and extra fields" {
    try std.testing.expectError(error.InvalidObjectBodyFlow, t.parse(a, "{\"geometry\":{},\"expectedFlow\":{\"textWrap\":0,\"textFlow\":\"BOTH_SIDES\"},\"flow\":{\"textWrap\":\"SQUARE\",\"textFlow\":\"BOTH_SIDES\"}}"));
    try std.testing.expectError(error.InvalidObjectBodyFlow, t.parse(a, "{\"geometry\":{},\"expectedFlow\":null,\"flow\":null}"));
    try std.testing.expectError(error.InvalidObjectBodyFlow, t.parse(a, "{\"geometry\":{},\"expectedFlow\":null,\"flow\":null,\"extra\":true}"));
    const bytes = try input(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    var before = try observe(a, &s, 0);
    defer before.deinit(a);
    var r = request(before, .{ .textWrap = .BEHIND_TEXT, .textFlow = .BOTH_SIDES });
    // Ordinary Request serialization is not the portable geometry wire:
    // byte arrays become strings and optional patch fields become explicit nulls.
    const invalid_wire = try std.json.Stringify.valueAlloc(a, r, .{});
    defer a.free(invalid_wire);
    try std.testing.expectError(error.InvalidObjectGeometryRequest, t.parse(a, invalid_wire));
    var digest: [32]u32 = undefined;
    for (r.geometry.owner.sourceSha256, &digest) |byte, *item| item.* = byte;
    const g = r.geometry;
    const wire = try std.json.Stringify.valueAlloc(a, .{
        .geometry = .{
            .selector = g.selector,
            .owner = .{ .ownerNode = g.owner.ownerNode, .componentNode = g.owner.componentNode, .paragraph = g.owner.paragraph, .anchorUnit = g.owner.anchorUnit, .sourceSha256 = digest, .link = g.owner.link },
            .expected = g.expected,
            .historyRevision = g.historyRevision,
            .binding = g.binding,
            .patch = struct {}{},
        },
        .expectedFlow = r.expectedFlow,
        .flow = r.flow,
    }, .{});
    defer a.free(wire);
    const raw = try std.json.parseFromSlice(std.json.Value, a, wire, .{});
    defer raw.deinit();
    const raw_geometry = raw.value.object.get("geometry").?;
    const raw_digest = raw_geometry.object.get("owner").?.object.get("sourceSha256").?;
    try std.testing.expect(raw_digest == .array);
    try std.testing.expectEqual(@as(usize, 32), raw_digest.array.items.len);
    try std.testing.expectEqual(@as(usize, 0), raw_geometry.object.get("patch").?.object.count());
    var parsed = try t.parse(a, wire);
    defer parsed.deinit();
    try std.testing.expectEqualDeep(r.flow, parsed.json.value.flow);
    try std.testing.expectEqualSlices(u8, &r.geometry.owner.sourceSha256, &parsed.json.value.geometry.owner.sourceSha256);
    r.geometry.patch.width = 1;
    try std.testing.expectError(error.InvalidObjectBodyFlow, t.validateRequest(r));
}

test "HWPX textbox body flow locked rectangle remains refused with text metadata unchanged" {
    const bytes = try input(a);
    defer a.free(bytes);
    var original = try editor.open(a, bytes, .{});
    defer original.deinit();
    const tree = &original.sections[0].tree;
    const selected = try node(&original);
    const tag = try @import("xml_scalar_attributes_upsert.zig").write(a, tree, selected, &.{"lock"}, .{"1"}, original.options.max_xml_bytes);
    defer a.free(tag);
    const span = tree.elements[selected].start_tag;
    const xml = try @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = span.start, .end = span.end, .text = "", .serialized_xml = tag }}, original.options.max_xml_bytes);
    defer a.free(xml);
    const package = try @import("../zip/replace_writer.zig").write(a, bytes, &.{.{ .entry_index = original.sections[0].entry_index, .bytes = xml }}, .{ .max_output_bytes = original.options.max_output_bytes });
    defer a.free(package);
    var locked = try editor.open(a, package, .{});
    defer locked.deinit();
    try std.testing.expectEqual(@as(?bool, false), (try @import("drawing_text_values.zig").read(a, &locked.sections[0].tree, try node(&locked))).?.editable);
    try std.testing.expectError(error.ObjectGeometryReadOnly, observe(a, &locked, 0));
    const saved = try locked.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, package, saved);
}

test "HWPX textbox body flow contiguous span excludes unrelated deep subtree" {
    var source: std.ArrayList(u8) = .empty;
    defer source.deinit(a);
    try source.appendSlice(a, prefix ++ properties ++ text ++ "</p:rect></p:run></p:p><p:p><p:run>");
    for (0..128) |_| try source.appendSlice(a, "<p:container>");
    try source.appendSlice(a, "<p:pic/>");
    for (0..128) |_| try source.appendSlice(a, "</p:container>");
    try source.appendSlice(a, "</p:run></p:p></s:sec>");
    var tree = try rawTree(a, source.items);
    defer tree.deinit(a);
    try std.testing.expectEqualDeep(square, try owners.readExisting(a, &tree, 3));
    try std.testing.expectEqualSlices(u8, source.items, tree.source);
}
test "HWPX textbox body flow contiguous span rejects deeply nested control inside list" {
    var source: std.ArrayList(u8) = .empty;
    defer source.deinit(a);
    try source.appendSlice(a, prefix ++ properties ++ "<p:drawText><p:subList>");
    for (0..64) |_| try source.appendSlice(a, "<p:p><p:run>");
    try source.appendSlice(a, "<p:pic/>");
    for (0..64) |_| try source.appendSlice(a, "</p:run></p:p>");
    try source.appendSlice(a, "</p:subList></p:drawText>" ++ suffix);
    var tree = try rawTree(a, source.items);
    defer tree.deinit(a);
    try std.testing.expectError(error.UnsupportedObjectBodyFlowContent, owners.readExisting(a, &tree, 3));
    try std.testing.expectEqualSlices(u8, source.items, tree.source);
}
