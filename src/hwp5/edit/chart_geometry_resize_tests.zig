//! Prepared focused Native cohort. No compiler/test execution has been granted.
const std = @import("std");
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const t = @import("../../model/object_geometry.zig");
const adapter = @import("chart_object_geometry.zig");
const a = std.testing.allocator;
fn input() ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, "apps/docs/docs/public/editor/fixtures/hwp5-chart-create.hwp", a, .limited(1_000_000));
}
fn read(s: *const edit.Session, revision: u32) !t.Observation {
    const rows = try s.hwp5ChartCandidates(a);
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 1), rows.len);
    return s.objectGeometry(a, .{ .kind = .chart, .section = rows[0].section, .node = @intCast(rows[0].owner.component_node) }, revision, .{ .session = "native-chart-size", .serial = "0" });
}
fn request(r: t.Observation, patch: t.Patch) t.Request {
    return .{ .selector = r.selector, .owner = r.owner, .expected = r.frame, .historyRevision = r.historyRevision, .binding = r.binding, .patch = patch };
}
fn saved(s: *edit.Session) ![]u8 {
    return (try s.save(a, .{ .allow_stale_layout = true })).bytes;
}
fn exactSource(saved_bytes: []const u8, expected_section_sha: []const u8) !void {
    var source = try @import("../text_source.zig").Source.open(a, saved_bytes);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(raw, &digest, .{});
    try std.testing.expectEqualStrings(expected_section_sha, &std.fmt.bytesToHex(digest, .lower));
    var index = try @import("binary_resource_index.zig").Index.init(a, &source);
    defer index.deinit(a);
    const resource = try index.read(a, 1, 1_000_000);
    defer a.free(resource);
    std.crypto.hash.sha2.Sha256.hash(resource, &digest, .{});
    try std.testing.expectEqualStrings("159f4396f67f7ee93f3a07946d5a2a598112d7d2b860beb1ebf4bdcbef988e60", &std.fmt.bytesToHex(digest, .lower));
}
test "object geometry H5 chart frame resize N01 common current one history strict save intrinsic resource reopen" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    var before = try read(s, h.revision());
    defer before.deinit(a);
    try std.testing.expect(before.editable.size and !before.editable.position);
    const r = request(before, .{ .width = 25000, .height = 15000 });
    try std.testing.expect(try h.apply(s, .{ .edit_object_geometry = &r }));
    try std.testing.expectEqual(@as(u32, 1), h.revision());
    var after = try read(s, h.revision());
    defer after.deinit(a);
    try std.testing.expectEqualDeep(try t.after(before.frame, r.patch), after.frame);
    try std.testing.expectError(error.LayoutReflowRequired, s.save(a, .{}));
    const output = try saved(s);
    defer a.free(output);
    try exactSource(output, "2e9f35b04bc1340c06e61201936e8e185057bed27103b1efdb28803aa62d79b2");
    const fresh = try edit.Session.open(a, output);
    defer fresh.close();
    fresh.enableHistoryDelta();
    var restored = try read(fresh, 0);
    defer restored.deinit(a);
    try std.testing.expectEqualDeep(after.frame, restored.frame);
    const reopened = try fresh.save(a, .{});
    defer a.free(reopened.bytes);
    try std.testing.expectEqualSlices(u8, output, reopened.bytes);
    if (try @import("../../testing/evidence_output.zig").Sink.fromEnviron(a, std.testing.io, std.testing.environ, "HWPJS_CHART_GEOMETRY_EVIDENCE")) |value| {
        var sink = value;
        defer sink.deinit();
        try sink.writeFile("chart-size-edited.hwp", output);
    }
}
test "object geometry H5 chart frame resize N02 exact no-op undo prior redo preserve full saved bytes" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    var before = try read(s, h.revision());
    defer before.deinit(a);
    const noop = request(before, .{ .width = before.frame.width, .height = before.frame.height });
    try std.testing.expect(!try h.apply(s, .{ .edit_object_geometry = &noop }));
    try std.testing.expectEqual(@as(u32, 0), h.revision());
    const change = request(before, .{ .width = 25000, .height = 15000 });
    try std.testing.expect(try h.apply(s, .{ .edit_object_geometry = &change }));
    const output = try saved(s);
    defer a.free(output);
    try std.testing.expect(try h.undo(s));
    const undo = try saved(s);
    defer a.free(undo);
    try std.testing.expectEqualSlices(u8, bytes, undo);
    var current = try read(s, h.revision());
    defer current.deinit(a);
    const same = request(current, .{ .width = current.frame.width });
    try std.testing.expect(!try h.apply(s, .{ .edit_object_geometry = &same }));
    try std.testing.expect(try h.redo(s));
    const redo = try saved(s);
    defer a.free(redo);
    try std.testing.expectEqualSlices(u8, output, redo);
}
test "object geometry H5 chart frame resize N03 position key refusal keeps original revision" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    var current = try read(s, h.revision());
    defer current.deinit(a);
    const r = request(current, .{ .horizontalOffset = current.frame.horizontalOffset });
    try std.testing.expectError(error.ObjectGeometryReadOnly, h.apply(s, .{ .edit_object_geometry = &r }));
    try std.testing.expectEqual(@as(u32, 0), h.revision());
    const output = try saved(s);
    defer a.free(output);
    try std.testing.expectEqualSlices(u8, bytes, output);
}
test "object geometry H5 chart frame resize N04 stale expected owner is rejected before source publication" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    var current = try read(s, h.revision());
    defer current.deinit(a);
    var r = request(current, .{ .width = 25000 });
    r.expected.width += 1;
    try std.testing.expectError(error.StaleObjectGeometryOwner, h.apply(s, .{ .edit_object_geometry = &r }));
    try std.testing.expectEqual(@as(u32, 0), h.revision());
    const output = try saved(s);
    defer a.free(output);
    try std.testing.expectEqualSlices(u8, bytes, output);
}
test "object geometry H5 chart frame resize N05 rotation and flip remain outside the shape profile" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    const rows = try s.hwp5ChartCandidates(a);
    defer a.free(rows);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var tree = try @import("source_tree.zig").parse(a, raw, source.header.version(), .{});
    defer tree.deinit(a);
    const record = tree.nodes[rows[0].owner.component_node].record.framing;
    const start = record.offset + record.raw.len - record.payload.len;
    _ = try adapter.checkedShape(tree, rows[0].owner);
    for ([_]usize{ 36, 40 }) |offset| {
        const changed = try a.dupe(u8, raw);
        defer a.free(changed);
        changed[start + offset] |= 1;
        var changed_tree = try @import("source_tree.zig").parse(a, changed, source.header.version(), .{});
        defer changed_tree.deinit(a);
        try std.testing.expectError(error.UnsupportedObjectGeometryTransform, adapter.checkedShape(changed_tree, rows[0].owner));
    }
}
test "object geometry H5 chart frame resize N06 intrinsic extent mismatch is refused without rewriting it" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    const rows = try s.hwp5ChartCandidates(a);
    defer a.free(rows);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var tree = try @import("source_tree.zig").parse(a, raw, source.header.version(), .{});
    defer tree.deinit(a);
    var site = rows[0].owner;
    site.extent_x += 1;
    try std.testing.expectError(error.UnsupportedHwp5ChartGeometryExtent, adapter.checkedShape(tree, site));
}
test "object geometry H5 chart frame resize N07 registered PNG intrinsic dimensions are verified independently" {
    const bytes = try input();
    defer a.free(bytes);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    var index = try @import("binary_resource_index.zig").Index.init(a, &source);
    defer index.deinit(a);
    const resource = try index.read(a, 1, 1_000_000);
    defer a.free(resource);
    try adapter.validatePresentation(a, resource);
    const at = std.mem.indexOf(u8, resource, "PNG\x00") orelse return error.MissingChartPresentation;
    const changed = try a.dupe(u8, resource);
    defer a.free(changed);
    const old = std.mem.readInt(u32, changed[at + 24 ..][0..4], .little);
    std.mem.writeInt(u32, changed[at + 24 ..][0..4], old + 1, .little);
    try std.testing.expectError(error.ChartCreateVerificationFailed, adapter.validatePresentation(a, changed));
}
test "object geometry H5 chart frame resize N08 independent frame support preserves original intrinsic resource" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    var current = try read(s, h.revision());
    defer current.deinit(a);
    const r = request(current, .{ .width = 25000, .height = 12000 });
    try std.testing.expect(try h.apply(s, .{ .edit_object_geometry = &r }));
    try std.testing.expectEqual(@as(u32, 1), h.revision());
    const output = try saved(s);
    defer a.free(output);
    try exactSource(output, "43ab1f6d10da6ba3a193f497af792fcf1b37fda0c0b8529992a13447301cf4c6");
}
fn allocationTrial(f: std.mem.Allocator, bytes: []const u8) !void {
    const s = try edit.Session.open(f, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(f, s, .{});
    defer h.deinit();
    var current = try read(s, h.revision());
    defer current.deinit(a);
    const r = request(current, .{ .width = 25000, .height = 15000 });
    _ = h.apply(s, .{ .edit_object_geometry = &r }) catch |err| {
        if (err == error.OutOfMemory) {
            try std.testing.expectEqual(@as(u32, 0), h.revision());
            const remaining = try saved(s);
            defer a.free(remaining);
            try std.testing.expectEqualSlices(u8, bytes, remaining);
        }
        return err;
    };
}
test "object geometry H5 chart frame resize N09 ordinary success NoResize allocation sweep and leak cleanup" {
    const bytes = try input();
    defer a.free(bytes);
    try @import("../../testing/allocation_failures.zig").check(allocationTrial, .{bytes});
}
