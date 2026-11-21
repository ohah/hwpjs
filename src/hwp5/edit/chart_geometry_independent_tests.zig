//! Prepared independent-axis cohort. Parent proportional actual receipts remain separate.
const std = @import("std");
const a = std.testing.allocator;
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const t = @import("../../model/object_geometry.zig");
const adapter = @import("chart_object_geometry.zig");
const Case = struct { name: []const u8, patch: t.Patch, size: [2]u32, section_sha: []const u8 };
const cases = [_]Case{
    .{ .name = "width-only", .patch = .{ .width = 25000 }, .size = .{ 25000, 12000 }, .section_sha = "43ab1f6d10da6ba3a193f497af792fcf1b37fda0c0b8529992a13447301cf4c6" },
    .{ .name = "height-only", .patch = .{ .height = 15000 }, .size = .{ 20000, 15000 }, .section_sha = "63b54d3b7a2f5ceee59e2a2977c44a6c651518a9e8bf6d6c9c42aae7eff3fd70" },
    .{ .name = "nonuniform", .patch = .{ .width = 25000, .height = 18000 }, .size = .{ 25000, 18000 }, .section_sha = "88e87fe7f6e57cfd10ae45cfa09307352effb037b9815df6116dfbcec102143d" },
};
fn input() ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, "apps/docs/docs/public/editor/fixtures/hwp5-chart-create.hwp", a, .limited(1_000_000));
}
fn read(s: *const edit.Session, revision: u32) !t.Observation {
    const rows = try s.hwp5ChartCandidates(a);
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 1), rows.len);
    return s.objectGeometry(a, .{ .kind = .chart, .section = rows[0].section, .node = @intCast(rows[0].owner.component_node) }, revision, .{ .session = "independent-chart-frame", .serial = "0" });
}
fn request(r: t.Observation, patch: t.Patch) t.Request {
    return .{ .selector = r.selector, .owner = r.owner, .expected = r.frame, .historyRevision = r.historyRevision, .binding = r.binding, .patch = patch };
}
fn saved(s: *edit.Session) ![]u8 {
    return (try s.save(a, .{ .allow_stale_layout = true })).bytes;
}
fn verifyBytes(bytes: []const u8, expected_section: []const u8) !void {
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var hash: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(raw, &hash, .{});
    try std.testing.expectEqualStrings(expected_section, &std.fmt.bytesToHex(hash, .lower));
    var index = try @import("binary_resource_index.zig").Index.init(a, &source);
    defer index.deinit(a);
    const resource = try index.read(a, 1, 1_000_000);
    defer a.free(resource);
    std.crypto.hash.sha2.Sha256.hash(resource, &hash, .{});
    try std.testing.expectEqualStrings("159f4396f67f7ee93f3a07946d5a2a598112d7d2b860beb1ebf4bdcbef988e60", &std.fmt.bytesToHex(hash, .lower));
}
fn runCase(c: Case) !void {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    var before = try read(s, h.revision());
    defer before.deinit(a);
    const r = request(before, c.patch);
    try std.testing.expect(try h.apply(s, .{ .edit_object_geometry = &r }));
    try std.testing.expectEqual(@as(u32, 1), h.revision());
    var current = try read(s, h.revision());
    defer current.deinit(a);
    try std.testing.expectEqualDeep(try t.after(before.frame, c.patch), current.frame);
    try std.testing.expectEqualDeep(c.size, [2]u32{ current.frame.width, current.frame.height });
    try std.testing.expectError(error.LayoutReflowRequired, s.save(a, .{}));
    const output = try saved(s);
    defer a.free(output);
    try verifyBytes(output, c.section_sha);
    try std.testing.expect(try h.undo(s));
    const undone = try saved(s);
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, bytes, undone);
    try std.testing.expect(try h.redo(s));
    const redone = try saved(s);
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, output, redone);
    const fresh = try edit.Session.open(a, output);
    defer fresh.close();
    fresh.enableHistoryDelta();
    var restored = try read(fresh, 0);
    defer restored.deinit(a);
    try std.testing.expectEqualDeep(current.frame, restored.frame);
    const reopened = try fresh.save(a, .{});
    defer a.free(reopened.bytes);
    try std.testing.expectEqualSlices(u8, output, reopened.bytes);
    if (try @import("../../testing/evidence_output.zig").Sink.fromEnviron(a, std.testing.io, std.testing.environ, "HWPJS_CHART_INDEPENDENT_EVIDENCE")) |value| {
        var sink = value;
        defer sink.deinit();
        const leaf = try std.fmt.allocPrint(a, "{s}.hwp", .{c.name});
        defer a.free(leaf);
        try sink.writeFile(leaf, output);
    }
}
test "object geometry H5 chart independent resize I01 width only history strict save intrinsic reopen" {
    try runCase(cases[0]);
}
test "object geometry H5 chart independent resize I02 height only history strict save intrinsic reopen" {
    try runCase(cases[1]);
}
test "object geometry H5 chart independent resize I03 nonuniform history strict save intrinsic reopen" {
    try runCase(cases[2]);
}
test "object geometry H5 chart independent resize I04 consecutive frames no-op prior redo full bytes" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    var outputs: [3]?[]u8 = @splat(null);
    defer for (outputs) |value| if (value) |owned| a.free(owned);
    for (cases, 0..) |c, i| {
        var current = try read(s, h.revision());
        defer current.deinit(a);
        const r = request(current, .{ .width = c.size[0], .height = c.size[1] });
        try std.testing.expect(try h.apply(s, .{ .edit_object_geometry = &r }));
        outputs[i] = try saved(s);
        try verifyBytes(outputs[i].?, c.section_sha);
    }
    for (0..3) |i| {
        try std.testing.expect(try h.undo(s));
        const result = try saved(s);
        defer a.free(result);
        try std.testing.expectEqualSlices(u8, if (i == 2) bytes else outputs[1 - i].?, result);
        var current = try read(s, h.revision());
        defer current.deinit(a);
        const noop = request(current, .{ .width = current.frame.width, .height = current.frame.height });
        const rev = h.revision();
        try std.testing.expect(!try h.apply(s, .{ .edit_object_geometry = &noop }));
        try std.testing.expectEqual(rev, h.revision());
    }
    for (outputs) |expected| {
        try std.testing.expect(try h.redo(s));
        const result = try saved(s);
        defer a.free(result);
        try std.testing.expectEqualSlices(u8, expected.?, result);
    }
}
fn allocationTrial(f: std.mem.Allocator, bytes: []const u8) !void {
    const s = try edit.Session.open(f, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(f, s, .{});
    defer h.deinit();
    var current = try read(s, h.revision());
    defer current.deinit(a);
    const r = request(current, cases[2].patch);
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
test "object geometry H5 chart independent resize I05 nonuniform NoResize allocation cleanup rollback" {
    const bytes = try input();
    defer a.free(bytes);
    try @import("../../testing/allocation_failures.zig").check(allocationTrial, .{bytes});
}
test "object geometry H5 chart independent resize I06 unknown attributes and zero current extents remain refused" {
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
    const offset = record.offset + record.raw.len - record.payload.len;
    const changed = try a.dupe(u8, raw);
    defer a.free(changed);
    changed[offset + 36] |= 4;
    var changed_tree = try @import("source_tree.zig").parse(a, changed, source.header.version(), .{});
    defer changed_tree.deinit(a);
    try std.testing.expectError(error.UnsupportedObjectGeometryTransform, adapter.checkedShape(changed_tree, rows[0].owner));
    const zero = try a.dupe(u8, raw);
    defer a.free(zero);
    std.mem.writeInt(u32, zero[offset + 28 ..][0..4], 0, .little);
    var zero_tree = try @import("source_tree.zig").parse(a, zero, source.header.version(), .{});
    defer zero_tree.deinit(a);
    var zero_site = rows[0].owner;
    zero_site.geometry.width = 0;
    try std.testing.expectError(error.UnsupportedHwp5ChartGeometryExtent, adapter.checkedShape(zero_tree, zero_site));
}
fn withTail(tree: @import("../body/tree.zig").Tree, selected: usize) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    for (tree.nodes, 0..) |node, i| {
        const record = node.record.framing;
        if (i != selected) {
            try out.appendSlice(a, record.raw);
            continue;
        }
        const payload = try a.alloc(u8, record.payload.len + 2);
        defer a.free(payload);
        @memcpy(payload[0..record.payload.len], record.payload);
        @memset(payload[record.payload.len..], 0);
        try @import("../record_writer.zig").append(a, &out, record.tag, record.level, payload, 1_000_000);
    }
    return out.toOwnedSlice(a);
}
test "object geometry H5 chart independent resize I07 opaque common and component tails remain refused" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    const rows = try s.hwp5ChartCandidates(a);
    defer a.free(rows);
    const site = rows[0].owner;
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var tree = try @import("source_tree.zig").parse(a, raw, source.header.version(), .{});
    defer tree.deinit(a);
    const extra_component = try withTail(tree, site.component_node);
    defer a.free(extra_component);
    var component_tree = try @import("source_tree.zig").parse(a, extra_component, source.header.version(), .{});
    defer component_tree.deinit(a);
    try std.testing.expectError(error.UnsupportedHwp5ChartGeometryProfile, adapter.checkedShape(component_tree, site));
    const extra_common = try withTail(tree, site.control_node);
    defer a.free(extra_common);
    var common_tree = try @import("source_tree.zig").parse(a, extra_common, source.header.version(), .{});
    defer common_tree.deinit(a);
    try std.testing.expectError(error.UnsupportedHwp5ChartGeometryHost, adapter.checkedShape(common_tree, site));
}
fn currentScaleBits(bytes: []const u8) ![6]u64 {
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var tree = try @import("source_tree.zig").parse(a, raw, source.header.version(), .{});
    defer tree.deinit(a);
    for (tree.nodes) |node| if (node.record.framing.tag == @import("../body/shape_component.zig").tag) {
        const shape = try @import("../body/shape_component.zig").Component.parse(node.record.framing.payload, .double_id);
        return shape.rendering.pairs.get(0).?.scale.bits;
    };
    return error.MissingChartShape;
}
test "object geometry H5 chart independent resize I08 one-axis edit preserves other scale coefficient bits" {
    const bytes = try input();
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    var before = try read(s, h.revision());
    defer before.deinit(a);
    const first = request(before, .{ .width = 23333, .height = 16987 });
    try std.testing.expect(try h.apply(s, .{ .edit_object_geometry = &first }));
    const intermediate = try saved(s);
    defer a.free(intermediate);
    const old_scale = try currentScaleBits(intermediate);
    var current = try read(s, h.revision());
    defer current.deinit(a);
    const second = request(current, .{ .width = 22222 });
    try std.testing.expect(try h.apply(s, .{ .edit_object_geometry = &second }));
    const output = try saved(s);
    defer a.free(output);
    const new_scale = try currentScaleBits(output);
    for ([_]usize{ 1, 2, 3, 4, 5 }) |axis| try std.testing.expectEqual(old_scale[axis], new_scale[axis]);
    var after = try read(s, h.revision());
    defer after.deinit(a);
    try std.testing.expectEqual(@as(u32, 22222), after.frame.width);
    try std.testing.expectEqual(@as(u32, 16987), after.frame.height);
}
