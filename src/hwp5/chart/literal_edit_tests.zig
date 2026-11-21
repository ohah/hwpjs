//! Prepared Native tests. Explicit test raster is transport evidence, never a product fallback or painter proof.
const std = @import("std");
const a = std.testing.allocator;
const edit = @import("../edit/style_preservation.zig");
const History = @import("../edit/history_v2.zig").History;
const types = @import("literal_edit_request.zig");
const data = @import("create_test_fixture.zig").data;
const png = @embedFile("test_fixtures/create-transport-bars-64.png");
const changes: []const types.Edit = &.{ .{ .value = .{ .series = 0, .category = 0, .expected = "10", .value = "99" } }, .{ .category = .{ .category = 1, .expected = "Two", .value = "둘" } } };
fn digest(bytes: []const u8) [32]u8 {
    var out: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &out, .{});
    return out;
}
const Fixture = struct {
    session: *edit.Session,
    fn open(count: usize) !Fixture {
        const bytes = try @import("../../new_document/hwp5.zig").create(a);
        defer a.free(bytes);
        const session = try edit.Session.open(a, bytes);
        errdefer session.close();
        session.enableHistoryDelta();
        for (0..count) |_| {
            const reference = try session.currentSourceParagraphReference(0, 0);
            const text = try session.copyCurrentParagraphTextUtf16(a, 0, reference);
            defer a.free(text);
            const xml = try @import("../../hwpx/chart_create_xml.zig").create(a, data);
            defer a.free(xml);
            try session.apply(.{ .insert_chart = .{
                .target = .{ .section = 0, .binding = try session.historyTicket(), .anchor = .{ .host = reference.source.host, .unit = 16 } },
                .expected_text_utf16le = text,
                .box = .{ .width = 12000, .height = 12000 },
                .data = data,
                .rendered = .{ .source_xml_sha256 = digest(xml), .pixel_width = 64, .pixel_height = 64, .bytes = png },
                .profile = .spec24_registered_png_presentation_v1,
            } });
        }
        return .{ .session = session };
    }
    fn deinit(self: Fixture) void {
        self.session.close();
    }
};
const Plan = struct {
    value: types.Plan,
    fn deinit(self: Plan) void {
        a.free(self.value.owners);
    }
};
fn plan(session: *edit.Session, edits: []const types.Edit, all: bool) !Plan {
    const rows = try session.hwp5ChartCandidates(a);
    defer a.free(rows);
    if (rows.len == 0) return error.MissingTestChart;
    const targets = try a.alloc(types.Target, if (all) rows.len else 1);
    errdefer a.free(targets);
    for (targets, rows[0..targets.len]) |*t, row| t.* = .{ .section = row.section, .owner = row.owner, .physical_id = row.resource.physical_id.?, .resource_sha256 = row.resource.resource_sha256.? };
    const bytes = try session.binaryResource(a, targets[0].owner.ordinal, 1048576);
    defer a.free(bytes);
    var source = try @import("ooxml_resource.zig").read(a, bytes, .observed_size_prefix);
    defer source.deinit(a);
    return .{ .value = .{ .profile = .spec24_clustered_column_literals_v1, .binding = try session.historyTicket(), .owners = targets, .source_xml_sha256 = digest(source.tree.source), .edits = edits } };
}
fn request(session: *edit.Session, p: types.Plan) !types.Request {
    const bytes = try session.hwp5ChartLiteralEditPreview(a, p);
    defer a.free(bytes);
    var parsed = try std.json.parseFromSlice(struct { changed: bool, xml_sha256: [32]u8, executionAuthority: bool }, a, bytes, .{ .ignore_unknown_fields = true });
    defer parsed.deinit();
    try std.testing.expect(!parsed.value.executionAuthority);
    return .{ .plan = p, .rendered = if (!parsed.value.changed) null else .{ .source_xml_sha256 = parsed.value.xml_sha256, .pixel_width = 64, .pixel_height = 64, .bytes = png } };
}
fn saved(session: *edit.Session) ![]u8 {
    return (try session.save(a, .{ .allow_stale_layout = true })).bytes;
}
fn changed(session: *edit.Session, wanted: []const u8) !void {
    const rows = try session.hwp5ChartCandidates(a);
    defer a.free(rows);
    var display = try session.hwp5ChartDisplay(a, rows[0].section, rows[0].owner.control_node);
    defer display.deinit(a);
    var number = false;
    var category = false;
    for (display.values.points.points) |point| {
        if (std.mem.eql(u8, point.value, wanted)) number = true;
        if (std.mem.eql(u8, point.value, "둘")) category = true;
    }
    try std.testing.expect(number and category);
}
fn aliased(input: []const u8) ![]u8 {
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    try std.testing.expect(!source.header.has(.compressed));
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var it = @import("../record.zig").Iterator.init(raw, .{});
    var count: usize = 0;
    while (try it.next()) |record| if (record.tag == 84) {
        try std.testing.expectEqual(@as(usize, 24), record.payload.len);
        const at = record.offset + record.raw.len - record.payload.len + 10;
        std.mem.writeInt(u16, raw[at..][0..2], 1, .little);
        count += 1;
    };
    try std.testing.expectEqual(@as(usize, 2), count);
    return @import("../../cfb/stream_replace.zig").rebuildExact(a, &source.file, "/BodyText/Section0", raw, .{});
}
test "H5 chart literal edit canonical XML numeric category batch and stale before proof" {
    const xml = try @import("../../hwpx/chart_create_xml.zig").create(a, data);
    defer a.free(xml);
    var value = try @import("literal_edit_xml.zig").prepare(a, xml, digest(xml), changes, 1048576);
    defer value.deinit(a);
    try std.testing.expect(value.changed);
    try std.testing.expectEqualStrings("둘", value.data.data.categories[1]);
    try std.testing.expectEqualStrings("99", value.data.data.series[0].values[0]);
    const bad: []const types.Edit = &.{.{ .value = .{ .series = 0, .category = 0, .expected = "11", .value = "99" } }};
    try std.testing.expectError(error.SourceBindingMismatch, @import("literal_edit_xml.zig").prepare(a, xml, digest(xml), bad, 1048576));
}
test "H5 chart literal edit duplicate logical edits and unknown canonical profile stay refused" {
    const xml = try @import("../../hwpx/chart_create_xml.zig").create(a, data);
    defer a.free(xml);
    const duplicate: []const types.Edit = &.{ changes[0], changes[0] };
    try std.testing.expectError(error.DuplicateChartPointEdit, @import("literal_edit_xml.zig").prepare(a, xml, digest(xml), duplicate, 1048576));
    const declaration_end = std.mem.indexOf(u8, xml, "?>").? + 2;
    const opaque_xml = try std.mem.concat(a, u8, &.{ xml[0..declaration_end], "<!--OWN-UNSUPPORTED-->", xml[declaration_end..] });
    defer a.free(opaque_xml);
    try std.testing.expectError(error.UnsupportedChartLiteralEditProfile, @import("literal_edit_xml.zig").prepare(a, opaque_xml, digest(opaque_xml), changes, 1048576));
}
test "H5 chart literal edit pending source and reopened source write read and exactly one managed History" {
    const f = try Fixture.open(1);
    defer f.deinit();
    const history = try History.create(a, f.session, .{});
    defer history.deinit();
    const before = try saved(f.session);
    defer a.free(before);
    const p = try plan(f.session, changes, false);
    defer p.deinit();
    const req = try request(f.session, p.value);
    try std.testing.expect(try history.applyBatch(f.session, &.{.{ .edit_chart_literals = req }}));
    try changed(f.session, "99");
    const after = try saved(f.session);
    defer a.free(after);
    var tmp = std.testing.tmpDir(.{});
    defer tmp.cleanup();
    try tmp.dir.writeFile(std.testing.io, .{ .sub_path = "edited.hwp", .data = after });
    const disk = try tmp.dir.readFileAlloc(std.testing.io, "edited.hwp", a, .limited(64 * 1024 * 1024));
    defer a.free(disk);
    try std.testing.expectEqualSlices(u8, after, disk);
    const fresh = try edit.Session.open(a, disk);
    defer fresh.close();
    fresh.enableHistoryDelta();
    try changed(fresh, "99");
    const further: []const types.Edit = &.{.{ .value = .{ .series = 0, .category = 0, .expected = "99", .value = "100" } }};
    const p2 = try plan(fresh, further, false);
    defer p2.deinit();
    try fresh.apply(.{ .edit_chart_literals = try request(fresh, p2.value) });
    try changed(fresh, "100");
    try std.testing.expect(try history.undo(f.session));
    try std.testing.expect(!try history.undo(f.session));
    const undo = try saved(f.session);
    defer a.free(undo);
    try std.testing.expectEqualSlices(u8, before, undo);
    try std.testing.expectError(error.StaleMutationEpoch, history.applyBatch(f.session, &.{.{ .edit_chart_literals = req }}));
    try std.testing.expect(try history.redo(f.session));
    try std.testing.expect(!try history.redo(f.session));
    const redo = try saved(f.session);
    defer a.free(redo);
    try std.testing.expectEqualSlices(u8, after, redo);
}
fn cow(all: bool) !void {
    const f = try Fixture.open(2);
    defer f.deinit();
    const bytes = try saved(f.session);
    defer a.free(bytes);
    const shared = try aliased(bytes);
    defer a.free(shared);
    const session = try edit.Session.open(a, shared);
    defer session.close();
    session.enableHistoryDelta();
    const p = try plan(session, changes, all);
    defer p.deinit();
    const old = try session.binaryResource(a, 1, 1048576);
    defer a.free(old);
    try session.apply(.{ .edit_chart_literals = try request(session, p.value) });
    const rows = try session.hwp5ChartCandidates(a);
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 2), rows.len);
    try std.testing.expect(rows[0].owner.ordinal != 1);
    if (all) try std.testing.expectEqual(rows[0].owner.ordinal, rows[1].owner.ordinal) else try std.testing.expectEqual(@as(u16, 1), rows[1].owner.ordinal);
    const preserved = try session.binaryResource(a, 1, 1048576);
    defer a.free(preserved);
    try std.testing.expectEqualSlices(u8, old, preserved);
    const output = try saved(session);
    defer a.free(output);
    const reopened = try edit.Session.open(a, output);
    defer reopened.close();
    try changed(reopened, "99");
}
test "H5 chart literal edit shared resource selected owner COW preserves original and unselected alias" {
    try cow(false);
}
test "H5 chart literal edit grouped resource COW reconnects selected owners to exactly one new asset" {
    try cow(true);
}
test "H5 chart literal edit no op and raster only cannot advance state or discard redo" {
    const f = try Fixture.open(1);
    defer f.deinit();
    const history = try History.create(a, f.session, .{});
    defer history.deinit();
    const edits: []const types.Edit = &.{.{ .value = .{ .series = 0, .category = 0, .expected = "10", .value = "10" } }};
    const p = try plan(f.session, edits, false);
    defer p.deinit();
    const before = try saved(f.session);
    defer a.free(before);
    var req = try request(f.session, p.value);
    try std.testing.expect(req.rendered == null);
    try std.testing.expect(!try history.applyBatch(f.session, &.{.{ .edit_chart_literals = req }}));
    req.rendered = .{ .source_xml_sha256 = p.value.source_xml_sha256, .pixel_width = 64, .pixel_height = 64, .bytes = png };
    try std.testing.expectError(error.UnexpectedChartLiteralEditNoopRaster, history.applyBatch(f.session, &.{.{ .edit_chart_literals = req }}));
    const after = try saved(f.session);
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}
test "H5 chart literal edit stale XML PNG owner and expected values refuse atomically with saved bytes intact" {
    const f = try Fixture.open(1);
    defer f.deinit();
    const history = try History.create(a, f.session, .{});
    defer history.deinit();
    const p = try plan(f.session, changes, false);
    defer p.deinit();
    const valid = try request(f.session, p.value);
    const before = try saved(f.session);
    defer a.free(before);
    var stale = valid;
    stale.rendered.?.source_xml_sha256[0] ^= 1;
    try std.testing.expectError(error.StaleChartCreatePreview, history.applyBatch(f.session, &.{.{ .edit_chart_literals = stale }}));
    var owner = p.value.owners[0];
    owner.owner.current_unit += 1;
    var forged = p.value;
    forged.owners = &.{owner};
    try std.testing.expectError(error.SourceBindingMismatch, f.session.hwp5ChartLiteralEditPreview(a, forged));
    var digest_bad = p.value;
    digest_bad.source_xml_sha256[0] ^= 1;
    try std.testing.expectError(error.SourceBindingMismatch, f.session.hwp5ChartLiteralEditPreview(a, digest_bad));
    const after = try saved(f.session);
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}
test "H5 chart literal edit source profile limits exact owners boundary and old layout rejection" {
    const f = try Fixture.open(1);
    defer f.deinit();
    const p = try plan(f.session, changes, false);
    defer p.deinit();
    const owners = try a.alloc(types.Target, types.max_owners + 1);
    defer a.free(owners);
    for (owners, 0..) |*v, i| {
        v.* = p.value.owners[0];
        v.owner.control_node = i + 1;
    }
    var request_plan = p.value;
    request_plan.owners = owners[0..types.max_owners];
    try types.validate(request_plan);
    request_plan.owners = owners;
    try std.testing.expectError(error.LimitExceeded, types.validate(request_plan));
    var old = p.value.owners[0];
    old.owner.ole_layout = .observed26;
    request_plan.owners = &.{old};
    try std.testing.expectError(error.UnsupportedChartLiteralEditOwner, types.validate(request_plan));
}

