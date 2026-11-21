// Own fixture helpers reused; independent generated alignment history tests.
const std = @import("std");
const a = std.testing.allocator;
const model = @import("model/created_table.zig");
const Request = @import("model/created_cell_properties_values.zig").Request;
const Ticket = @import("model/history_mutation_epoch.zig").Ticket;
const h5 = @import("hwp5/edit/style_preservation.zig");
const H5History = @import("hwp5/edit/editor_history.zig").History;
const hx = @import("hwpx/editor_session.zig");
const HxHistory = @import("hwpx/editor_history.zig").History;
fn h5Stage(session: *h5.Session, history: *H5History) !u64 {
    return h5StageWithAttributes(session, history, 0);
}
fn h5StageWithAttributes(session: *h5.Session, history: *H5History, attributes: u32) !u64 {
    var ids = try session.planTableIdsWithAllocator(a, 4);
    defer ids.deinit(a);
    var table = try model.create(a, ids.identity, ids.instance_id, try @import("model/table_creation_plan.zig").create(2, 2, 200, 20, 4), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 0 }, 4);
    defer table.deinit(a);
    _ = try table.replaceText(a, 0, 1, "셀😀", 100);
    var options = @import("new_document/hwp5_profile_test_options.zig").creationOptions();
    options.cell.attributes = attributes;
    try std.testing.expect(try history.apply(session, .{ .stage_table = .{ .section = 0, .paragraph = 0, .unit = 16, .table = &table, .options = options } }));
    return table.identity;
}
fn h5Saved(session: *h5.Session) ![]u8 {
    return (try session.save(a, .{ .allow_stale_layout = true })).bytes;
}
fn hxStage(session: *hx.Session, history: *HxHistory) !u64 {
    var table = try @import("hwpx/created_table_prepare.zig").prepare(session, 0, 1, 0, 2, 2, 200, 20, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 });
    defer table.deinit(a);
    _ = try table.replaceText(a, 0, 1, "셀😀", 100);
    try std.testing.expect(try history.apply(session, .{ .kind = .created_table_stage, .section = 0, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "", .created_table = &table }));
    return table.identity;
}
fn request(identity: u64, ticket: Ticket) Request {
    return .{ .address = .{ .section = 0, .identity = identity, .row = 0, .column = 1 }, .expected_ticket = ticket, .expected = .{ .width = 100, .height = 20 }, .vertical_alignment = .bottom };
}
fn checkH5(saved: []const u8) !void {
    var source = try @import("hwp5/text_source.zig").Source.open(a, saved);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var it = @import("hwp5/record.zig").Iterator.init(bytes, .{});
    var count: usize = 0;
    while (try it.next()) |record| if (record.tag == 72) {
        try std.testing.expectEqual(@as(usize, 34), record.payload.len);
        try std.testing.expectEqual(@as(u32, if (count == 1) 0x40 else 0), std.mem.readInt(u32, record.payload[4..8], .little));
        try std.testing.expectEqual(@as(u16, 0), std.mem.readInt(u16, record.payload[32..34], .little));
        count += 1;
    };
    try std.testing.expectEqual(@as(usize, 4), count);
}
fn checkHX(saved: []const u8) !void {
    var reopened = try hx.open(a, saved, .{});
    defer reopened.deinit();
    const tree = &reopened.sections[0].tree;
    const uri = @import("hwpx/document_xml.zig").paragraph_uri;
    var count: usize = 0;
    for (tree.elements, 0..) |element, node| if (element.is(uri, "subList")) {
        const value = (try tree.attributeValue(a, node, "", "vertAlign")).?;
        try std.testing.expectEqualStrings(if (count == 1) "BOTTOM" else "TOP", value.borrowedNormalizedUtf8().?);
        count += 1;
    };
    try std.testing.expectEqual(@as(usize, 4), count);
}
fn checkProjection(bytes: []const u8, selected: ?u8, peer: ?u8) !void {
    var parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
    defer parsed.deinit();
    const rows = parsed.value.object.get("alignments").?.array.items;
    try std.testing.expectEqual(@as(usize, 4), rows.len);
    for (rows, 0..) |row, i| {
        const wanted = if (i == 1) selected else peer;
        const value = row.object.get("value").?;
        if (wanted) |number| try std.testing.expectEqual(@as(i64, number), value.integer) else try std.testing.expect(value == .null);
    }
}
test "created cell valign H5 save raw reopen history undo redo and no-op prior redo" {
    const input = try @import("new_document/root.zig").hwp5(a);
    defer a.free(input);
    const session = try h5.Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var history = try H5History.initV2(a, session, .{});
    defer history.deinit();
    const id = try h5Stage(session, &history);
    const before = try h5Saved(session);
    defer a.free(before);
    const edit = request(id, try session.historyTicket());
    const revision = history.revision();
    try std.testing.expect(try history.apply(session, .{ .edit_created_cell_properties = edit }));
    try std.testing.expectEqual(revision + 1, history.revision());
    try std.testing.expectError(error.LayoutReflowRequired, session.save(a, .{}));
    const after = try h5Saved(session);
    defer a.free(after);
    try checkH5(after);
    const projected = try session.createdCellVerticalAlignmentProjection(a);
    defer a.free(projected);
    try checkProjection(projected, 2, 0);
    const reopened = try h5.Session.open(a, after);
    defer reopened.close();
    try std.testing.expectEqual(@as(usize, 0), try reopened.pendingTableCount(0));
    try std.testing.expect(try history.undo(session));
    const undone = try h5Saved(session);
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    var noop = request(id, try session.historyTicket());
    noop.vertical_alignment = .top;
    const noop_revision = history.revision();
    try std.testing.expect(!try history.apply(session, .{ .edit_created_cell_properties = noop }));
    try std.testing.expectEqual(noop_revision, history.revision());
    try std.testing.expect(try history.redo(session));
    const redone = try h5Saved(session);
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
}
test "created cell valign HX save raw reopen history undo redo and no-op prior redo" {
    const input = try @import("new_document/root.zig").hwpx(a);
    defer a.free(input);
    var session = try hx.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true; // Same protocol setting as official Native WASM open.
    var history = try HxHistory.initV2(&session, .{});
    defer history.deinit();
    const id = try hxStage(&session, &history);
    const before = try session.save();
    defer a.free(before);
    const edit = request(id, try session.createdCellPropertiesTicket());
    const revision = history.revision();
    try std.testing.expect(try history.apply(&session, .{ .kind = .created_cell_properties, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .created_cell_properties = &edit }));
    try std.testing.expectEqual(revision + 1, history.revision());
    const after = try session.save();
    defer a.free(after);
    try checkHX(after);
    const projected = try @import("hwpx/created_cell_vertical_alignment_projection.zig").read(a, &session);
    defer a.free(projected);
    try checkProjection(projected, 2, 0);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    var noop = request(id, try session.createdCellPropertiesTicket());
    noop.vertical_alignment = .top;
    const noop_revision = history.revision();
    try std.testing.expect(!try history.apply(&session, .{ .kind = .created_cell_properties, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .created_cell_properties = &noop }));
    try std.testing.expectEqual(noop_revision, history.revision());
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
}
test "created cell valign H5 authored CENTER default reserved and protected policy bytes intact" {
    for ([_]u32{ 0x20, 0x60, 1 << 17 }) |attributes| {
        const input = try @import("new_document/root.zig").hwp5(a);
        defer a.free(input);
        const session = try h5.Session.open(a, input);
        defer session.close();
        session.enableHistoryDelta();
        var history = try H5History.initV2(a, session, .{});
        defer history.deinit();
        const id = try h5StageWithAttributes(session, &history, attributes);
        const before = try h5Saved(session);
        defer a.free(before);
        var edit = request(id, try session.historyTicket());
        edit.vertical_alignment = .center;
        const revision = history.revision();
        if (attributes == 0x20) {
            try std.testing.expect(!try history.apply(session, .{ .edit_created_cell_properties = edit }));
        } else if (attributes == 0x60) {
            try std.testing.expectError(error.UnsupportedCreatedCellVerticalAlignment, history.apply(session, .{ .edit_created_cell_properties = edit }));
        } else {
            try std.testing.expectError(error.ProtectedCell, history.apply(session, .{ .edit_created_cell_properties = edit }));
        }
        try std.testing.expectEqual(revision, history.revision());
        const after = try h5Saved(session);
        defer a.free(after);
        try std.testing.expectEqualSlices(u8, before, after);
        const projected = try session.createdCellVerticalAlignmentProjection(a);
        defer a.free(projected);
        const base: ?u8 = if (attributes == 0x60) null else if (attributes == 0x20) 1 else 0;
        try checkProjection(projected, base, base);
    }
}
