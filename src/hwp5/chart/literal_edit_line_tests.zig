//! Own source-only cohort. PNG is transport evidence, never browser painter proof.
const std = @import("std");
const a = std.testing.allocator;
const Session = @import("../edit/style_preservation.zig").Session;
const History = @import("../edit/history_v2.zig").History;
const types = @import("literal_edit_request.zig");
const wire = @import("../../wasm/hwp5_chart_literal_edit_wire.zig");
const profile = @import("literal_edit_profile.zig");
const line = profile.Profile.spec24_standard_line_literals_v1;
const data = @import("create_test_fixture.zig").data;
const png = @embedFile("test_fixtures/create-own-lines-64.png");
const changes: []const types.Edit = &.{
    .{ .value = .{ .series = 0, .category = 0, .expected = "10", .value = "-99" } },
    .{ .category = .{ .category = 1, .expected = "Two", .value = "둘 & <새>" } },
};
fn digest(bytes: []const u8) [32]u8 {
    var out: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &out, .{});
    return out;
}
fn authored() ![]u8 {
    return @import("create_profile.zig").create(a, data, profile.createProfile(line));
}
fn fixture() !*Session {
    const blank = try @import("../../new_document/hwp5.zig").create(a);
    defer a.free(blank);
    const s = try Session.open(a, blank);
    errdefer s.close();
    s.enableHistoryDelta();
    const reference = try s.currentSourceParagraphReference(0, 0);
    const text = try s.copyCurrentParagraphTextUtf16(a, 0, reference);
    defer a.free(text);
    const xml = try authored();
    defer a.free(xml);
    try s.apply(.{ .insert_chart = .{
        .target = .{ .section = 0, .binding = try s.historyTicket(), .anchor = .{ .host = reference.source.host, .unit = 16 } },
        .expected_text_utf16le = text,
        .box = .{ .width = 20000, .height = 12000 },
        .data = data,
        .profile = profile.createProfile(line),
        .rendered = .{ .source_xml_sha256 = digest(xml), .pixel_width = 64, .pixel_height = 64, .bytes = png },
    } });
    return s;
}
fn lease(s: *Session) !@import("literal_edit_lease.zig").Lease {
    const rows = try s.hwp5ChartCandidates(a);
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 1), rows.len);
    return s.hwp5ChartLiteralEditLease(a, rows[0].section, rows[0].owner.control_node);
}
fn saved(s: *Session) ![]u8 {
    // Explicit test option for edited H5 only; default save policy is unchanged.
    return (try s.save(a, .{ .allow_stale_layout = true })).bytes;
}
fn plan(l: *const @import("literal_edit_lease.zig").Lease, edits: []const types.Edit) types.Plan {
    return .{ .profile = l.context.patch.profile, .binding = l.binding, .owners = @as([*]const types.Target, @ptrCast(&l.target))[0..1], .source_xml_sha256 = l.source_xml_sha256, .edits = edits };
}
fn request(s: *Session, p: types.Plan) !types.Request {
    const bytes = try s.hwp5ChartLiteralEditPreview(a, p);
    defer a.free(bytes);
    const parsed = try std.json.parseFromSlice(struct { profile: profile.Profile, changed: bool, xml_sha256: [32]u8 }, a, bytes, .{ .ignore_unknown_fields = true });
    defer parsed.deinit();
    try std.testing.expectEqual(line, parsed.value.profile);
    return .{ .plan = p, .rendered = if (!parsed.value.changed) null else .{ .source_xml_sha256 = parsed.value.xml_sha256, .pixel_width = 64, .pixel_height = 64, .bytes = png } };
}
fn replaceOnce(source: []const u8, needle: []const u8, value: []const u8) ![]u8 {
    const at = std.mem.indexOf(u8, source, needle) orelse return error.MissingTestNeedle;
    return std.mem.concat(a, u8, &.{ source[0..at], value, source[at + needle.len ..] });
}
test "H5 chart literal edit line typed standard serializer keeps bar exact witness and line leaf spans" {
    const xml = try authored();
    defer a.free(xml);
    var p = try @import("literal_edit_xml.zig").prepare(a, xml, digest(xml), changes, 1048576);
    defer p.deinit(a);
    try std.testing.expectEqual(line, p.profile);
    try std.testing.expect(p.changed);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, p.xml, "<c:lineChart>"));
    try std.testing.expectEqual(@as(usize, 0), std.mem.count(u8, p.xml, "<c:barChart>"));
    try std.testing.expect(std.mem.indexOf(u8, p.xml, "<c:grouping val=\"standard\"/>") != null);
    try std.testing.expectEqualStrings("둘 & <새>", p.data.data.categories[1]);
    try std.testing.expectEqualStrings("-99", p.data.data.series[0].values[0]);
    const legacy = try @import("../../hwpx/chart_create_xml.zig").create(a, data);
    defer a.free(legacy);
    var bar = try @import("literal_edit_xml.zig").prepare(a, legacy, digest(legacy), &.{}, 1048576);
    defer bar.deinit(a);
    try std.testing.expectEqual(profile.Profile.spec24_clustered_column_literals_v1, bar.profile);
    try std.testing.expectEqualSlices(u8, legacy, bar.xml);
}
test "H5 chart literal edit line refuses stacked style marker mixed plots and external workbook" {
    const xml = try authored();
    defer a.free(xml);
    const bad_values = [_][]const u8{
        "<c:grouping val=\"stacked\"/>",
        "<c:grouping val=\"standard\"/><c:marker val=\"1\"/>",
        "<c:grouping val=\"standard\"/><c:spPr/>",
    };
    for (bad_values) |value| {
        const bad = try replaceOnce(xml, "<c:grouping val=\"standard\"/>", value);
        defer a.free(bad);
        try std.testing.expectError(error.UnsupportedChartLiteralEditProfile, @import("literal_edit_xml.zig").prepare(a, bad, digest(bad), changes, 1048576));
    }
    const mixed = try replaceOnce(xml, "</c:plotArea>", "<c:barChart/></c:plotArea>");
    defer a.free(mixed);
    try std.testing.expectError(error.UnsupportedChartLiteralEditProfile, @import("literal_edit_xml.zig").prepare(a, mixed, digest(mixed), changes, 1048576));
    const external = try replaceOnce(xml, "</c:chartSpace>", "<c:externalData/></c:chartSpace>");
    defer a.free(external);
    try std.testing.expectError(error.UnsupportedChartLiteralEditProfile, @import("literal_edit_xml.zig").prepare(a, external, digest(external), changes, 1048576));
}
test "H5 chart literal edit line lease carries actual profile while wire schema stays one" {
    const s = try fixture();
    defer s.close();
    var l = try lease(s);
    defer l.deinit(a);
    try std.testing.expectEqual(line, l.context.patch.profile);
    const bytes = try wire.lease(a, &l, 9007199254740993, 7);
    defer a.free(bytes);
    const parsed = try std.json.parseFromSlice(struct { schemaVersion: u32, witness: wire.Witness }, a, bytes, .{ .ignore_unknown_fields = true });
    defer parsed.deinit();
    try std.testing.expectEqual(@as(u32, 1), parsed.value.schemaVersion);
    try std.testing.expectEqual(line, parsed.value.witness.profile);
    try std.testing.expectEqual(@as(u32, 3), profile.capability_version);
    try wire.validateFence(parsed.value.witness, l.binding, 9007199254740993, 7);
    const request_bytes = try std.json.Stringify.valueAlloc(a, wire.Preview{ .schemaVersion = 1, .witness = parsed.value.witness, .edits = changes }, .{});
    defer a.free(request_bytes);
    var decoded = try wire.parse(wire.Preview, a, request_bytes);
    defer decoded.deinit();
    try std.testing.expectEqual(line, decoded.value.witness.plan(decoded.value.edits).profile);
}
test "H5 chart literal edit line one History save raw reopen undo redo resource preservation" {
    const s = try fixture();
    defer s.close();
    const history = try History.create(a, s, .{});
    defer history.deinit();
    const before = try saved(s);
    defer a.free(before);
    var l = try lease(s);
    defer l.deinit(a);
    const req = try request(s, plan(&l, changes));
    try std.testing.expect(try history.applyBatch(s, &.{.{ .edit_chart_literals = req }}));
    const after = try saved(s);
    defer a.free(after);
    var tmp = std.testing.tmpDir(.{});
    defer tmp.cleanup();
    try tmp.dir.writeFile(std.testing.io, .{ .sub_path = "line-edited.hwp", .data = after });
    const disk = try tmp.dir.readFileAlloc(std.testing.io, "line-edited.hwp", a, .limited(64 * 1024 * 1024));
    defer a.free(disk);
    try std.testing.expectEqualSlices(u8, after, disk);
    const fresh = try Session.open(a, disk);
    defer fresh.close();
    fresh.enableHistoryDelta();
    var reopened = try lease(fresh);
    defer reopened.deinit(a);
    try std.testing.expectEqual(line, reopened.context.patch.profile);
    try std.testing.expectEqualStrings("-99", reopened.context.patch.data.data.series[0].values[0]);
    try std.testing.expectEqualStrings("둘 & <새>", reopened.context.patch.data.data.categories[1]);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, reopened.context.input.xml(), "<c:lineChart>"));
    try std.testing.expectEqual(@as(usize, 0), std.mem.count(u8, reopened.context.input.xml(), "<c:barChart>"));
    const old_resource = try fresh.binaryResource(a, l.target.owner.ordinal, 1048576);
    defer a.free(old_resource);
    try std.testing.expectEqualSlices(u8, l.context.input.file.bytes, old_resource[4..]);
    const presentation = reopened.context.input.file.entries[reopened.context.input.presentation_entry].content;
    try std.testing.expectEqualSlices(u8, png, presentation[40..]);
    try std.testing.expectEqual(l.target.owner.geometry.width, reopened.target.owner.geometry.width);
    try std.testing.expectEqual(l.target.owner.geometry.height, reopened.target.owner.geometry.height);
    try std.testing.expect(try history.undo(s));
    const undo = try saved(s);
    defer a.free(undo);
    try std.testing.expectEqualSlices(u8, before, undo);
    try std.testing.expectError(error.StaleMutationEpoch, history.applyBatch(s, &.{.{ .edit_chart_literals = req }}));
    try std.testing.expect(try history.redo(s));
    const redo = try saved(s);
    defer a.free(redo);
    try std.testing.expectEqualSlices(u8, after, redo);
}
test "H5 chart literal edit line profile mismatch refuses before publication and no-op preserves bytes" {
    const s = try fixture();
    defer s.close();
    var l = try lease(s);
    defer l.deinit(a);
    const before = try saved(s);
    defer a.free(before);
    const ticket = try s.historyTicket();
    var wrong = plan(&l, changes);
    wrong.profile = .spec24_clustered_column_literals_v1;
    try std.testing.expectError(error.UnsupportedChartLiteralEditProfile, s.hwp5ChartLiteralEditPreview(a, wrong));
    const same: []const types.Edit = &.{.{ .value = .{ .series = 0, .category = 0, .expected = "10", .value = "10" } }};
    try s.apply(.{ .edit_chart_literals = try request(s, plan(&l, same)) });
    const after = try saved(s);
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqualDeep(ticket, try s.historyTicket());
}
