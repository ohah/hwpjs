//! Source-only focused candidates; actual execution requires a coordinated slot.
const std = @import("std");
const t = std.testing;
const a = t.allocator;
const png = @embedFile("hwp5/chart/test_fixtures/create-transport-bars-64.png");
const edit = @import("hwp5/edit/style_preservation.zig");
const H5History = @import("hwp5/edit/history_v2.zig").History;
const H5Request = @import("hwp5/edit/image_create_request.zig").Request;
fn digest(bytes: []const u8) [32]u8 {
    var hash: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &hash, .{});
    return hash;
}
const H5 = struct {
    input: []u8,
    session: *edit.Session,
    expected: []u8,
    fn open() !H5 {
        const input = try @import("new_document/hwp5.zig").create(a);
        errdefer a.free(input);
        const session = try edit.Session.open(a, input);
        errdefer session.close();
        session.enableHistoryDelta();
        const expected = try session.copyText(a, 0, 0);
        return .{ .input = input, .session = session, .expected = expected };
    }
    fn deinit(self: *H5) void {
        self.session.close();
        a.free(self.input);
        a.free(self.expected);
    }
    fn request(self: H5) !H5Request {
        return .{ .target = .{ .section = 0, .binding = try self.session.historyTicket(), .anchor = .{ .host = .{ .original_node = (try self.session.paragraph(0, 0)).source_node.? }, .unit = 16 } }, .expected_text_utf16le = self.expected, .box = .{ .width = 7200, .height = 3600 }, .image = png };
    }
};
fn checkH5(bytes: []const u8) !void {
    var source = try @import("hwp5/text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const sites = try @import("hwp5/edit/picture_sources.zig").read(a, raw, source.header.version(), .with_instance78);
    defer a.free(sites);
    try t.expectEqual(@as(usize, 1), sites.len);
    const fresh = try edit.Session.open(a, bytes);
    defer fresh.close();
    const binary = try fresh.binaryResource(a, sites[0].bin_data_id, 1048576);
    defer a.free(binary);
    try t.expectEqualSlices(u8, png, binary);
    const report = try fresh.hwp5ChartCandidatesWithLayout(a, .spec24);
    defer a.free(report);
    try t.expectEqual(@as(usize, 0), report.len);
}
test "live image H5 own blank PNG actual save reopen and undo redo byte identity with default guard" {
    var f = try H5.open();
    defer f.deinit();
    const history = try H5History.create(a, f.session, .{});
    defer history.deinit();
    try t.expect(try history.applyBatch(f.session, &.{.{ .insert_image = try f.request() }}));
    try t.expectError(error.LayoutReflowRequired, f.session.save(a, .{}));
    // Explicit test serialization only; product default remains strict.
    const saved = try f.session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try checkH5(saved.bytes);
    try t.expect(try history.undo(f.session));
    const undone = try f.session.save(a, .{});
    defer a.free(undone.bytes);
    try t.expectEqualSlices(u8, f.input, undone.bytes);
    try t.expect(try history.redo(f.session));
    const redone = try f.session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try t.expectEqualSlices(u8, saved.bytes, redone.bytes);
    try checkH5(redone.bytes);
}
test "live image H5 rejected image preserves prior redo source and resources" {
    var f = try H5.open();
    defer f.deinit();
    const history = try H5History.create(a, f.session, .{});
    defer history.deinit();
    try t.expect(try history.applyBatch(f.session, &.{.{ .insert_image = try f.request() }}));
    const saved = try f.session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try t.expect(try history.undo(f.session));
    var bad = try f.request();
    bad.image = "not an image";
    try t.expectError(error.UnsupportedReplacementImageFormat, history.applyBatch(f.session, &.{.{ .insert_image = bad }}));
    const unchanged = try f.session.save(a, .{});
    defer a.free(unchanged.bytes);
    try t.expectEqualSlices(u8, f.input, unchanged.bytes);
    try t.expect(try history.redo(f.session));
    const redone = try f.session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try t.expectEqualSlices(u8, saved.bytes, redone.bytes);
}
test "live image H5 stale witness and structural prefix refuse atomically" {
    var f = try H5.open();
    defer f.deinit();
    const history = try H5History.create(a, f.session, .{});
    defer history.deinit();
    var bad = try f.request();
    bad.expected_text_utf16le = &.{ 13, 0 };
    try t.expectError(error.SourceBindingMismatch, history.applyBatch(f.session, &.{.{ .insert_image = bad }}));
    bad = try f.request();
    bad.target.anchor.unit = 1;
    try t.expectError(error.SplitControlToken, history.applyBatch(f.session, &.{.{ .insert_image = bad }}));
    const unchanged = try f.session.save(a, .{});
    defer a.free(unchanged.bytes);
    try t.expectEqualSlices(u8, f.input, unchanged.bytes);
}
test "live image H5 chart and picture resource candidates retain separate type ids and payloads" {
    var f = try H5.open();
    defer f.deinit();
    var source = try @import("hwp5/text_source.zig").Source.open(a, f.input);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, 1048576);
    defer a.free(info);
    const cf = @import("hwp5/chart/create_test_fixture.zig");
    const xml = try @import("hwpx/chart_create_xml.zig").create(a, cf.data);
    defer a.free(xml);
    const chart: @import("hwp5/chart/create_request.zig").Request = .{ .target = (try f.request()).target, .expected_text_utf16le = f.expected, .box = .{ .width = 12000, .height = 12000 }, .data = cf.data, .rendered = .{ .source_xml_sha256 = digest(xml), .pixel_width = 64, .pixel_height = 64, .bytes = png }, .profile = .spec24_registered_png_presentation_v1 };
    const charts = @import("hwp5/chart/create_single_asset.zig");
    const images = @import("hwp5/edit/image_create_asset.zig");
    var first = try charts.prepare(a, &source.file, .{}, info, source.header.version(), chart, 16 * 1024 * 1024);
    defer first.deinit(a);
    var second = try images.prepare(a, &source.file, first.values, first.values.docinfo.?, source.header.version(), try f.request(), 16 * 1024 * 1024);
    defer second.deinit(a);
    try t.expectEqual(@as(usize, 2), second.values.entries.len);
    try t.expectEqualSlices(u8, first.values.entries[0].bytes, second.values.entries[0].bytes);
    try t.expectEqualSlices(u8, png, second.values.entries[1].bytes);
    try t.expect(first.values.entries[0].physical != second.values.entries[1].physical);
    try t.expect(first.ordinal != second.ordinal);
    try t.expect(std.mem.endsWith(u8, second.values.entries[1].path, ".png"));
    var reverse = try images.prepare(a, &source.file, .{}, info, source.header.version(), try f.request(), 16 * 1024 * 1024);
    defer reverse.deinit(a);
    var last = try charts.prepare(a, &source.file, reverse.values, reverse.values.docinfo.?, source.header.version(), chart, 16 * 1024 * 1024);
    defer last.deinit(a);
    try t.expectEqualSlices(u8, png, last.values.entries[0].bytes);
    try t.expect(last.values.entries[0].physical != last.values.entries[1].physical);
}
const HXEditor = @import("hwpx/editor_session.zig");
const HXHistory = @import("hwpx/editor_history.zig").History;
const HXRequest = @import("hwpx/image_insert.zig").Request;
fn hxRequest(s: *HXEditor.Session, h: *HXHistory, image: []const u8) !HXRequest {
    const before = try s.save();
    defer a.free(before);
    const binding: @import("hwpx/inline_object_placement.zig").Binding = .{ .session = "s1", .revision = h.revision(), .serial = "1" };
    const observation = try @import("hwpx/inline_object_placement.zig").current(s, .{ .section = 0, .paragraph = 1 }, binding);
    // The caller owns expected_text until apply; Native-issued binding carries no text allocation.
    return .{ .expected_source_sha256 = digest(before), .target = .{ .section = 0, .paragraph = 1, .owner = observation.owner, .unit = @intCast(try std.unicode.calcUtf16LeLen(observation.text)), .expected_text = observation.text }, .width = 7200, .height = 3600, .image = image };
}
fn hxApply(h: *HXHistory, s: *HXEditor.Session, r: *const HXRequest) !bool {
    return h.apply(s, .{ .kind = .image_insert, .section = 0, .paragraph = 1, .start = r.target.unit, .deleted = 0, .inserted = "", .image_insert = r });
}
fn checkHx(bytes: []const u8) !void {
    var package = try @import("hwpx/package.zig").inspectDocument(a, bytes, .{});
    defer package.deinit(a);
    var tree = try package.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    var report = try @import("hwpx/picture_image_links.zig").inspectSections(a, package.manifest, &.{tree}, .{});
    defer report.deinit(a);
    try t.expectEqual(@as(usize, 1), report.sites.len);
    try t.expectEqual(@as(usize, 1), report.count(.embedded));
    const entry = package.archive.find("BinData/hwpjs-insertion-0.png") orelse return error.MissingInsertedImage;
    const raw = try package.archive.decode(entry, 8 * 1024 * 1024);
    defer a.free(raw);
    try t.expectEqualSlices(u8, png, raw);
}
test "live image HX empty native anchor PNG save reopen undo redo preserves source exact" {
    const input = try @import("new_document/hwpx.zig").create(a);
    defer a.free(input);
    var s = try HXEditor.open(a, input, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try HXHistory.initV2(&s, .{});
    defer h.deinit();
    const before = try s.save();
    defer a.free(before);
    const r = try hxRequest(&s, &h, png);
    defer a.free(r.target.expected_text);
    try t.expect(try hxApply(&h, &s, &r));
    const saved = try s.save();
    defer a.free(saved);
    try checkHx(saved);
    var fresh = try HXEditor.open(a, saved, .{});
    defer fresh.deinit();
    try t.expect(try h.undo(&s));
    const undone = try s.save();
    defer a.free(undone);
    try t.expectEqualSlices(u8, before, undone);
    try t.expect(try h.redo(&s));
    const redone = try s.save();
    defer a.free(redone);
    try t.expectEqualSlices(u8, saved, redone);
    try checkHx(redone);
}
test "live image HX stale source refusal preserves prior redo and history revision" {
    const input = try @import("new_document/hwpx.zig").create(a);
    defer a.free(input);
    var s = try HXEditor.open(a, input, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try HXHistory.initV2(&s, .{});
    defer h.deinit();
    const r = try hxRequest(&s, &h, png);
    defer a.free(r.target.expected_text);
    try t.expect(try hxApply(&h, &s, &r));
    const saved = try s.save();
    defer a.free(saved);
    try t.expect(try h.undo(&s));
    var bad = try hxRequest(&s, &h, png);
    defer a.free(bad.target.expected_text);
    bad.expected_source_sha256[0] ^= 1;
    const revision = h.revision();
    try t.expectError(error.SourceHashMismatch, hxApply(&h, &s, &bad));
    try t.expectEqual(revision, h.revision());
    try t.expect(try h.redo(&s));
    const redone = try s.save();
    defer a.free(redone);
    try t.expectEqualSlices(u8, saved, redone);
}
test "live image strict wire rejects unknown metadata floating units and empty image" {
    const parse = @import("wasm/live_image_insert_wire.zig").parse;
    try t.expectError(error.InvalidImageInsertRequest, parse(a, "{\"start\":1.0,\"width\":1,\"height\":1}"));
    try t.expectError(error.InvalidImageInsertRequest, parse(a, "{\"start\":1,\"width\":1,\"height\":1,\"allow_stale_layout\":true}"));
    try t.expectError(error.InvalidPictureInsertionSize, parse(a, "{\"start\":1,\"width\":0,\"height\":1}"));
}
test "live image PNG corruption refuses before Session resource publication" {
    var corrupt = try a.dupe(u8, png);
    defer a.free(corrupt);
    corrupt[29] ^= 1;
    try t.expectError(error.InvalidChecksum, @import("image/picture_input.zig").inspectImage(corrupt, 8 * 1024 * 1024));
}
