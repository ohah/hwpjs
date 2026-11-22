//! Portable handlers used by actual optional exports; not a compiled WASM proof.
const std = @import("std");
const t = std.testing;
const a = t.allocator;
const bridge = @import("hwpx_picture_crop_edit_bridge.zig");
const wire = @import("hwpx_picture_crop_edit_wire.zig");
const Editor = @import("../hwpx/editor_session.zig");
const History = @import("../hwpx/editor_history.zig").History;
const fixture = @embedFile("../testing/fixtures/picture-crop-edit/picture-resize.hwpx");
const rect: @import("../hwpx/picture_crop_edit.zig").Rect = .{ .left = 750, .top = 375, .right = 4050, .bottom = 2025 };
const Harness = struct {
    session: Editor.Session,
    history: History,
    store: bridge.Store,
    generation: @import("../model/document_text_read_generation.zig").State,
    fn init(self: *Harness) !void {
        return self.initBytes(fixture);
    }
    fn initBytes(self: *Harness, input: []const u8) !void {
        self.session = try Editor.open(a, input, .{});
        errdefer self.session.deinit();
        self.session.history_delta_managed = true;
        self.history = try History.initV2(&self.session, .{});
        self.store = .{};
        self.generation = .{};
    }
    fn deinit(self: *Harness) void {
        self.store.clear(a);
        self.history.deinit();
        self.session.deinit();
    }
    fn context(self: *Harness) bridge.Context {
        return .{ .session = &self.session, .history = &self.history, .generation = &self.generation, .instance_epoch = 1 };
    }
    fn node(self: *Harness) !u32 {
        const tree = &self.session.sections[0].tree;
        for (tree.elements) |element| {
            if (!element.is(@import("../hwpx/document_xml.zig").paragraph_uri, "imgClip") or element.start_tag.start != 1871) continue;
            const parent = element.parent orelse return error.MissingFixtureCropOwner;
            if (!tree.elements[parent].is(@import("../hwpx/document_xml.zig").paragraph_uri, "pic")) return error.MissingFixtureCropOwner;
            return @intCast(parent);
        }
        return error.MissingFixtureCropOwner;
    }
    fn capture(self: *Harness) !u64 {
        const bytes = try bridge.capture(a, &self.store, self.context(), 0, try self.node());
        defer a.free(bytes);
        const parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
        defer parsed.deinit();
        return wire.leaseId(parsed.value.object.get("leaseKey").?.string);
    }
    fn request(self: *Harness, id: u64, value: @import("../hwpx/picture_crop_edit.zig").Rect) !bool {
        var token: [20]u8 = undefined;
        const bytes = try std.json.Stringify.valueAlloc(a, wire.Commit{ .leaseKey = try std.fmt.bufPrint(&token, "{d}", .{id}), .crop = value }, .{});
        defer a.free(bytes);
        return bridge.commit(a, &self.store, self.context(), bytes);
    }
};
test "HX crop ABI strict JSON integer decimal and no caller witness" {
    const good = "{\"leaseKey\":\"9007199254740993\",\"crop\":{\"left\":0,\"top\":0,\"right\":4294967295,\"bottom\":1}}";
    const parsed = try wire.parse(a, good);
    defer parsed.deinit();
    try t.expectEqual(@as(u64, 9007199254740993), try wire.key(a, good));
    for ([_][]const u8{
        "{\"leaseKey\":\"1\",\"crop\":{\"left\":\"0\",\"top\":0,\"right\":1,\"bottom\":1}}",
        "{\"leaseKey\":\"1\",\"crop\":{\"left\":0.0,\"top\":0,\"right\":1,\"bottom\":1}}",
        "{\"leaseKey\":\"1\",\"crop\":{\"left\":0,\"top\":0,\"right\":1,\"bottom\":1},\"witness\":{}}",
    }) |bad| try t.expectError(error.InvalidPictureCropWire, wire.parse(a, bad));
    for ([_][]const u8{ "0", "01", "+1", "18446744073709551616" }) |bad| {
        if (std.mem.eql(u8, bad, "0")) try t.expectError(error.InvalidPictureCropLease, wire.leaseId(bad)) else try t.expectError(error.InvalidFormattingReference, wire.leaseId(bad));
    }
}
test "HX crop ABI capture exact named edges basis and private observation" {
    var h: Harness = undefined;
    try h.init();
    defer h.deinit();
    const bytes = try bridge.capture(a, &h.store, h.context(), 0, try h.node());
    defer a.free(bytes);
    const parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
    defer parsed.deinit();
    const value = parsed.value.object;
    try t.expectEqualStrings("hwpx", value.get("format").?.string);
    const crop = value.get("crop").?.object;
    try t.expectEqual(@as(i64, 0), crop.get("left").?.integer);
    try t.expectEqual(@as(i64, 4800), crop.get("right").?.integer);
    try t.expectEqual(@as(i64, 2400), crop.get("bottom").?.integer);
    try t.expectEqualStrings("absent_75_policy", value.get("bounds").?.object.get("basis").?.string);
    for ([_][]const u8{ "before", "owner", "ticket", "hash", "sourceSha256", "resourceSha256", "session", "view_epoch" }) |key| try t.expect(!value.contains(key));
}
fn emit(name: []const u8, bytes: []const u8) !void {
    var sink = (try @import("../testing/evidence_output.zig").Sink.fromEnviron(a, std.testing.io, std.testing.environ, "HWPJS_CROP_EVIDENCE_DIR")) orelse return;
    defer sink.deinit();
    try sink.writeFile(name, bytes);
}
test "HX crop ABI picture resize real Git fixture apply saved undo redo emit" {
    var expected: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(fixture, &expected, .{});
    try t.expectEqualSlices(u8, &[_]u8{ 0x3b, 0xeb, 0x99, 0x64, 0xf3, 0xa1, 0x94, 0xf9, 0xd5, 0x4e, 0xca, 0xc8, 0xcc, 0xc1, 0x19, 0x49, 0xd1, 0x28, 0x9f, 0xa1, 0x41, 0x48, 0x70, 0x28, 0xf6, 0xd0, 0x70, 0xfd, 0x2b, 0x4e, 0xf2, 0x55 }, &expected);
    var h: Harness = undefined;
    try h.init();
    defer h.deinit();
    const comparable: @import("../hwpx/picture_crop_edit.zig").Rect = .{ .left = 225, .top = 375, .right = 4575, .bottom = 2025 };
    const id = try h.capture();
    try t.expect(try h.request(id, comparable));
    try t.expectEqual(@as(u32, 1), h.history.revision());
    const edited = try h.session.save();
    defer a.free(edited);
    try emit("picture-resize-original.hwpx", fixture);
    try emit("picture-resize-edited.hwpx", edited);
    const manifest = try std.json.Stringify.valueAlloc(a, .{ .base = "00f52d69e3990462c54ebf13db91a40263a166a1", .fixture = "apps/docs/docs/public/editor/fixtures/picture-resize.hwpx", .section = "Contents/section0.xml", .originalCropOffset = @as(u32, 1871), .after = comparable, .oracleEdges = [4]i64{ 225, 4575, 375, 2025 }, .historyRevision = h.history.revision() }, .{});
    defer a.free(manifest);
    try emit("picture-resize-metadata.json", manifest);
    var reopened = try Editor.open(a, edited, .{});
    defer reopened.deinit();
    const saved = try reopened.save();
    defer a.free(saved);
    try t.expectEqualSlices(u8, edited, saved);
    try t.expect(try h.history.undo(&h.session));
    h.generation.invalidate();
    const undone = try h.session.save();
    defer a.free(undone);
    try t.expectEqualSlices(u8, fixture, undone);
    try emit("picture-resize-undo.hwpx", undone);
    try t.expect(try h.history.redo(&h.session));
    h.generation.invalidate();
    const redone = try h.session.save();
    defer a.free(redone);
    try t.expectEqualSlices(u8, edited, redone);
    try emit("picture-resize-redo.hwpx", redone);
}
test "HX crop ABI failed recapture clears prior and close never recycles opaque key" {
    var h: Harness = undefined;
    try h.init();
    defer h.deinit();
    const id = try h.capture();
    try t.expectError(error.InvalidSectionIndex, bridge.capture(a, &h.store, h.context(), 999, 0));
    try t.expectEqual(null, h.store.retained);
    const next = try h.capture();
    try t.expect(next > id);
    h.store.clear(a);
    try t.expectEqual(null, h.store.retained);
    try t.expect((try h.capture()) > next);
}
test "HX crop ABI old release cannot cancel new and matching release is history neutral" {
    var h: Harness = undefined;
    try h.init();
    defer h.deinit();
    const old = try h.capture();
    const next = try h.capture();
    try t.expect(!h.store.release(a, old));
    try t.expectEqual(next, h.store.retained.?.id);
    try t.expect(h.store.release(a, next));
    try t.expectEqual(@as(u32, 0), h.history.revision());
    try t.expectEqual(@as(u64, 0), h.generation.value);
}
test "HX crop ABI matching invalid commit consumes and does not publish" {
    var h: Harness = undefined;
    try h.init();
    defer h.deinit();
    const id = try h.capture();
    var bad = rect;
    bad.right = 4801;
    try t.expectError(error.InvalidPictureCropRectangle, h.request(id, bad));
    try t.expectEqual(null, h.store.retained);
    try t.expectError(error.StalePictureCropLease, h.request(id, rect));
    try t.expectEqual(@as(u32, 0), h.history.revision());
    const saved = try h.session.save();
    defer a.free(saved);
    try t.expectEqualSlices(u8, fixture, saved);
}
test "HX crop ABI no op consumes lease and preserves actual prior redo" {
    var h: Harness = undefined;
    try h.init();
    defer h.deinit();
    try t.expect(try h.request(try h.capture(), rect));
    try t.expect(try h.history.undo(&h.session));
    h.generation.invalidate();
    const id = try h.capture();
    const generation = h.generation.value;
    try t.expect(!try h.request(id, .{ .left = 0, .top = 0, .right = 4800, .bottom = 2400 }));
    try t.expectEqual(generation, h.generation.value);
    try t.expectError(error.StalePictureCropLease, h.request(id, rect));
    try t.expect(try h.history.redo(&h.session));
}
test "HX crop ABI session view epoch and Native history scope each bind" {
    var h: Harness = undefined;
    try h.init();
    defer h.deinit();
    var id = try h.capture();
    h.generation.invalidate();
    try t.expectError(error.StalePictureCropLease, h.request(id, rect));
    id = try h.capture();
    const bytes = try std.fmt.allocPrint(a, "{{\"leaseKey\":\"{d}\",\"crop\":{{\"left\":750,\"top\":375,\"right\":4050,\"bottom\":2025}}}}", .{id});
    defer a.free(bytes);
    var wrong = h.context();
    wrong.instance_epoch = 2;
    try t.expectError(error.StalePictureCropLease, bridge.commit(a, &h.store, wrong, bytes));
    id = try h.capture();
    h.history.deinit();
    h.history = try History.initV2(&h.session, .{});
    // Same bytes, revision and instance are insufficient; actual History scope differs.
    try t.expectError(error.StalePictureCrop, h.request(id, .{ .left = 0, .top = 0, .right = 4800, .bottom = 2400 }));
}
test "HX crop ABI serial overflow clears authority without recycling" {
    var h: Harness = undefined;
    try h.init();
    defer h.deinit();
    _ = try h.capture();
    h.store.serial = std.math.maxInt(u64);
    try t.expectError(error.PictureCropLeaseExhausted, h.capture());
    try t.expectEqual(null, h.store.retained);
}

