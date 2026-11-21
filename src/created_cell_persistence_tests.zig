const std = @import("std");
const a = std.testing.allocator;
const model = @import("model/created_table.zig");
const Request = @import("model/created_cell_properties_values.zig").Request;
const Ticket = @import("model/history_mutation_epoch.zig").Ticket;
const h5 = @import("hwp5/edit/style_preservation.zig");
const H5History = @import("hwp5/edit/editor_history.zig").History;
const hx = @import("hwpx/editor_session.zig");
const HxHistory = @import("hwpx/editor_history.zig").History;
fn change(identity: u64, ticket: Ticket) Request {
    var request: Request = .{ .address = .{ .section = 0, .identity = identity, .row = 0, .column = 1 }, .expected_ticket = ticket, .expected = .{ .width = 100, .height = 20 }, .size = .{ .width = 110, .height = 30 }, .appearance = .{ .background = .{ .solid = .{ .color = 0x123456 } } } };
    request.appearance.border.edges[0] = .{ .style = .SOLID, .width_hundredth_mm = 10, .color = 0x234567 };
    return request;
}
fn h5Stage(session: *h5.Session, history: *H5History) !u64 {
    var ids = try session.planTableIdsWithAllocator(a, 4);
    defer ids.deinit(a);
    var table = try model.create(a, ids.identity, ids.instance_id, try @import("model/table_creation_plan.zig").create(2, 2, 200, 20, 4), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 0 }, 4);
    defer table.deinit(a);
    _ = try table.replaceText(a, 0, 1, "셀😀", 100);
    try std.testing.expect(try history.apply(session, .{ .stage_table = .{ .section = 0, .paragraph = 0, .unit = 16, .table = &table, .options = @import("new_document/hwp5_profile_test_options.zig").creationOptions() } }));
    return table.identity;
}
fn h5Saved(session: *h5.Session) ![]u8 {
    return (try session.save(a, .{ .allow_stale_layout = true })).bytes;
}
fn h5Raw(saved: []const u8) !void {
    var source = try @import("hwp5/text_source.zig").Source.open(a, saved);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var it = @import("hwp5/record.zig").Iterator.init(raw, .{});
    var cells: usize = 0;
    while (try it.next()) |record| if (record.tag == 72) {
        // Own writer's explicit observed8 prefix, followed by table80 fields.
        try std.testing.expectEqual(@as(usize, 34), record.payload.len);
        const selected = cells == 1;
        try std.testing.expectEqual(@as(u32, if (selected) 110 else 100), std.mem.readInt(u32, record.payload[16..20], .little));
        try std.testing.expectEqual(@as(u32, if (selected) 30 else 20), std.mem.readInt(u32, record.payload[20..24], .little));
        try std.testing.expectEqual(@as(u16, if (selected) 1 else 0), std.mem.readInt(u16, record.payload[32..34], .little));
        cells += 1;
    };
    try std.testing.expectEqual(@as(usize, 4), cells);
    const info = try source.decodeDocInfo(a, 1000000);
    defer a.free(info);
    var resources = @import("hwp5/record.zig").Iterator.init(info, .{});
    var count: usize = 0;
    while (try resources.next()) |record| if (record.tag == 20) {
        count += 1;
        const fill = try @import("hwp5/docinfo/border_fill.zig").BorderFill.parse(record.payload);
        try std.testing.expectEqual(@as(u32, 0x563412), fill.fill.data.known.pattern.?.background);
        try std.testing.expectEqual(@as(u32, 0x674523), fill.borders[0].color);
    };
    try std.testing.expectEqual(@as(usize, 1), count);
}
fn hxStage(session: *hx.Session, history: *HxHistory) !u64 {
    var table = try @import("hwpx/created_table_prepare.zig").prepare(session, 0, 1, 0, 2, 2, 200, 20, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 });
    defer table.deinit(a);
    _ = try table.replaceText(a, 0, 1, "셀😀", 100);
    try std.testing.expect(try history.apply(session, .{ .kind = .created_table_stage, .section = 0, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "", .created_table = &table }));
    return table.identity;
}
fn hxRaw(saved: []const u8) !void {
    var reopened = try hx.open(a, saved, .{});
    defer reopened.deinit();
    const tree = &reopened.sections[0].tree;
    const uri = @import("hwpx/document_xml.zig").paragraph_uri;
    var cells: usize = 0;
    var owners: usize = 0;
    var selected_id: ?u32 = null;
    for (tree.elements, 0..) |element, node| {
        if (element.is(uri, "cellSz")) {
            const width = (try tree.attributeValue(a, node, "", "width")).?;
            const height = (try tree.attributeValue(a, node, "", "height")).?;
            try std.testing.expectEqual(@as(u32, if (cells == 1) 110 else 100), try @import("hwpx/table_xml_fields.zig").unsigned(a, width, 4096));
            try std.testing.expectEqual(@as(u32, if (cells == 1) 30 else 20), try @import("hwpx/table_xml_fields.zig").unsigned(a, height, 4096));
            cells += 1;
        }
        if (element.is(uri, "tc")) {
            const id = (try tree.attributeValue(a, node, "", "borderFillIDRef")).?;
            const value = try @import("hwpx/table_xml_fields.zig").unsigned(a, id, 4096);
            try std.testing.expect(if (owners == 1) value != 1 else value == 1);
            if (owners == 1) selected_id = value;
            owners += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 4), cells);
    try std.testing.expectEqual(@as(usize, 4), owners);
    var document = try @import("hwpx/package.zig").inspectDocument(a, saved, .{});
    defer document.deinit(a);
    var header = try document.readHeaderTree(a, .{});
    defer header.deinit(a);
    var resources: usize = 0;
    for (header.elements) |element| if (element.is(@import("hwpx/document_xml.zig").head_uri, "borderFill")) {
        resources += 1;
    };
    try std.testing.expectEqual(@as(usize, 2), resources);
    const node = try @import("hwpx/border_fill_resource_patch.zig").sourceNode(a, &header, selected_id.?);
    const observed = try @import("hwpx/border_fill_xml_patch.zig").observeSelected(a, &header, node, try @import("hwpx/table_cell_background_session.zig").profile(&reopened), .{ true, false, false, false }, true);
    try std.testing.expectEqual(@as(u32, 0x123456), observed.background.?.solid.color);
    try std.testing.expectEqual(@as(u32, 0x234567), observed.edges[0].color.?);
    try std.testing.expect(std.mem.indexOf(u8, header.sourceOf(node), "#123456") != null);
    try std.testing.expect(std.mem.indexOf(u8, header.sourceOf(node), "#234567") != null);
}
test "created cell persistence H5 own size appearance COW one history save raw fresh reopen undo redo" {
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
    const request = change(id, try session.historyTicket());
    const revision = history.revision();
    try std.testing.expect(try history.apply(session, .{ .edit_created_cell_properties = request }));
    try std.testing.expectEqual(revision + 1, history.revision());
    try std.testing.expectError(error.LayoutReflowRequired, session.save(a, .{}));
    const after = try h5Saved(session);
    defer a.free(after);
    try h5Raw(after);
    const reopened = try h5.Session.open(a, after);
    defer reopened.close();
    try std.testing.expectEqual(@as(usize, 0), try reopened.pendingTableCount(0));
    try std.testing.expect(try history.undo(session));
    const undone = try h5Saved(session);
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    try std.testing.expect(try history.redo(session));
    const redone = try h5Saved(session);
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
}
test "created cell persistence HX own size appearance COW one history save raw fresh reopen undo redo" {
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
    const request = change(id, try session.createdCellPropertiesTicket());
    const revision = history.revision();
    try std.testing.expect(try history.apply(&session, .{ .kind = .created_cell_properties, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .created_cell_properties = &request }));
    try std.testing.expectEqual(revision + 1, history.revision());
    const after = try session.save();
    defer a.free(after);
    try hxRaw(after);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
}
test "created cell persistence H5 stale restored frame refuses while valid prior redo and saved bytes remain" {
    const input = try @import("new_document/root.zig").hwp5(a);
    defer a.free(input);
    const session = try h5.Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var history = try H5History.initV2(a, session, .{});
    defer history.deinit();
    const id = try h5Stage(session, &history);
    const request = change(id, try session.historyTicket());
    try std.testing.expect(try history.apply(session, .{ .edit_created_cell_properties = request }));
    const after = try h5Saved(session);
    defer a.free(after);
    try std.testing.expect(try history.undo(session));
    const before = try h5Saved(session);
    defer a.free(before);
    try std.testing.expectError(error.StaleMutationEpoch, history.apply(session, .{ .edit_created_cell_properties = request }));
    const failed = try h5Saved(session);
    defer a.free(failed);
    try std.testing.expectEqualSlices(u8, before, failed);
    try std.testing.expect(try history.redo(session));
    const redone = try h5Saved(session);
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
}
test "created cell persistence HX stale restored frame refuses while valid prior redo and saved bytes remain" {
    const input = try @import("new_document/root.zig").hwpx(a);
    defer a.free(input);
    var session = try hx.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try HxHistory.initV2(&session, .{});
    defer history.deinit();
    const id = try hxStage(&session, &history);
    const request = change(id, try session.createdCellPropertiesTicket());
    try std.testing.expect(try history.apply(&session, .{ .kind = .created_cell_properties, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .created_cell_properties = &request }));
    const after = try session.save();
    defer a.free(after);
    try std.testing.expect(try history.undo(&session));
    const before = try session.save();
    defer a.free(before);
    try std.testing.expectError(error.StaleMutationEpoch, history.apply(&session, .{ .kind = .created_cell_properties, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .created_cell_properties = &request }));
    const failed = try session.save();
    defer a.free(failed);
    try std.testing.expectEqualSlices(u8, before, failed);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
}
test "created cell persistence geometry and appearance survive grid address movement without aliasing" {
    var source = try model.create(a, 17, 19, try @import("model/table_creation_plan.zig").create(2, 2, 200, 20, 4), &.{ 1, 2, 3, 4 }, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 4);
    defer source.deinit(a);
    const ticket: Ticket = .{ .binding = .{ .document = 1, .generation = 2, .owner = 3 }, .epoch = 4 };
    var prepared = (try @import("model/created_cell_properties_table.zig").prepare(a, &source, 0, ticket, change(17, ticket), 100000)).?;
    defer prepared.deinit(a);
    var edited = try @import("model/created_table_grid.zig").edit(a, &prepared, .{ .insert_column = 1 }, &.{ 5, 6 }, .{ .max_cells = 6, .max_text_bytes = 100000 });
    defer edited.deinit(a);
    try std.testing.expectEqual(@as(u32, 110), (try edited.cell(0, 2)).width);
    try std.testing.expectEqual(@as(u32, 30), (try edited.cell(0, 2)).height);
    try std.testing.expectEqual(@as(u32, 0x123456), edited.cell_properties[2].appearance.background.?.solid.color);
    try std.testing.expectEqual(@as(u32, 100), (try source.cell(0, 1)).width);
}
test "created cell persistence appearance only preserves original uniform grid resize policy" {
    var source = try model.create(a, 17, 19, try @import("model/table_creation_plan.zig").create(2, 2, 200, 20, 4), &.{ 1, 2, 3, 4 }, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 4);
    defer source.deinit(a);
    const ticket: Ticket = .{ .binding = .{ .document = 1, .generation = 2, .owner = 3 }, .epoch = 4 };
    var request = change(17, ticket);
    request.size = .{};
    var prepared = (try @import("model/created_cell_properties_table.zig").prepare(a, &source, 0, ticket, request, 100000)).?;
    defer prepared.deinit(a);
    var edited = try @import("model/created_table_grid.zig").edit(a, &prepared, .{ .insert_column = 1 }, &.{ 5, 6 }, .{ .max_cells = 6, .max_text_bytes = 100000 });
    defer edited.deinit(a);
    try std.testing.expectEqual(@as(u32, 200), (try edited.extent()).width);
    for (0..3) |column| try std.testing.expectEqual((try edited.plan.cell(0, @intCast(column))).width, (try edited.cell(0, @intCast(column))).width);
}
test "created cell persistence H5 repeated exact owned property no op keeps revision and full saved bytes" {
    const input = try @import("new_document/root.zig").hwp5(a);
    defer a.free(input);
    const session = try h5.Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var history = try H5History.initV2(a, session, .{});
    defer history.deinit();
    const id = try h5Stage(session, &history);
    const first = change(id, try session.historyTicket());
    try std.testing.expect(try history.apply(session, .{ .edit_created_cell_properties = first }));
    const before = try h5Saved(session);
    defer a.free(before);
    const revision = history.revision();
    var next = change(id, try session.historyTicket());
    next.expected = .{ .width = 110, .height = 30 };
    try std.testing.expect(!try history.apply(session, .{ .edit_created_cell_properties = next }));
    try std.testing.expectEqual(revision, history.revision());
    const after = try h5Saved(session);
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}
test "created cell persistence H5 COW zero resource clone dedup exact limit and one less atomic refusal" {
    const input = try @import("new_document/root.zig").hwp5(a);
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, 1000000);
    defer a.free(info);
    const original = try a.dupe(u8, info);
    defer a.free(original);
    const batch = @import("hwp5/edit/created_cell_resource_batch.zig");
    const requests = [_]batch.Request{ .{ .source_id = 0, .patch = .{ .background = .{ .solid = .{ .color = 0x123456 } } } }, .{ .source_id = 0, .patch = .{ .background = .{ .solid = .{ .color = 0x123456 } } } } };
    const result = try batch.write(a, info, source.header.version(), &requests, 1000000);
    defer a.free(result.bytes);
    defer a.free(result.ids);
    try std.testing.expectEqual(@as(usize, 1), result.border_count);
    try std.testing.expectEqual(@as(u16, 1), result.ids[0]);
    try std.testing.expectEqual(result.ids[0], result.ids[1]);
    const exact = try batch.write(a, info, source.header.version(), &requests, result.bytes.len);
    defer a.free(exact.bytes);
    defer a.free(exact.ids);
    try std.testing.expectEqualSlices(u8, result.bytes, exact.bytes);
    try std.testing.expectError(error.LimitExceeded, batch.write(a, info, source.header.version(), &requests, result.bytes.len - 1));
    try std.testing.expectEqualSlices(u8, original, info);
}
test "created cell persistence HX repeated exact owned property no op keeps revision and full saved bytes" {
    const input = try @import("new_document/root.zig").hwpx(a);
    defer a.free(input);
    var session = try hx.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try HxHistory.initV2(&session, .{});
    defer history.deinit();
    const id = try hxStage(&session, &history);
    const first = change(id, try session.createdCellPropertiesTicket());
    try std.testing.expect(try history.apply(&session, .{ .kind = .created_cell_properties, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .created_cell_properties = &first }));
    const before = try session.save();
    defer a.free(before);
    const revision = history.revision();
    var next = change(id, try session.createdCellPropertiesTicket());
    next.expected = .{ .width = 110, .height = 30 };
    try std.testing.expect(!try history.apply(&session, .{ .kind = .created_cell_properties, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .created_cell_properties = &next }));
    try std.testing.expectEqual(revision, history.revision());
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}
