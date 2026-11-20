//! Authored Native source tests, including actual parked-history declarations.
const std = @import("std");
const editor = @import("editor_session.zig");
const receipts_mod = @import("created_table_placement_receipts.zig");
const transfer = @import("inline_object_table_transfer.zig");

fn setup(a: std.mem.Allocator) !editor.Session {
    const input = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    errdefer session.deinit();
    _ = try session.splice(0, 1, 0, 0, "A😀B");
    for ([_]u32{ 1, 3 }) |unit| {
        const ids = try @import("created_table_source_ids.zig").plan(&session, 1);
        defer a.free(ids.paragraph_ids);
        var table = try @import("../model/created_table.zig").create(a, ids.identity, ids.instance_id, try @import("../model/table_creation_plan.zig").create(1, 1, 10000, 4000, 1), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 1);
        defer table.deinit(a);
        _ = try table.replaceText(a, 0, 0, "preserve", 1000);
        _ = try @import("created_table_session.zig").stage(&session, 0, 1, unit, &table);
    }
    return session;
}
fn receiptCase(a: std.mem.Allocator) !void {
    var session = try setup(a);
    defer session.deinit();
    const ordinary = try session.save();
    defer a.free(ordinary);
    var receipts: receipts_mod.Receipts = .{};
    defer receipts.deinit(a);
    const saved = try session.saveWithTablePlacements(&receipts);
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, ordinary, saved);
    try std.testing.expectEqual(@as(usize, 2), receipts.items.items.len);
    try std.testing.expectEqual(@as(usize, 2), session.sections[0].created_tables.entries.items.len);
    var physical = try editor.open(a, saved, .{});
    defer physical.deinit();
    var proof = try transfer.verify(&session, &physical, &receipts);
    defer proof.deinit();
    try std.testing.expectEqual(@as(usize, 2), proof.owners.count());
    try std.testing.expectEqual(@as(u32, 1), receipts.items.items[0].current_unit);
    try std.testing.expectEqual(@as(u32, 1), receipts.items.items[0].saved_unit);
    try std.testing.expectEqual(@as(u32, 3), receipts.items.items[1].current_unit);
    try std.testing.expectEqual(@as(u32, 4), receipts.items.items[1].saved_unit);
}
test "HWPX inline placement serializer receipts preserve ordinary save bytes and prove real host units" {
    try receiptCase(std.testing.allocator);
}
test "HWPX inline placement serializer receipt allocation failures preserve logical table owners" {
    try @import("../testing/allocation_failures.zig").check(receiptCase, .{});
}
test "HWPX inline placement forged receipt host unit reference and byte offset cannot transfer an owner" {
    const a = std.testing.allocator;
    var session = try setup(a);
    defer session.deinit();
    var receipts: receipts_mod.Receipts = .{};
    defer receipts.deinit(a);
    const bytes = try session.saveWithTablePlacements(&receipts);
    defer a.free(bytes);
    var physical = try editor.open(a, bytes, .{});
    defer physical.deinit();
    const original = receipts.items.items[0];
    for (0..6) |case| {
        var bad = original;
        switch (case) {
            0 => bad.current_host += 1,
            1 => bad.current_unit += 1,
            2 => bad.saved_unit += 1,
            3 => bad.table_start += 1,
            4 => bad.source_unit += 1,
            5 => bad.host_reference = .{ .generated_id = 999 },
            else => unreachable,
        }
        receipts.items.items[0] = bad;
        defer receipts.items.items[0] = original;
        if (transfer.verify(&session, &physical, &receipts)) |value| {
            var unexpected = value;
            unexpected.deinit();
            return error.ExpectedPhysicalOwnerProofRejection;
        } else |_| {}
    }
}
test "HWPX inline placement failed save does not publish partial receipt or reset live pending owners" {
    const a = std.testing.allocator;
    var session = try setup(a);
    defer session.deinit();
    const before = try session.save();
    defer a.free(before);
    var receipts: receipts_mod.Receipts = .{};
    defer receipts.deinit(a);
    const marker: receipts_mod.Record = .{ .identity = 999, .section = 0, .host_reference = .{ .source_ordinal = 1 }, .source_unit = 0, .current_host = 1, .current_unit = 0, .saved_unit = 0 };
    try receipts.items.append(a, marker);
    const limit = session.options.max_output_bytes;
    session.options.max_output_bytes = 1;
    try std.testing.expectError(error.LimitExceeded, session.saveWithTablePlacements(&receipts));
    session.options.max_output_bytes = limit;
    try std.testing.expectEqual(@as(usize, 1), receipts.items.items.len);
    try std.testing.expectEqualDeep(marker, receipts.items.items[0]);
    try std.testing.expectEqual(@as(usize, 2), session.sections[0].created_tables.entries.items.len);
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}

