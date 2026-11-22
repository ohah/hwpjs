//! ABI-only portable-handler contracts. Core native10 is not repeated here.
const std = @import("std");
const t = std.testing;
const a = t.allocator;
const bridge = @import("hwp5_picture_crop_edit_bridge.zig");
const wire = @import("hwp5_picture_crop_edit_wire.zig");
const crop = @import("../hwp5/edit/picture_crop.zig");
const fixture = @import("../hwp5/edit/picture_crop_fixture.zig");
const Session = @import("../hwp5/edit/style_preservation.zig").Session;
const History = @import("../hwp5/edit/editor_history.zig").History;
const paired: crop.Rect = .{ .left = 225, .top = 375, .right = 4575, .bottom = 2025 };
const Harness = struct {
    session: *Session,
    history: History,
    store: bridge.Store,
    view: @import("editor_view_epoch.zig").Epoch,
    generation: @import("../model/document_text_read_generation.zig").State,
    fn init(self: *Harness) !void {
        const input = try fixture.make(a, fixture.png);
        defer a.free(input);
        self.session = try Session.open(a, input);
        errdefer self.session.close();
        self.session.enableHistoryDelta();
        self.history = try History.initV2(a, self.session, .{});
        self.store = .{};
        self.view = .{};
        self.generation = .{};
    }
    fn deinit(self: *Harness) void {
        self.store.clear();
        self.history.deinit();
        self.session.close();
    }
    fn context(self: *Harness) bridge.Context {
        return .{ .session = self.session, .history = &self.history, .generation = &self.generation, .view = &self.view };
    }
    fn capture(self: *Harness) !u64 {
        const selected = try fixture.selector(a, self.session);
        const bytes = try bridge.capture(a, &self.store, self.context(), selected.section, selected.picture_node);
        defer a.free(bytes);
        return wire.key(a, bytes);
    }
    fn request(self: *Harness, id: u64, rect: crop.Rect) !bool {
        var token: [20]u8 = undefined;
        const bytes = try std.json.Stringify.valueAlloc(a, wire.Commit{ .leaseKey = try std.fmt.bufPrint(&token, "{d}", .{id}), .crop = rect }, .{});
        defer a.free(bytes);
        return bridge.commit(a, &self.store, self.context(), bytes);
    }
};
test "H5 crop ABI strict integer canonical decimal bounded request and no caller witness" {
    const good = "{\"leaseKey\":\"9007199254740993\",\"crop\":{\"left\":0,\"top\":0,\"right\":2147483647,\"bottom\":1}}";
    const parsed = try wire.parse(a, good);
    defer parsed.deinit();
    try t.expectEqual(@as(u64, 9007199254740993), try wire.key(a, good));
    for ([_][]const u8{
        "{\"leaseKey\":\"1\",\"crop\":{\"left\":\"0\",\"top\":0,\"right\":1,\"bottom\":1}}",
        "{\"leaseKey\":\"1\",\"crop\":{\"left\":0.0,\"top\":0,\"right\":1,\"bottom\":1}}",
        "{\"leaseKey\":\"1\",\"crop\":{\"left\":0,\"top\":0,\"right\":2147483648,\"bottom\":1}}",
        "{\"leaseKey\":\"1\",\"crop\":{\"left\":null,\"top\":0,\"right\":1,\"bottom\":1}}",
        "{\"leaseKey\":\"1\",\"crop\":{\"left\":0,\"top\":0,\"right\":1,\"bottom\":1},\"before\":{}}",
    }) |bad| try t.expectError(error.InvalidPictureCropWire, wire.parse(a, bad));
    try t.expectError(error.InvalidPictureCropLease, wire.leaseId("0"));
    for ([_][]const u8{ "01", "+1", "18446744073709551616" }) |bad| try t.expectError(error.InvalidFormattingReference, wire.leaseId(bad));
    try t.expectError(error.InvalidPictureCropWire, wire.key(a, &.{0xff}));
    const oversized: [wire.max_request_bytes + 1]u8 = @splat(' ');
    try t.expectError(error.LimitExceeded, wire.key(a, &oversized));
    if (wire.key(a, "{\"leaseKey\":\"1\",\"leaseKey\":\"2\"}")) |_| return error.DuplicateKeyAccepted else |_| {}
}
test "H5 crop ABI capture exact named source edges bounds and private full witness" {
    var h: Harness = undefined;
    try h.init();
    defer h.deinit();
    const id = try h.capture();
    const before = h.store.retained.?.before;
    const bytes = try wire.capture(a, id, before, h.history.revision());
    defer a.free(bytes);
    const parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
    defer parsed.deinit();
    const root = parsed.value.object;
    try t.expectEqual(@as(usize, 8), root.count());
    try t.expectEqualStrings("hwp5", root.get("format").?.string);
    try t.expectEqualStrings("absent_75_policy", root.get("bounds").?.object.get("basis").?.string);
    try t.expectEqual(@as(i64, 4800), root.get("bounds").?.object.get("width").?.integer);
    try t.expect(root.get("before") == null and root.get("ticket") == null and root.get("source_sha256") == null);
    try t.expectEqual(@as(i64, 0), root.get("crop").?.object.get("left").?.integer);
    var explicit = before;
    explicit.extent.basis = .original_dimensions;
    const other = try wire.capture(a, id, explicit, h.history.revision());
    defer a.free(other);
    try t.expect(std.mem.indexOf(u8, other, "explicit_pair") != null);
}
test "H5 crop ABI recapture failed capture and exact release never reuse or cancel another key" {
    var h: Harness = undefined;
    try h.init();
    defer h.deinit();
    const first = try h.capture();
    const second = try h.capture();
    try t.expect(second > first);
    try t.expect(!h.store.release(first));
    try t.expectEqual(second, h.store.retained.?.id);
    try t.expect(h.store.release(second));
    try t.expect(!h.store.release(second));
    _ = try h.capture();
    if (bridge.capture(a, &h.store, h.context(), 0, std.math.maxInt(u32))) |bytes| {
        a.free(bytes);
        return error.InvalidOwnerAccepted;
    } else |_| {}
    try t.expect(h.store.retained == null);
    const last = try h.capture();
    h.store.clear();
    const next = try h.capture();
    try t.expect(next > last);
}
test "H5 crop ABI matching noop consumes without revision view or read generation advance" {
    var h: Harness = undefined;
    try h.init();
    defer h.deinit();
    const id = try h.capture();
    const rect = h.store.retained.?.before.rect;
    const rev = h.history.revision();
    const view = try h.view.current();
    const generation = try h.generation.current();
    try t.expect(!try h.request(id, rect));
    try t.expect(h.store.retained == null);
    try t.expectEqual(rev, h.history.revision());
    try t.expectEqual(view, try h.view.current());
    try t.expectEqual(generation, try h.generation.current());
    try t.expectError(error.StalePictureCropLease, h.request(id, rect));
}
test "H5 crop ABI asymmetric paired commit binds physical source and advances one history view generation" {
    var h: Harness = undefined;
    try h.init();
    defer h.deinit();
    const input = try h.session.save(a, .{});
    defer a.free(input.bytes);
    const id = try h.capture();
    const view = try h.view.current();
    const generation = try h.generation.current();
    try t.expect(try h.request(id, paired));
    try t.expectEqual(@as(u32, 1), h.history.revision());
    try t.expectEqual(view + 1, try h.view.current());
    try t.expectEqual(generation + 1, try h.generation.current());
    try t.expectError(error.StalePictureCropLease, h.request(id, paired));
    const saved = try h.session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try fixture.assertRaw(a, input.bytes, saved.bytes, paired);
}
test "H5 crop ABI matching malformed consumes wrong key preserves and malformed envelope clears" {
    var h: Harness = undefined;
    try h.init();
    defer h.deinit();
    const id = try h.capture();
    try t.expectError(error.StalePictureCropLease, h.request(id + 1, paired));
    try t.expectEqual(id, h.store.retained.?.id);
    const bad = try std.fmt.allocPrint(a, "{{\"leaseKey\":\"{d}\",\"crop\":{{}}}}", .{id});
    defer a.free(bad);
    try t.expectError(error.InvalidPictureCropWire, bridge.commit(a, &h.store, h.context(), bad));
    try t.expect(h.store.retained == null);
    _ = try h.capture();
    if (bridge.commit(a, &h.store, h.context(), "{")) |_| return error.MalformedAccepted else |_| {}
    try t.expect(h.store.retained == null);
    try t.expectEqual(@as(u32, 0), h.history.revision());
}
test "H5 crop ABI stale read generation and view consume before data mutation" {
    var h: Harness = undefined;
    try h.init();
    defer h.deinit();
    var id = try h.capture();
    try h.generation.enterMutation();
    try t.expectError(error.StalePictureCropLease, h.request(id, paired));
    try t.expect(h.store.retained == null);
    id = try h.capture();
    h.view.invalidate();
    try t.expectError(error.StalePictureCropLease, h.request(id, paired));
    try t.expect(h.store.retained == null);
    try t.expectEqual(@as(u32, 0), h.history.revision());
}
test "H5 crop ABI inactive legacy poisoned contexts close capability and matching lease" {
    var h: Harness = undefined;
    try h.init();
    defer h.deinit();
    try t.expectEqual(@as(u32, 1), bridge.version(h.context()));
    var context = h.context();
    context.session = null;
    try t.expectEqual(@as(u32, 0), bridge.version(context));
    context = h.context();
    context.history = null;
    try t.expectEqual(@as(u32, 0), bridge.version(context));
    const id = try h.capture();
    h.history.owned.?.poisoned = true;
    try t.expectEqual(@as(u32, 0), bridge.version(h.context()));
    try t.expectError(error.HistoryMutationUncertain, h.request(id, paired));
    try t.expect(h.store.retained == null);
}
