//! Own source-only cohort. PNG is transport evidence, never browser painter proof.
const std = @import("std");
const a = std.testing.allocator;
const Session = @import("../edit/style_preservation.zig").Session;
const History = @import("../edit/history_v2.zig").History;
const types = @import("literal_edit_request.zig");
const wire = @import("../../wasm/hwp5_chart_literal_edit_wire.zig");
const profile = @import("literal_edit_profile.zig");
const pie = profile.Profile.spec24_standard_pie_literals_v1;
const data = @import("create_test_fixture.zig").data;
const png = @embedFile("test_fixtures/create-own-lines-64.png");
const changes: []const types.Edit = &.{
    .{ .value = .{ .series = 0, .category = 0, .expected = "10", .value = "99" } },
    .{ .category = .{ .category = 1, .expected = "Two", .value = "둘 & <새>" } },
};
fn digest(bytes: []const u8) [32]u8 {
    var out: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &out, .{});
    return out;
}
fn authored() ![]u8 {
    return @import("create_profile.zig").create(a, data, profile.createProfile(pie));
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
        .profile = profile.createProfile(pie),
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
fn request(s: *Session, p: types.Plan, l: *const @import("literal_edit_lease.zig").Lease) !types.Request {
    const bytes = try s.hwp5ChartLiteralEditPreview(a, p);
    defer a.free(bytes);
    const parsed = try std.json.parseFromSlice(struct { profile: profile.Profile, changed: bool, xml_sha256: [32]u8 }, a, bytes, .{ .ignore_unknown_fields = true });
    defer parsed.deinit();
    try std.testing.expectEqual(pie, parsed.value.profile);
    return .{ .plan = p, .rendered = if (!parsed.value.changed) null else .{ .source_xml_sha256 = parsed.value.xml_sha256, .pixel_width = l.context.input.width, .pixel_height = l.context.input.height, .bytes = l.context.input.file.entries[l.context.input.presentation_entry].content[40..] } };
}
fn replaceOnce(source: []const u8, needle: []const u8, value: []const u8) ![]u8 {
    const at = std.mem.indexOf(u8, source, needle) orelse return error.MissingTestNeedle;
    return std.mem.concat(a, u8, &.{ source[0..at], value, source[at + needle.len ..] });
}

test "H5 chart literal edit pie canonical spans and old profiles remain exact" {
    const xml = try authored();
    defer a.free(xml);
    var p = try @import("literal_edit_xml.zig").prepare(a, xml, digest(xml), changes, 1048576);
    defer p.deinit(a);
    try std.testing.expectEqual(pie, p.profile);
    try std.testing.expectEqualStrings("99", p.data.data.series[0].values[0]);
    try std.testing.expectEqualStrings("둘 & <새>", p.data.data.categories[1]);
    for ([_]profile.Profile{ .spec24_clustered_column_literals_v1, .spec24_standard_line_literals_v1, .spec24_clustered_horizontal_bar_literals_v1 }) |prior| {
        const source = try @import("create_profile.zig").create(a, data, profile.createProfile(prior));
        defer a.free(source);
        var old = try @import("literal_edit_xml.zig").prepare(a, source, digest(source), &.{}, 1048576);
        defer old.deinit(a);
        try std.testing.expectEqual(prior, old.profile);
        try std.testing.expectEqualSlices(u8, source, old.xml);
    }
}
test "H5 chart literal edit pie domain rejects before history and retains prior redo" {
    const s = try fixture();
    defer s.close();
    const history = try History.create(a, s, .{});
    defer history.deinit();
    var l = try lease(s);
    defer l.deinit(a);
    try std.testing.expect(try history.applyBatch(s, &.{.{ .edit_chart_literals = try request(s, plan(&l, changes), &l) }}));
    try std.testing.expect(try history.undo(s));
    var current = try lease(s);
    defer current.deinit(a);
    const before = try saved(s);
    defer a.free(before);
    const ticket = try s.historyTicket();
    for ([_]struct { value: []const u8, err: anyerror }{
        .{ .value = "-1", .err = error.InvalidChartNumericValue },
        .{ .value = "-1e-5000", .err = error.InvalidChartNumericValue },
        .{ .value = "1e-5000", .err = error.UnrepresentablePieShare },
        .{ .value = "1e-320", .err = error.UnrepresentablePieShare },
    }) |bad| {
        const edits: []const types.Edit = &.{.{ .value = .{ .series = 0, .category = 0, .expected = "10", .value = bad.value } }};
        const p = plan(&current, edits);
        try std.testing.expectError(bad.err, s.hwp5ChartLiteralEditPreview(a, p));
        try std.testing.expectError(bad.err, history.applyBatch(s, &.{.{ .edit_chart_literals = .{ .plan = p, .rendered = null } }}));
        const after = try saved(s);
        defer a.free(after);
        try std.testing.expectEqualSlices(u8, before, after);
        try std.testing.expectEqualDeep(ticket, try s.historyTicket());
    }
    try std.testing.expect(try history.redo(s));
}
test "H5 chart literal edit pie all zero NaN and noncanonical styles reject" {
    const xml = try authored();
    defer a.free(xml);
    const zero: []const types.Edit = &.{
        .{ .value = .{ .series = 0, .category = 0, .expected = "10", .value = "0" } },
        .{ .value = .{ .series = 0, .category = 1, .expected = "20", .value = "0" } },
        .{ .value = .{ .series = 0, .category = 2, .expected = "30", .value = "0" } },
    };
    try std.testing.expectError(error.EmptyPieMagnitude, @import("literal_edit_xml.zig").prepare(a, xml, digest(xml), zero, 1048576));
    const nan: []const types.Edit = &.{.{ .value = .{ .series = 0, .category = 0, .expected = "10", .value = "NaN" } }};
    try std.testing.expectError(error.InvalidChartNumericValue, @import("literal_edit_xml.zig").prepare(a, xml, digest(xml), nan, 1048576));
    const bad = try replaceOnce(xml, "<c:firstSliceAng val=\"0\"/>", "<c:firstSliceAng val=\"30\"/>");
    defer a.free(bad);
    try std.testing.expectError(error.UnsupportedChartLiteralEditProfile, @import("literal_edit_xml.zig").prepare(a, bad, digest(bad), changes, 1048576));
}
test "H5 chart literal edit pie lease schema remains one capability four" {
    const s = try fixture();
    defer s.close();
    var l = try lease(s);
    defer l.deinit(a);
    const bytes = try wire.lease(a, &l, 9007199254740993, 7);
    defer a.free(bytes);
    const parsed = try std.json.parseFromSlice(struct { schemaVersion: u32, witness: wire.Witness }, a, bytes, .{ .ignore_unknown_fields = true });
    defer parsed.deinit();
    try std.testing.expectEqual(@as(u32, 1), parsed.value.schemaVersion);
    try std.testing.expectEqual(pie, parsed.value.witness.profile);
    try std.testing.expectEqual(@as(u32, 4), profile.capability_version);
    try wire.validateFence(parsed.value.witness, l.binding, 9007199254740993, 7);
}
test "H5 chart literal edit pie actual f0419e COW save reopen undo redo" {
    const raw = @embedFile("test_fixtures/own-pie-catalog135.hwp");
    const actual_digest = digest(raw);
    try std.testing.expectEqualSlices(u8, &.{ 0xf0, 0x41, 0x9e, 0x00, 0x55, 0x2b, 0x52, 0x1c, 0x72, 0x18, 0x80, 0x64, 0x82, 0x0d, 0xdf, 0x5a, 0x0b, 0x26, 0x8a, 0x37, 0xe5, 0xcc, 0x24, 0xa1, 0x8c, 0x8d, 0xfd, 0x51, 0x0f, 0x46, 0x19, 0xfd }, &actual_digest);
    const s = try Session.open(a, raw);
    defer s.close();
    s.enableHistoryDelta();
    const history = try History.create(a, s, .{});
    defer history.deinit();
    var l = try lease(s);
    defer l.deinit(a);
    try std.testing.expectEqual(pie, l.context.patch.profile);
    try std.testing.expectEqual(@as(usize, 1), l.context.patch.data.data.series.len);
    try std.testing.expectEqual(@as(usize, 3), l.context.patch.data.data.categories.len);
    try std.testing.expectEqual(@as(usize, 3), l.context.patch.data.data.series[0].values.len);
    for ([_][]const u8{ "가", "나", "다" }, l.context.patch.data.data.categories) |expected, actual| try std.testing.expectEqualStrings(expected, actual);
    for ([_][]const u8{ "1", "2", "3" }, l.context.patch.data.data.series[0].values) |expected, actual| try std.testing.expectEqualStrings(expected, actual);
    const edits: []const types.Edit = &.{ .{ .value = .{ .series = 0, .category = 2, .expected = "3", .value = "7.00" } }, .{ .category = .{ .category = 1, .expected = "나", .value = "새 범주" } } };
    const req = try request(s, plan(&l, edits), &l);
    try std.testing.expect(try history.applyBatch(s, &.{.{ .edit_chart_literals = req }}));
    try std.testing.expectError(error.LayoutReflowRequired, s.save(a, .{}));
    const after = try saved(s);
    defer a.free(after);
    const fresh = try Session.open(a, after);
    defer fresh.close();
    fresh.enableHistoryDelta();
    var reopened = try lease(fresh);
    defer reopened.deinit(a);
    try std.testing.expectEqualStrings("7.00", reopened.context.patch.data.data.series[0].values[2]);
    try std.testing.expectEqualStrings("새 범주", reopened.context.patch.data.data.categories[1]);
    try std.testing.expectEqual(l.target.owner.geometry.width, reopened.target.owner.geometry.width);
    try std.testing.expectEqual(l.target.owner.geometry.height, reopened.target.owner.geometry.height);
    const original = try fresh.binaryResource(a, l.target.owner.ordinal, 1048576);
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, l.context.input.file.bytes, original[4..]);
    try std.testing.expect(try history.undo(s));
    const undo = try saved(s);
    defer a.free(undo);
    try std.testing.expectEqualSlices(u8, raw, undo);
    try std.testing.expectError(error.StaleMutationEpoch, history.applyBatch(s, &.{.{ .edit_chart_literals = req }}));
    try std.testing.expect(try history.redo(s));
    const redo = try saved(s);
    defer a.free(redo);
    try std.testing.expectEqualSlices(u8, after, redo);
}