fn sameHost(a: std.mem.Allocator, chart: bool, backward: bool) !void {
    var session = try setup(a);
    defer session.deinit();
    var observed = try @import("inline_object_placement.zig").current(&session, .{ .section = 0, .paragraph = 1 }, .{ .session = "s1", .revision = 0, .serial = "0" });
    defer observed.deinit(a);
    const first_table = try @import("created_table_xml.zig").write(a, &session.sections[0].created_tables.entries.items[0].table, 64000);
    defer a.free(first_table);
    const before = try session.save();
    defer a.free(before);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(before, &digest, .{});
    const target: @import("inline_object_insert.zig").Target = .{ .section = 0, .paragraph = 1, .owner = observed.owner, .unit = 1, .affinity = if (backward) .backward else .forward, .expected_text = observed.text };
    session.history_delta_managed = true;
    var history = try @import("editor_history.zig").History.initV2(&session, .{});
    defer history.deinit();
    const revisions = history.revisionCount();
    if (chart) {
        const request: @import("chart_create.zig").Request = .{ .expected_source_sha256 = digest, .target = target, .size = .{ .width = 6000, .height = 2000 }, .data = .{ .categories = &.{"A"}, .series = &.{.{ .name = "S", .values = &.{"1"} }} } };
        try std.testing.expect(try history.apply(&session, .{ .kind = .chart_create, .paragraph = 1, .start = 1, .deleted = 0, .inserted = "", .chart_create = &request }));
    } else {
        const request: @import("equation_insert.zig").Request = .{ .expected_source_sha256 = digest, .target = target, .script = "x+y", .width = 3000, .height = 1000, .base_line = 80, .base_unit = 1000, .version = "Equation Version 60", .font = "HYhwpEQ" };
        try std.testing.expect(try history.apply(&session, .{ .kind = .equation_insert, .paragraph = 1, .start = 1, .deleted = 0, .inserted = "", .equation_insert = &request }));
    }
    try std.testing.expectEqual(revisions + 1, history.revisionCount());
    const after = try session.save();
    defer a.free(after);
    var archive = try @import("../zip/archive.zig").open(a, after, .{});
    defer archive.deinit();
    const xml = try archive.decode(archive.find("Contents/section0.xml").?, 4000000);
    defer a.free(xml);
    const table_at = std.mem.indexOf(u8, xml, first_table) orelse return error.MissingPreservedTable;
    const object_at = std.mem.indexOf(u8, xml, if (chart) "<hp:switch" else "<hp:equation") orelse return error.MissingInsertedObject;
    try std.testing.expect(if (backward) object_at < table_at else object_at > table_at);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, xml, first_table));
    try std.testing.expect(try history.undo(&session));
    try std.testing.expectEqual(@as(usize, 2), session.sections[0].created_tables.entries.items.len);
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
    var reopened = try editor.open(a, redone, .{});
    defer reopened.deinit();
    const fresh = try reopened.save();
    defer a.free(fresh);
    try std.testing.expectEqualSlices(u8, after, fresh);
}
test "HWPX inline placement same host pending table forward backward carets preserve one history transaction" {
    for ([_]bool{ false, true }) |chart| for ([_]bool{ false, true }) |backward| try sameHost(std.testing.allocator, chart, backward);
}