test "HX crop ABI capture integer domain exact edges plus one no readonly normalization" {
    const Raw = @import("../hwpx/picture_crop_values.zig").Values;
    try wire.qualifyCapture(Raw{ .clip = .{ -2147483648, 4294967295, 0, 1 } });
    for ([_]i64{ -2147483649, 4294967296, std.math.maxInt(i64) }) |value| {
        try t.expectError(error.UnsupportedPictureCropCaptureValue, wire.qualifyCapture(Raw{ .clip = .{ value, 4800, 0, 2400 } }));
    }
}
fn fixtureWithLeft(value: i64) ![]u8 {
    var document = try @import("../hwpx/package.zig").inspectDocument(a, fixture, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    const token = "<hp:imgClip left=\"0\"";
    const offset = std.mem.indexOf(u8, tree.source, token) orelse return error.MissingFixtureCropOwner;
    try t.expectEqual(@as(usize, 1871), offset);
    const replacement = try std.fmt.allocPrint(a, "<hp:imgClip left=\"{d}\"", .{value});
    defer a.free(replacement);
    const edited = try std.mem.concat(a, u8, &.{ tree.source[0..offset], replacement, tree.source[offset + token.len ..] });
    defer a.free(edited);
    const item = document.manifest.items[tree.item_index];
    return @import("../zip/replace_writer.zig").write(a, fixture, &.{.{ .entry_index = item.entry_index.?, .bytes = edited }}, .{});
}
test "HX crop ABI out of domain source retains existing reader refusal and clears capture" {
    const wide: i64 = 4294967296;
    const bytes = try fixtureWithLeft(wide);
    defer a.free(bytes);
    var h: Harness = undefined;
    try h.initBytes(bytes);
    defer h.deinit();
    const node = try h.node();
    try t.expectError(error.InvalidSignedOrUnsigned32, @import("../hwpx/picture_crop_values.zig").read(a, &h.session.sections[0].tree, node));
    try t.expectError(error.InvalidSignedOrUnsigned32, bridge.capture(a, &h.store, h.context(), 0, node));
    try t.expectEqual(null, h.store.retained);
    const saved = try h.session.save();
    defer a.free(saved);
    try t.expectEqualSlices(u8, bytes, saved);
}
