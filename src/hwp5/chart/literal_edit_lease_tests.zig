//! Prepared Native cases. PNG64 is test transport, not a product painter proof.
const std = @import("std");
const a = std.testing.allocator;
const Session = @import("../edit/style_preservation.zig").Session;
const History = @import("../edit/history_v2.zig").History;
const wire = @import("../../wasm/hwp5_chart_literal_edit_wire.zig");
const types = @import("literal_edit_request.zig");
const Lease = @import("literal_edit_lease.zig").Lease;
const png = @embedFile("test_fixtures/create-transport-bars-64.png");
const edits: []const types.Edit = &.{.{ .value = .{ .series = 0, .category = 0, .expected = "10", .value = "99" } }};
fn digest(bytes: []const u8) [32]u8 {
    var out: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &out, .{});
    return out;
}
fn fixture() !*Session {
    const bytes = try @import("../../new_document/hwp5.zig").create(a);
    defer a.free(bytes);
    const s = try Session.open(a, bytes);
    errdefer s.close();
    s.enableHistoryDelta();
    const reference = try s.currentSourceParagraphReference(0, 0);
    const text = try s.copyCurrentParagraphTextUtf16(a, 0, reference);
    defer a.free(text);
    const data = @import("create_test_fixture.zig").data;
    const xml = try @import("../../hwpx/chart_create_xml.zig").create(a, data);
    defer a.free(xml);
    try s.apply(.{ .insert_chart = .{ .target = .{ .section = 0, .binding = try s.historyTicket(), .anchor = .{ .host = reference.source.host, .unit = 16 } }, .expected_text_utf16le = text, .box = .{ .width = 12000, .height = 12000 }, .data = data, .rendered = .{ .source_xml_sha256 = digest(xml), .pixel_width = 64, .pixel_height = 64, .bytes = png }, .profile = .spec24_registered_png_presentation_v1 } });
    return s;
}
fn capture(s: *Session) !Lease {
    const rows = try s.hwp5ChartCandidates(a);
    defer a.free(rows);
    return s.hwp5ChartLiteralEditLease(a, rows[0].section, rows[0].owner.control_node);
}
fn witness(lease: *const Lease) wire.Witness {
    return .{ .profile = .spec24_clustered_column_literals_v1, .ticket = wire.Ticket.from(lease.binding), .viewEpoch = wire.Words.from(9007199254740993), .historyRevision = 7, .owners = @as([*]const types.Target, @ptrCast(&lease.target))[0..1], .source_xml_sha256 = lease.source_xml_sha256, .pixel_width = lease.context.input.width, .pixel_height = lease.context.input.height };
}
fn saved(s: *Session) ![]u8 {
    return (try s.save(a, .{ .allow_stale_layout = true })).bytes;
}
test "H5 chart literal lease ABI captures admitted own literals without edit authority or state writes" {
    const s = try fixture();
    defer s.close();
    const before = try saved(s);
    defer a.free(before);
    var lease = try capture(s);
    defer lease.deinit(a);
    try std.testing.expectEqualStrings("10", lease.context.patch.data.data.series[0].values[0]);
    const bytes = try wire.lease(a, &lease, 9007199254740993, 7);
    defer a.free(bytes);
    const parsed = try std.json.parseFromSlice(struct { executionAuthority: bool, scope: []const u8, witness: wire.Witness }, a, bytes, .{ .ignore_unknown_fields = true });
    defer parsed.deinit();
    try std.testing.expect(!parsed.value.executionAuthority);
    try std.testing.expectEqualStrings("hwp5-chart-literal-edit-lease", parsed.value.scope);
    try wire.validateFence(parsed.value.witness, lease.binding, 9007199254740993, 7);
    const after = try saved(s);
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqualDeep(lease.binding, try s.historyTicket());
}
test "H5 chart literal lease ABI full width ticket words and every fence axis are checked" {
    const s = try fixture();
    defer s.close();
    var lease = try capture(s);
    defer lease.deinit(a);
    var ticket = lease.binding;
    ticket.binding.document = std.math.maxInt(u64);
    ticket.binding.generation = 9007199254740993;
    ticket.binding.owner = 0x80000000ffffffff;
    ticket.epoch = 0xffffffff80000000;
    try std.testing.expectEqualDeep(ticket, wire.Ticket.from(ticket).native());
    const current = witness(&lease);
    inline for (.{ "document", "generation", "owner" }) |field| {
        var bad = current;
        @field(bad.ticket, field).hi ^= 1;
        try std.testing.expectError(error.SourceBindingMismatch, wire.validateFence(bad, lease.binding, current.viewEpoch.value(), 7));
    }
    var stale = current;
    stale.ticket.epoch.hi ^= 1;
    try std.testing.expectError(error.StaleMutationEpoch, wire.validateFence(stale, lease.binding, current.viewEpoch.value(), 7));
    try std.testing.expectError(error.StaleCurrentReference, wire.validateFence(current, lease.binding, current.viewEpoch.value() + 1, 7));
    try std.testing.expectError(error.StaleCurrentReference, wire.validateFence(current, lease.binding, current.viewEpoch.value(), 8));
}
test "H5 chart literal lease ABI strict JSON schema unknown duplicate and exact plus one wire limit" {
    const s = try fixture();
    defer s.close();
    var lease = try capture(s);
    defer lease.deinit(a);
    const input: wire.Preview = .{ .schemaVersion = 1, .witness = witness(&lease), .edits = edits };
    const bytes = try std.json.Stringify.valueAlloc(a, input, .{});
    defer a.free(bytes);
    var parsed = try wire.parse(wire.Preview, a, bytes);
    defer parsed.deinit();
    try std.testing.expectEqualDeep(lease.binding, parsed.value.witness.ticket.native());
    const unknown = try std.mem.concat(a, u8, &.{ "{\"unexpected\":0,", bytes[1..] });
    defer a.free(unknown);
    try std.testing.expectError(error.UnknownField, wire.parse(wire.Preview, a, unknown));
    const duplicate = try std.mem.concat(a, u8, &.{ "{\"schemaVersion\":1,", bytes[1..] });
    defer a.free(duplicate);
    try std.testing.expectError(error.DuplicateField, wire.parse(wire.Preview, a, duplicate));
    const padded = try a.alloc(u8, wire.max_request_bytes + 1);
    defer a.free(padded);
    @memset(padded, ' ');
    @memcpy(padded[0..bytes.len], bytes);
    var exact = try wire.parse(wire.Preview, a, padded[0..wire.max_request_bytes]);
    defer exact.deinit();
    try std.testing.expectError(error.LimitExceeded, wire.parse(wire.Preview, a, padded));
    var unsupported = input;
    unsupported.schemaVersion = 2;
    const wrong = try std.json.Stringify.valueAlloc(a, unsupported, .{});
    defer a.free(wrong);
    try std.testing.expectError(error.UnsupportedChartLiteralEditWire, wire.parse(wire.Preview, a, wrong));
}
test "H5 chart literal lease ABI preview and commit admission reject altered owner resource XML dimensions" {
    const s = try fixture();
    defer s.close();
    var lease = try capture(s);
    defer lease.deinit(a);
    const current = witness(&lease);
    const before = try saved(s);
    defer a.free(before);
    var owner = lease.target;
    owner.owner.current_unit += 1;
    var forged = current;
    forged.owners = &.{owner};
    try std.testing.expectError(error.SourceBindingMismatch, s.hwp5ChartLiteralEditPreviewBound(a, forged.plan(edits), 64, 64, wire.max_reply_bytes));
    try std.testing.expectError(error.SourceBindingMismatch, s.validateHwp5ChartLiteralEditLease(a, forged.plan(edits), 64, 64));
    owner = lease.target;
    owner.resource_sha256[0] ^= 1;
    forged.owners = &.{owner};
    try std.testing.expectError(error.SourceBindingMismatch, s.validateHwp5ChartLiteralEditLease(a, forged.plan(edits), 64, 64));
    var bad_xml = current;
    bad_xml.source_xml_sha256[0] ^= 1;
    try std.testing.expectError(error.SourceBindingMismatch, s.validateHwp5ChartLiteralEditLease(a, bad_xml.plan(edits), 64, 64));
    try std.testing.expectError(error.SourceBindingMismatch, s.hwp5ChartLiteralEditPreviewBound(a, current.plan(edits), 65, 64, wire.max_reply_bytes));
    try std.testing.expectError(error.SourceBindingMismatch, s.validateHwp5ChartLiteralEditLease(a, current.plan(edits), 64, 65));
    try std.testing.expectError(error.SourceBindingMismatch, s.hwp5ChartLiteralEditLease(a, 0, std.math.maxInt(u32)));
    const after = try saved(s);
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}
test "H5 chart literal lease ABI empty no op metadata and unsolicited raster have strict transport pairing" {
    try std.testing.expect(try wire.rendered(null, &.{}) == null);
    try std.testing.expectError(error.UnexpectedChartLiteralEditNoopRaster, wire.rendered(null, png));
    const metadata: wire.Rendered = .{ .source_xml_sha256 = @splat(0), .pixel_width = 64, .pixel_height = 64 };
    try std.testing.expectError(error.MissingChartLiteralEditRaster, wire.rendered(metadata, &.{}));
    const payload = (try wire.rendered(metadata, png)).?;
    try std.testing.expectEqualSlices(u8, png, payload.bytes);
    // This transport pairing cannot prove the caller used the shared painter.
    // Full Native admission validates XML binding/PNG structure; Worker owns provenance.
}
test "H5 chart literal lease ABI preview reply byte cap rejects atomically and read ticket remains live" {
    const s = try fixture();
    defer s.close();
    var lease = try capture(s);
    defer lease.deinit(a);
    const current = witness(&lease);
    const before = try saved(s);
    defer a.free(before);
    try std.testing.expectError(error.LimitExceeded, s.hwp5ChartLiteralEditPreviewBound(a, current.plan(edits), 64, 64, 1));
    const after = try saved(s);
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqualDeep(lease.binding, try s.historyTicket());
}
test "H5 chart literal lease ABI old lease expires through applied edit undo redo even when values return" {
    const s = try fixture();
    defer s.close();
    const history = try History.create(a, s, .{});
    defer history.deinit();
    var lease = try capture(s);
    defer lease.deinit(a);
    const current = witness(&lease);
    const plan = current.plan(edits);
    const preview = try s.hwp5ChartLiteralEditPreviewBound(a, plan, 64, 64, wire.max_reply_bytes);
    defer a.free(preview);
    const json = try std.json.parseFromSlice(struct { xml_sha256: [32]u8 }, a, preview, .{ .ignore_unknown_fields = true });
    defer json.deinit();
    try std.testing.expect(try history.applyBatch(s, &.{.{ .edit_chart_literals = .{ .plan = plan, .rendered = .{ .source_xml_sha256 = json.value.xml_sha256, .pixel_width = 64, .pixel_height = 64, .bytes = png } } }}));
    try std.testing.expectError(error.StaleMutationEpoch, s.validateHwp5ChartLiteralEditLease(a, plan, 64, 64));
    try std.testing.expect(try history.undo(s));
    try std.testing.expectError(error.StaleMutationEpoch, s.hwp5ChartLiteralEditPreviewBound(a, plan, 64, 64, wire.max_reply_bytes));
    var fresh = try capture(s);
    defer fresh.deinit(a);
    try std.testing.expect(fresh.binding.epoch != lease.binding.epoch);
    try std.testing.expect(try history.redo(s));
    try std.testing.expectError(error.StaleMutationEpoch, s.validateHwp5ChartLiteralEditLease(a, witness(&fresh).plan(edits), 64, 64));
}
