//! Native entrypoints prepared only. Test raster proves transport, not painter fidelity.
const std = @import("std");
const a = std.testing.allocator;
const edit = @import("../edit/style_preservation.zig");
const History = @import("../edit/history_v2.zig").History;
const Request = @import("create_request.zig").Request;
const data = @import("create_test_fixture.zig").data;
const png = @embedFile("test_fixtures/create-transport-bars-64.png");
const Fixture = struct {
    input: []u8,
    expected: []u8,
    session: *edit.Session,
    fn open() !Fixture {
        const input = try @import("../../new_document/hwp5.zig").create(a);
        errdefer a.free(input);
        var source = try @import("../text_source.zig").Source.open(a, input);
        defer source.deinit();
        const raw = try source.decodeSection(a, 0);
        defer a.free(raw);
        var doc = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
        defer doc.deinit(a);
        const expected = try @import("../edit/plain_text_content.zig").textBytes(a, doc.sections[0].paragraphs[0]);
        errdefer a.free(expected);
        const session = try edit.Session.open(a, input);
        session.enableHistoryDelta();
        return .{ .input = input, .expected = expected, .session = session };
    }
    fn deinit(self: *Fixture) void {
        self.session.close();
        a.free(self.expected);
        a.free(self.input);
    }
    fn request(self: Fixture) !Request {
        const xml = try @import("../../hwpx/chart_create_xml.zig").create(a, data);
        defer a.free(xml);
        var digest: [32]u8 = undefined;
        std.crypto.hash.sha2.Sha256.hash(xml, &digest, .{});
        return .{
            .target = .{ .section = 0, .binding = try self.session.historyTicket(), .anchor = .{ .host = .{ .original_node = (try self.session.paragraph(0, 0)).source_node.? }, .unit = 16 } },
            .expected_text_utf16le = self.expected,
            .box = .{ .width = 12000, .height = 12000 },
            .data = data,
            .rendered = .{ .source_xml_sha256 = digest, .pixel_width = 64, .pixel_height = 64, .bytes = png },
            .profile = .spec24_registered_png_presentation_v1,
        };
    }
};
fn checkChart(session: *edit.Session) !void {
    const rows = try session.hwp5ChartCandidatesWithLayout(a, .spec24);
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 1), rows.len);
    try std.testing.expectEqual(@import("candidate_snapshot.zig").State.modern_chart, rows[0].resource.state);
    try std.testing.expectEqual(@as(?usize, 1), rows[0].resource.presentation_streams);
    var display = try session.hwp5ChartDisplayWithLayout(a, rows[0].section, rows[0].owner.control_node, .spec24);
    defer display.deinit(a);
    var found: usize = 0;
    for (display.values.points.points) |point| {
        for ([_][]const u8{ "10", "20", "30" }) |literal| if (std.mem.eql(u8, point.value, literal)) {
            found += 1;
        };
    }
    try std.testing.expectEqual(@as(usize, 3), found);
    const resource = try session.binaryResource(a, rows[0].owner.ordinal, 1048576);
    defer a.free(resource);
    var ole = try @import("../../ole/container.zig").open(a, resource, .observed_size_prefix, .{ .strict = true });
    defer ole.deinit();
    const p = try ole.findExact("/\x02OlePres000") orelse return error.MissingChartPresentation;
    try @import("create_png_presentation.zig").verify(ole.entries[p].content, png, 64, 64);
    try std.testing.expectEqual(@as(?usize, null), try ole.findExact("/Contents"));
}
test "H5 chart integrated Native explicit creation file write fresh reopen and managed undo redo exact bytes" {
    var fixture = try Fixture.open();
    defer fixture.deinit();
    const history = try History.create(a, fixture.session, .{});
    defer history.deinit();
    try std.testing.expect(try history.applyBatch(fixture.session, &.{.{ .insert_chart = try fixture.request() }}));
    try checkChart(fixture.session);
    const saved = try fixture.session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    var tmp = std.testing.tmpDir(.{});
    defer tmp.cleanup();
    try tmp.dir.writeFile(std.testing.io, .{ .sub_path = "created-chart.hwp", .data = saved.bytes });
    const disk = try tmp.dir.readFileAlloc(std.testing.io, "created-chart.hwp", a, .limited(64 * 1024 * 1024));
    defer a.free(disk);
    try std.testing.expectEqualSlices(u8, saved.bytes, disk);
    const fresh = try edit.Session.open(a, disk);
    defer fresh.close();
    try checkChart(fresh);
    try std.testing.expect(try history.undo(fixture.session));
    const undone = try fixture.session.save(a, .{});
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, fixture.input, undone.bytes);
    try std.testing.expect(try history.redo(fixture.session));
    const redone = try fixture.session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    try checkChart(fixture.session);
}
fn rejectKeepsRedo(comptime expected_text: bool) !void {
    var fixture = try Fixture.open();
    defer fixture.deinit();
    const history = try History.create(a, fixture.session, .{});
    defer history.deinit();
    try std.testing.expect(try history.applyBatch(fixture.session, &.{.{ .insert_chart = try fixture.request() }}));
    const saved = try fixture.session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try std.testing.expect(try history.undo(fixture.session));
    const before = try fixture.session.save(a, .{});
    defer a.free(before.bytes);
    var bad = try fixture.request();
    const changed = try a.dupe(u8, fixture.expected);
    defer a.free(changed);
    if (expected_text) {
        changed[0] ^= 1;
        bad.expected_text_utf16le = changed;
    } else bad.rendered.source_xml_sha256[0] ^= 1;
    try std.testing.expectError(if (expected_text) error.SourceBindingMismatch else error.StaleChartCreatePreview, history.applyBatch(fixture.session, &.{.{ .insert_chart = bad }}));
    const refused = try fixture.session.save(a, .{});
    defer a.free(refused.bytes);
    try std.testing.expectEqualSlices(u8, before.bytes, refused.bytes);
    try std.testing.expect(try history.redo(fixture.session));
    const redone = try fixture.session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    try checkChart(fixture.session);
}
test "H5 chart integrated Native stale painter payload refusal preserves valid prior redo and full saved bytes" {
    try rejectKeepsRedo(false);
}
test "H5 chart integrated Native stale source text refusal preserves valid prior redo and full saved bytes" {
    try rejectKeepsRedo(true);
}
test "H5 chart integrated Native single ordinal exact final slot and overflow refuse" {
    try std.testing.expectEqual(@as(u16, 65535), try @import("create_single_ids.zig").nextOrdinal(65534));
    try std.testing.expectError(error.LimitExceeded, @import("create_single_ids.zig").nextOrdinal(65535));
    try std.testing.expectError(error.LimitExceeded, @import("create_single_ids.zig").nextOrdinal(std.math.maxInt(usize)));
}

test "H5 chart integrated Native detached single resource exact retained cap plus one and input preservation" {
    var fixture = try Fixture.open();
    defer fixture.deinit();
    var source = try @import("../text_source.zig").Source.open(a, fixture.input);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, 1048576);
    defer a.free(info);
    const before = try a.dupe(u8, info);
    defer a.free(before);
    const request = try fixture.request();
    const single = @import("create_single_asset.zig");
    var baseline = try single.prepare(a, &source.file, .{}, info, source.header.version(), request, 1048576);
    defer baseline.deinit(a);
    const exact = try baseline.values.byteSize(1048576);
    var accepted = try single.prepare(a, &source.file, .{}, info, source.header.version(), request, exact);
    defer accepted.deinit(a);
    try std.testing.expect(baseline.values.equals(accepted.values));
    try std.testing.expectError(error.LimitExceeded, single.prepare(a, &source.file, .{}, info, source.header.version(), request, exact - 1));
    try std.testing.expectEqualSlices(u8, before, info);
    try std.testing.expectEqual(@as(usize, 1), baseline.values.entries.len);
}