test "H5 chart literal edit category expands across all series while numeric edit stays scoped" {
    const multi: @import("../../hwpx/chart_create_data.zig").Data = .{
        .categories = data.categories,
        .series = &.{ data.series[0], .{ .name = "Other", .values = &.{ "40", "50", "60" } } },
    };
    const xml = try @import("../../hwpx/chart_create_xml.zig").create(a, multi);
    defer a.free(xml);
    var patch = try @import("literal_edit_xml.zig").prepare(a, xml, digest(xml), changes, 1048576);
    defer patch.deinit(a);
    try std.testing.expectEqualStrings("99", patch.data.data.series[0].values[0]);
    try std.testing.expectEqualStrings("40", patch.data.data.series[1].values[0]);
    try std.testing.expectEqualStrings("둘", patch.data.data.categories[1]);
    var matching_categories: usize = 0;
    for (patch.values.points.points) |point| {
        if (point.kind == .string_literal and point.index == 1 and std.mem.eql(u8, point.value, "둘")) matching_categories += 1;
    }
    try std.testing.expectEqual(@as(usize, 2), matching_categories);
}
test "H5 chart literal edit changed data requires explicit raster and failed request retains valid prior redo" {
    const f = try Fixture.open(1);
    defer f.deinit();
    const history = try History.create(a, f.session, .{});
    defer history.deinit();
    const p = try plan(f.session, changes, false);
    defer p.deinit();
    try std.testing.expect(try history.applyBatch(f.session, &.{.{ .edit_chart_literals = try request(f.session, p.value) }}));
    const edited = try saved(f.session);
    defer a.free(edited);
    try std.testing.expect(try history.undo(f.session));
    const before = try saved(f.session);
    defer a.free(before);
    const current = try plan(f.session, changes, false);
    defer current.deinit();
    try std.testing.expectError(error.MissingChartLiteralEditRaster, history.applyBatch(f.session, &.{.{ .edit_chart_literals = .{ .plan = current.value } }}));
    const after = try saved(f.session);
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expect(try history.redo(f.session));
    const redone = try saved(f.session);
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, edited, redone);
}
test "H5 chart literal edit request byte budget exact and plus one and text cap exact and plus one" {
    const f = try Fixture.open(1);
    defer f.deinit();
    const p = try plan(f.session, changes, false);
    defer p.deinit();
    const cap = @import("../../hwpx/chart_create_data.zig").max_text_bytes;
    const text = try a.alloc(u8, cap + 1);
    defer a.free(text);
    @memset(text, 'x');
    const items = try a.alloc(types.Edit, types.max_input_bytes / (cap * 2));
    defer a.free(items);
    for (items, 0..) |*item, i| item.* = .{ .category = .{ .category = @intCast(i), .expected = text[0..cap], .value = text[0..cap] } };
    var exact = p.value;
    exact.edits = items;
    try types.validate(exact);
    items[0].category.value = text[0 .. cap + 1];
    try std.testing.expectError(error.LimitExceeded, types.validate(exact));
    items[0].category.value = text[0..cap];
    items[0].category.expected = text[0 .. cap - 1];
    // Exact aggregate minus one, still valid. Grow one other leaf to exceed the
    // aggregate while each individual string remains within the per-leaf cap.
    try types.validate(exact);
    const extra = try a.alloc(types.Edit, items.len + 1);
    defer a.free(extra);
    @memcpy(extra[0..items.len], items);
    extra[items.len] = .{ .category = .{ .category = 1000, .expected = "a", .value = "b" } };
    exact.edits = extra;
    try std.testing.expectError(error.LimitExceeded, types.validate(exact));
}
test "H5 chart literal allocation failures release all owned stages" {
    const xml = try @import("../../hwpx/chart_create_xml.zig").create(a, data);
    defer a.free(xml);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            var prepared = try @import("literal_edit_xml.zig").prepare(allocator, source, digest(source), changes, 1048576);
            defer prepared.deinit(allocator);
            try std.testing.expectEqualStrings("99", prepared.data.data.series[0].values[0]);
        }
    }.run, .{xml});
}
