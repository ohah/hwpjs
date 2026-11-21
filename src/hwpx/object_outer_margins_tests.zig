//! Authored preparation only. No Native execution under the source-only grant.
const std = @import("std");
const editor = @import("editor_session.zig");
const t = @import("../model/object_outer_margins.zig");
const owners = @import("object_outer_margins.zig");
const write = @import("object_outer_margins_write.zig");
const History = @import("editor_history.zig").History;
const a = std.testing.allocator;
const zero: t.Margins = .{ .left = 0, .right = 0, .top = 0, .bottom = 0 };
const changed: t.Margins = .{ .left = 100, .right = 200, .top = 300, .bottom = 400 };
fn input(allocator: std.mem.Allocator) ![]u8 {
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "apps/docs/docs/public/editor/fixtures/textbox.hwpx", allocator, .limited(8_000_000));
    errdefer allocator.free(bytes);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &digest, .{});
    var expected: [32]u8 = undefined;
    _ = try std.fmt.hexToBytes(&expected, "4072a0356a79ebcbe98dcd9a50d984e3b6e59d64400d154fcf2fbc342b17f5a5");
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
/// A new authored SQUARE derivative, never a change to the approved public fixture.
fn squareInput(allocator: std.mem.Allocator) ![]u8 {
    const bytes = try input(allocator);
    defer allocator.free(bytes);
    var s = try editor.open(allocator, bytes, .{});
    defer s.deinit();
    const tree = &s.sections[0].tree;
    const target = try node(&s);
    const tag = try @import("xml_scalar_attributes_upsert.zig").write(allocator, tree, target, &.{"textWrap"}, .{"SQUARE"}, s.options.max_xml_bytes);
    defer allocator.free(tag);
    const span = tree.elements[target].start_tag;
    const xml = try @import("xml_source_writer.zig").write(allocator, tree.source, &.{.{ .start = span.start, .end = span.end, .text = "", .serialized_xml = tag }}, s.options.max_xml_bytes);
    defer allocator.free(xml);
    return @import("../zip/replace_writer.zig").write(allocator, bytes, &.{.{ .entry_index = s.sections[0].entry_index, .bytes = xml }}, .{ .max_output_bytes = s.options.max_output_bytes });
}
fn observe(s: *const editor.Session, revision: u32) !t.Observation {
    const serial = try std.fmt.allocPrint(a, "{d}", .{s.mutation_serial});
    defer a.free(serial);
    return owners.observe(a, s, .{ .kind = .drawing, .section = 0, .node = try node(s) }, revision, .{ .session = "owned-test-session", .serial = serial });
}
fn request(value: t.Observation, after: t.Margins) t.Request {
    return .{ .geometry = .{ .selector = value.geometry.selector, .owner = value.geometry.owner, .expected = value.geometry.frame, .historyRevision = value.geometry.historyRevision, .binding = value.geometry.binding, .patch = .{} }, .expectedMargins = value.margins, .margins = after };
}
fn apply(h: *History, s: *editor.Session, r: *const t.Request) !bool {
    return h.apply(s, .{ .kind = .object_outer_margins, .object_outer_margins = r, .section = r.geometry.selector.section, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "" });
}
test "object outer margins original public front-of-text input remains refused" {
    const bytes = try input(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    try std.testing.expectError(error.UnsupportedObjectOuterMargins, observe(&s, 0));
}
test "object outer margins SQUARE read observes existing four zeros without changing source" {
    const bytes = try squareInput(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    var before = try observe(&s, 0);
    defer before.deinit(a);
    try std.testing.expectEqualDeep(zero, before.margins);
    try std.testing.expectEqualSlices(u8, bytes, s.source);
}
test "object outer margins single history apply undo redo save and fresh reopen" {
    const bytes = try squareInput(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    var before = try observe(&s, h.revision());
    defer before.deinit(a);
    const saved_before = try s.save();
    defer a.free(saved_before);
    const r = request(before, changed);
    try std.testing.expect(try apply(&h, &s, &r));
    try std.testing.expectEqual(@as(u32, 1), h.revision());
    var after = try observe(&s, h.revision());
    defer after.deinit(a);
    try std.testing.expectEqualDeep(changed, after.margins);
    try std.testing.expectEqualDeep(before.geometry.frame, after.geometry.frame);
    const saved_after = try s.save();
    defer a.free(saved_after);
    var reopened = try editor.open(a, saved_after, .{});
    defer reopened.deinit();
    var restored = try observe(&reopened, 0);
    defer restored.deinit(a);
    try std.testing.expectEqualDeep(changed, restored.margins);
    try std.testing.expect(try h.undo(&s));
    const undone = try s.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, saved_before, undone);
    try std.testing.expect(try h.redo(&s));
    const redone = try s.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved_after, redone);
}
test "object outer margins equal values preserve redo and stale owners remain refused" {
    const bytes = try squareInput(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    var before = try observe(&s, h.revision());
    defer before.deinit(a);
    const first = request(before, changed);
    try std.testing.expect(try apply(&h, &s, &first));
    try std.testing.expect(try h.undo(&s));
    try std.testing.expectError(error.StaleObjectGeometryBinding, apply(&h, &s, &first));
    var current = try observe(&s, h.revision());
    defer current.deinit(a);
    const same = request(current, zero);
    try std.testing.expect(!try apply(&h, &s, &same));
    try std.testing.expectEqual(@as(usize, 1), h.stats().redoCount);
    try std.testing.expect(try h.redo(&s));
}
test "object outer margins source hash and expected margin mismatches never commit" {
    const bytes = try squareInput(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    var before = try observe(&s, 0);
    defer before.deinit(a);
    var r = request(before, changed);
    r.geometry.owner.sourceSha256[0] ^= 1;
    try std.testing.expectError(error.StaleObjectGeometryOwner, apply(&h, &s, &r));
    r = request(before, changed);
    r.expectedMargins.left = 1;
    try std.testing.expectError(error.StaleObjectOuterMargins, apply(&h, &s, &r));
    try std.testing.expectEqual(@as(u32, 0), h.revision());
}
const root_prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run>";
const raw_prefix = root_prefix ++ "<p:rect textWrap='SQUARE'><p:pos treatAsChar='0'/>";
const raw_suffix = "</p:rect></p:run></p:p></s:sec>";
const margin = "<p:outMargin left='0' right='0' top='0' bottom='0'/>";
fn rawTree(allocator: std.mem.Allocator, bytes: []const u8) !@import("section_tree.zig").Tree {
    return @import("section_tree.zig").parse(allocator, bytes, 0, 0, .{});
}
test "object outer margins existing-node writer changes only requested attribute values" {
    var tree = try rawTree(a, raw_prefix ++ margin ++ raw_suffix);
    defer tree.deinit(a);
    const output = try write.writeTree(a, &tree, 3, zero, changed, 8192);
    defer a.free(output);
    try std.testing.expectEqualStrings(raw_prefix ++ "<p:outMargin left='100' right='200' top='300' bottom='400'/>" ++ raw_suffix, output);
}
test "object outer margins absent duplicate incomplete negative and overflowing source values refuse" {
    const cases = .{ .{ "", error.MissingObjectOuterMargins }, .{ margin ++ margin, error.DuplicateObjectOuterMargins }, .{ "<p:outMargin left='0' right='0' top='0'/>", error.MissingObjectOuterMargins }, .{ "<p:outMargin left='-1' right='0' top='0' bottom='0'/>", error.InvalidObjectOuterMargins }, .{ "<p:outMargin left='32768' right='0' top='0' bottom='0'/>", error.InvalidObjectOuterMargins } };
    inline for (cases) |case| {
        var tree = try rawTree(a, raw_prefix ++ case[0] ++ raw_suffix);
        defer tree.deinit(a);
        try std.testing.expectError(case[1], owners.readExisting(a, &tree, 3));
    }
}
fn allocationCase(allocator: std.mem.Allocator) !void {
    var tree = try rawTree(allocator, raw_prefix ++ margin ++ raw_suffix);
    defer tree.deinit(allocator);
    const output = try write.writeTree(allocator, &tree, 3, zero, changed, 8192);
    defer allocator.free(output);
    try std.testing.expectEqualStrings(raw_prefix ++ "<p:outMargin left='100' right='200' top='300' bottom='400'/>" ++ raw_suffix, output);
}
test "object outer margins existing-node read writer NoResize failure cleanup" {
    try allocationCase(a);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}

const geometry_wire = "\"geometry\":{\"selector\":{\"kind\":\"drawing\",\"section\":0,\"node\":3},\"owner\":{\"ownerNode\":3,\"componentNode\":null,\"paragraph\":0,\"anchorUnit\":0,\"sourceSha256\":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],\"link\":\"rect:owned\"},\"expected\":{\"width\":10,\"height\":20,\"horizontalOffset\":0,\"verticalOffset\":0,\"treatAsCharacter\":false},\"historyRevision\":0,\"binding\":{\"session\":\"test-session\",\"serial\":\"0\"},\"patch\":{}}";
const expected_wire = ",\"expectedMargins\":{\"left\":0,\"right\":0,\"top\":0,\"bottom\":0},\"margins\":";
test "object outer margins portable request has exact fields and integer boundaries" {
    var parsed = try t.parse(a, "{" ++ geometry_wire ++ expected_wire ++ "{\"left\":0,\"right\":32767,\"top\":1,\"bottom\":2}}");
    defer parsed.deinit();
    try std.testing.expectEqual(@as(u32, 32767), parsed.json.value.margins.right);
    inline for (.{ "{\"left\":-1,\"right\":0,\"top\":0,\"bottom\":0}", "{\"left\":32768,\"right\":0,\"top\":0,\"bottom\":0}", "{\"left\":\"0\",\"right\":0,\"top\":0,\"bottom\":0}", "{\"left\":0,\"right\":0,\"top\":0}", "{\"left\":0,\"right\":0,\"top\":0,\"bottom\":0,\"extra\":0}" }) |bad| {
        try std.testing.expectError(error.InvalidObjectOuterMargins, t.parse(a, "{" ++ geometry_wire ++ expected_wire ++ bad ++ "}"));
    }
    var r = parsed.json.value;
    r.geometry.patch.horizontalOffset = 1;
    try std.testing.expectError(error.InvalidObjectOuterMargins, t.validateRequest(r));
    r = parsed.json.value;
    r.geometry.selector.kind = .chart;
    try std.testing.expectError(error.InvalidObjectOuterMargins, t.validateRequest(r));
}

test "object outer margins unsupported wrap spellings never gain write admission" {
    inline for (.{ "TOP_AND_BOTTOM", "BEHIND_TEXT", "IN_FRONT_OF_TEXT", "TIGHT", "THROUGH" }) |wrap| {
        var tree = try rawTree(a, root_prefix ++ "<p:rect textWrap='" ++ wrap ++ "'><p:pos treatAsChar='0'/>" ++ margin ++ raw_suffix);
        defer tree.deinit(a);
        try std.testing.expectError(error.UnsupportedObjectOuterMargins, owners.readExisting(a, &tree, 3));
    }
}
test "object outer margins grouped rectangle is not a direct body owner" {
    var tree = try rawTree(a, root_prefix ++ "<p:container><p:rect textWrap='SQUARE'><p:pos treatAsChar='0'/>" ++ margin ++ "</p:rect></p:container></p:run></p:p></s:sec>");
    defer tree.deinit(a);
    try std.testing.expectError(error.UnsupportedObjectOuterMargins, owners.readExisting(a, &tree, 4));
}
fn prepareAllocationCase(allocator: std.mem.Allocator, bytes: []const u8, value: t.Request) !void {
    var candidate = (try write.prepare(allocator, bytes, value, .{})) orelse return error.ExpectedMarginCandidate;
    defer candidate.deinit();
    var observed = try owners.observe(allocator, &candidate, .{ .kind = .drawing, .section = 0, .node = try node(&candidate) }, 0, value.geometry.binding);
    defer observed.deinit(allocator);
    try std.testing.expectEqualDeep(changed, observed.margins);
}
test "object outer margins prepared candidate NoResize allocation failures retain original source" {
    const bytes = try squareInput(a);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    var before = try observe(&s, 0);
    defer before.deinit(a);
    const r = request(before, changed);
    try prepareAllocationCase(a, bytes, r);
    try @import("../testing/allocation_failures.zig").check(prepareAllocationCase, .{ bytes, r });
    var after = try observe(&s, 0);
    defer after.deinit(a);
    try std.testing.expectEqualDeep(zero, after.margins);
    try std.testing.expectEqualDeep(before.geometry.owner.sourceSha256, after.geometry.owner.sourceSha256);
}
