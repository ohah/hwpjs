//! Native tests: authored, not executed until Main assigns a Native slot.
const std = @import("std");
const t = @import("../model/object_geometry.zig");
const editor = @import("editor_session.zig");
const owners = @import("object_geometry_owner.zig");
const History = @import("editor_history.zig").History;
const a = std.testing.allocator;
fn input() ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, "apps/docs/docs/public/editor/fixtures/chart-data-edit.hwpx", a, .limited(8_000_000));
}
fn chart(s: *const editor.Session, revision: u64) !t.Observation {
    const nodes = try @import("chart_current_snapshot.zig").nodes(a, s, 0);
    defer a.free(nodes);
    if (nodes.len != 1) return error.ExpectedSingleAuthoredChart;
    return owners.observe(a, s, .{ .kind = .chart, .section = 0, .node = @intCast(nodes[0]) }, revision, .{ .session = "native-test", .serial = "0" });
}
fn request(value: t.Observation, patch: t.Patch) t.Request {
    return .{ .selector = value.selector, .owner = value.owner, .expected = value.frame, .historyRevision = value.historyRevision, .binding = value.binding, .patch = patch };
}
test "object geometry HX chart geometry commits both Native branches once with undo redo saved reopen" {
    const bytes = try input();
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    var before = try chart(&s, h.revision());
    defer before.deinit(a);
    const saved_before = try s.save();
    defer a.free(saved_before);
    const r = request(before, .{ .width = 20000, .height = 12000, .horizontalOffset = -500, .verticalOffset = 300, .treatAsCharacter = false });
    try std.testing.expect(try h.apply(&s, .{ .kind = .object_geometry, .object_geometry = &r, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "" }));
    try std.testing.expectEqual(@as(u32, 1), h.revision());
    var after = try chart(&s, h.revision());
    defer after.deinit(a);
    try std.testing.expectEqualDeep(try t.after(before.frame, r.patch), after.frame);
    const saved_after = try s.save();
    defer a.free(saved_after);
    var reopened = try editor.open(a, saved_after, .{});
    defer reopened.deinit();
    var restored = try chart(&reopened, 0);
    defer restored.deinit(a);
    try std.testing.expectEqualDeep(after.frame, restored.frame);
    try std.testing.expect(try h.undo(&s));
    const undo = try s.save();
    defer a.free(undo);
    try std.testing.expectEqualSlices(u8, saved_before, undo);
    try std.testing.expect(try h.redo(&s));
    const redo = try s.save();
    defer a.free(redo);
    try std.testing.expectEqualSlices(u8, saved_after, redo);
}
test "object geometry HX geometry stale owner source digest and readonly source never publish partial changes" {
    const bytes = try input();
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    var before = try chart(&s, h.revision());
    defer before.deinit(a);
    var r = request(before, .{ .width = 20000 });
    r.owner.sourceSha256[0] ^= 1;
    const saved = try s.save();
    defer a.free(saved);
    try std.testing.expectError(error.StaleObjectGeometryOwner, h.apply(&s, .{ .kind = .object_geometry, .object_geometry = &r, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "" }));
    const unchanged = try s.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, saved, unchanged);
    try std.testing.expectEqual(@as(u32, 0), h.revision());
}
fn textbox(s: *const editor.Session, revision: u64) !t.Observation {
    const tree = &s.sections[0].tree;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "rect")) continue;
        return owners.observe(a, s, .{ .kind = .drawing, .section = 0, .node = @intCast(node) }, revision, .{ .session = "native-test", .serial = "0" });
    }
    return error.MissingTextbox;
}
test "object geometry HX textbox Native geometry updates true local axes and survives history and reopen" {
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "apps/docs/docs/public/editor/fixtures/textbox.hwpx", a, .limited(8_000_000));
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try History.initV2(&s, .{});
    defer h.deinit();
    var before = try textbox(&s, h.revision());
    defer before.deinit(a);
    const saved_before = try s.save();
    defer a.free(saved_before);
    const r = request(before, .{ .width = 20000, .height = 12000, .horizontalOffset = -500, .treatAsCharacter = false });
    try std.testing.expect(try h.apply(&s, .{ .kind = .object_geometry, .object_geometry = &r, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "" }));
    var after = try textbox(&s, h.revision());
    defer after.deinit(a);
    try std.testing.expectEqualDeep(try t.after(before.frame, r.patch), after.frame);
    const source = try @import("rectangle_rendering_source.zig").read(a, &s.sections[0].tree, after.selector.node);
    const points = source.rendering_corners orelse return error.MissingObjectGeometryPoint;
    try std.testing.expectApproxEqAbs(@as(f64, 20000), std.math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]), 0.01);
    try std.testing.expectApproxEqAbs(@as(f64, 12000), std.math.hypot(points[3][0] - points[0][0], points[3][1] - points[0][1]), 0.01);
    const saved_after = try s.save();
    defer a.free(saved_after);
    var reopened = try editor.open(a, saved_after, .{});
    defer reopened.deinit();
    var restored = try textbox(&reopened, 0);
    defer restored.deinit(a);
    try std.testing.expectEqualDeep(after.frame, restored.frame);
    try std.testing.expect(try h.undo(&s));
    const undo = try s.save();
    defer a.free(undo);
    try std.testing.expectEqualSlices(u8, saved_before, undo);
    try std.testing.expect(try h.redo(&s));
    const redo = try s.save();
    defer a.free(redo);
    try std.testing.expectEqualSlices(u8, saved_after, redo);
}
test "object geometry HX geometry source writer allocation failures never mutate either branch" {
    const bytes = try input();
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    var before = try chart(&s, 0);
    defer before.deinit(a);
    const tree = &s.sections[0].tree;
    const hash_before = before.owner.sourceSha256;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("xml_part_tree.zig").Tree, value: t.Observation) !void {
            const after = try @import("object_geometry_write.zig").writeTree(allocator, source, value.selector, value.frame, try t.after(value.frame, .{ .width = 20000, .height = 12000, .horizontalOffset = -300 }), 8_000_000);
            defer allocator.free(after);
        }
    }.run, .{ tree, before });
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(tree.source, &digest, .{});
    try std.testing.expectEqualDeep(hash_before, digest);
}
