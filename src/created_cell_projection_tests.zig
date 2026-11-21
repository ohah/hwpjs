//! Separate source-prepared cohort: actual Native projection and saved raw owner parity.
const std = @import("std");
const a = std.testing.allocator;
const Table = @import("model/created_table.zig");
fn verify(comptime h5: bool, comptime distinct: bool) !void {
    const input = if (h5) try @import("new_document/root.zig").hwp5(a) else try @import("new_document/root.zig").hwpx(a);
    defer a.free(input);
    const Session = if (h5) @import("hwp5/edit/style_preservation.zig").Session else @import("hwpx/editor_session.zig").Session;
    const History = if (h5) @import("hwp5/edit/editor_history.zig").History else @import("hwpx/editor_history.zig").History;
    var hx_session: if (h5) void else Session = if (h5) {} else try @import("hwpx/editor_session.zig").open(a, input, .{});
    const session = if (h5) try Session.open(a, input) else &hx_session;
    defer {
        if (h5) session.close() else session.deinit();
    }
    if (h5) session.enableHistoryDelta() else session.history_delta_managed = true;
    var history = if (h5) try History.initV2(a, session, .{}) else try History.initV2(session, .{});
    defer history.deinit();
    var table = if (h5) block: {
        var ids = try session.planTableIdsWithAllocator(a, 4);
        defer ids.deinit(a);
        break :block try Table.create(a, ids.identity, ids.instance_id, try @import("model/table_creation_plan.zig").create(2, 2, 200, 20, 4), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 0 }, 4);
    } else try @import("hwpx/created_table_prepare.zig").prepare(session, 0, 1, 0, 2, 2, 200, 20, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 });
    defer table.deinit(a);
    if (h5) {
        try std.testing.expect(try history.apply(session, .{ .stage_table = .{ .section = 0, .paragraph = 0, .unit = 16, .table = &table, .options = @import("new_document/hwp5_profile_test_options.zig").creationOptions() } }));
    } else {
        try std.testing.expect(try history.apply(session, .{ .kind = .created_table_stage, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "", .created_table = &table }));
    }
    var request: @import("model/created_cell_properties_values.zig").Request = .{ .address = .{ .section = 0, .identity = table.identity, .row = 0, .column = 1 }, .expected_ticket = if (h5) try session.historyTicket() else try session.createdCellPropertiesTicket(), .expected = .{ .width = 100, .height = 20 }, .size = .{ .width = 110, .height = 30 }, .appearance = .{ .background = .{ .solid = .{ .color = 0x123456 } } } };
    request.appearance.border.edges[0] = .{ .style = .SOLID, .width_hundredth_mm = 10, .color = 0x234567 };
    if (h5) {
        try std.testing.expect(try history.apply(session, .{ .edit_created_cell_properties = request }));
    } else {
        try std.testing.expect(try history.apply(session, .{ .kind = .created_cell_properties, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .created_cell_properties = &request }));
    }
    if (distinct) {
        request.size = .{};
        request.address.row = 1;
        for (0..2) |column| {
            request.address.column = @intCast(column);
            request.expected_ticket = if (h5) try session.historyTicket() else try session.createdCellPropertiesTicket();
            if (column == 1) request.appearance.background = .{ .solid = .{ .color = 0x654321 } };
            if (h5) {
                try std.testing.expect(try history.apply(session, .{ .edit_created_cell_properties = request }));
            } else {
                try std.testing.expect(try history.apply(session, .{ .kind = .created_cell_properties, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .created_cell_properties = &request }));
            }
        }
    }
    const before = if (h5) (try session.save(a, .{ .allow_stale_layout = true })).bytes else try session.save();
    defer a.free(before);
    const revision = history.revision();
    const ticket = if (h5) try session.historyTicket() else try session.createdCellPropertiesTicket();
    var stats: @import("model/created_cell_properties_projection.zig").Stats = .{};
    const styles = try session.createdCellPropertyStylesWithStats(a, &stats);
    try std.testing.expectEqual(@as(usize, 1), stats.document_prepares);
    try std.testing.expectEqual(@as(usize, 4), stats.cells);
    try std.testing.expectEqual(@as(usize, if (distinct) 3 else 2), stats.resolved_resources);
    defer @import("model/created_cell_properties_projection.zig").deinit(a, styles);
    try std.testing.expectEqual(@as(usize, 4), styles.len);
    try std.testing.expectEqual(@as(u32, 0x123456), styles[1].value.background.?.solid.color);
    try std.testing.expectEqual(@as(u32, 0x234567), styles[1].value.edges[0].color.?);
    try std.testing.expect(styles[1].effects_supported);
    if (distinct) {
        try std.testing.expectEqual(styles[1].resource_id, styles[2].resource_id);
        try std.testing.expectEqualSlices(u8, &styles[1].raw_sha256, &styles[2].raw_sha256);
        try std.testing.expect(styles[1].resource_id != styles[3].resource_id);
        try std.testing.expectEqual(@as(u32, 0x654321), styles[3].value.background.?.solid.color);
        try std.testing.expect(!std.mem.eql(u8, &styles[1].raw_sha256, &styles[3].raw_sha256));
    }
    var digest: [32]u8 = undefined;
    if (h5) {
        var source = try @import("hwp5/text_source.zig").Source.open(a, before);
        defer source.deinit();
        const raw = try source.decodeDocInfo(a, 1000000);
        defer a.free(raw);
        var resources = try @import("hwp5/edit/cell_background_write.zig").resourceIndex(a, raw, source.header.version(), 1000000);
        defer resources.deinit(a);
        const payload = (try resources.resource(@intCast(styles[1].resource_id))).payload;
        std.crypto.hash.sha2.Sha256.hash(payload, &digest, .{});
    } else {
        var document = try @import("hwpx/package.zig").inspectDocument(a, before, .{});
        defer document.deinit(a);
        var header = try document.readHeaderTree(a, .{});
        defer header.deinit(a);
        const node = try @import("hwpx/border_fill_resource_patch.zig").sourceNode(a, &header, styles[1].resource_id);
        std.crypto.hash.sha2.Sha256.hash(header.sourceOf(node), &digest, .{});
    }
    const hex = std.fmt.bytesToHex(digest, .lower);
    try std.testing.expectEqualSlices(u8, &hex, &styles[1].raw_sha256);
    const after = if (h5) (try session.save(a, .{ .allow_stale_layout = true })).bytes else try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqual(revision, history.revision());
    try std.testing.expectEqualDeep(ticket, if (h5) try session.historyTicket() else try session.createdCellPropertiesTicket());
    try std.testing.expect(try history.undo(session));
    try std.testing.expect(try history.redo(session));
    const restored = try session.createdCellPropertyStyles(a);
    defer @import("model/created_cell_properties_projection.zig").deinit(a, restored);
    try std.testing.expectEqualSlices(u8, &styles[1].raw_sha256, &restored[1].raw_sha256);
}
test "created cell projection H5 effective COW raw digest query no mutation and undo redo" {
    try verify(true, false);
}
test "created cell projection HX effective COW raw digest query no mutation and undo redo" {
    try verify(false, false);
}

test "created cell projection H5 repeated resource memo and distinct resource colors preserve owner" {
    try verify(true, true);
}
test "created cell projection HX repeated resource memo and distinct resource colors preserve owner" {
    try verify(false, true);
}
test "created cell projection HX canonical resource index owner duplicate and count semantics" {
    const header = @import("hwpx/header_tree.zig");
    const resource = @import("hwpx/border_fill_resource_patch.zig");
    const prefix = "<hh:head xmlns:hh='http://www.hancom.co.kr/hwpml/2011/head'><hh:refList>";
    const suffix = "</hh:refList></hh:head>";
    const bodies = [_][]const u8{
        "<hh:borderFills itemCnt='2'><hh:borderFill id='1'/><hh:borderFill id='2'/></hh:borderFills><hh:other><hh:borderFill id='1'/></hh:other>",
        "<hh:borderFills itemCnt='2'><hh:borderFill id='1'/><hh:borderFill id='1'/></hh:borderFills>",
        "<hh:borderFills itemCnt='3'><hh:borderFill id='1'/><hh:borderFill id='2'/></hh:borderFills>",
        "<hh:borderFills itemCnt='0'/><hh:borderFills itemCnt='0'/>",
    };
    for (bodies, 0..) |body, i| {
        const raw = try std.mem.concat(a, u8, &.{ prefix, body, suffix });
        defer a.free(raw);
        var tree = try header.parse(a, raw, 0, .{});
        defer tree.deinit(a);
        if (i == 0) {
            var index = try resource.resourceIndex(a, &tree);
            defer index.deinit();
            try std.testing.expectEqual(@as(usize, 2), index.nodes.count());
            try std.testing.expectEqual(try resource.sourceNode(a, &tree, 1), try index.source(1));
            try std.testing.expectError(error.MissingBorderFillId, index.source(3));
        } else try std.testing.expectError(switch (i) {
            1 => error.DuplicateBorderFillId,
            2 => error.BorderFillCountMismatch,
            else => error.DuplicateBorderFills,
        }, resource.resourceIndex(a, &tree));
    }
}

fn multisection(comptime h5: bool) !void {
    const input = try @import("created_cell_projection_multisection_fixture.zig").create(a, h5);
    defer a.free(input);
    const Session = if (h5) @import("hwp5/edit/style_preservation.zig").Session else @import("hwpx/editor_session.zig").Session;
    const History = if (h5) @import("hwp5/edit/editor_history.zig").History else @import("hwpx/editor_history.zig").History;
    var hx_session: if (h5) void else Session = if (h5) {} else try @import("hwpx/editor_session.zig").open(a, input, .{});
    const session = if (h5) try Session.open(a, input) else &hx_session;
    defer {
        if (h5) session.close() else session.deinit();
    }
    if (h5) session.enableHistoryDelta() else session.history_delta_managed = true;
    var history = if (h5) try History.initV2(a, session, .{}) else try History.initV2(session, .{});
    defer history.deinit();
    var stats: @import("model/created_cell_properties_projection.zig").Stats = .{};
    const empty = try session.createdCellPropertyStylesWithStats(a, &stats);
    defer @import("model/created_cell_properties_projection.zig").deinit(a, empty);
    try std.testing.expectEqual(@as(usize, 0), empty.len);
    try std.testing.expectEqual(@as(usize, 0), stats.document_prepares);
    var ids: [2]u64 = undefined;
    for (0..2) |section| {
        const paragraph: usize = if (h5) 0 else ordinal: {
            var current = try @import("hwpx/display_current_paragraphs.zig").read(a, &session.sections[section], session.options);
            defer current.deinit(a);
            // The two own factory sections each contain exactly one real body paragraph.
            try std.testing.expectEqual(@as(usize, 1), current.paragraphs.len);
            const first = session.sections[section].first_paragraph;
            try std.testing.expect(first > 0);
            const anchor = @import("hwpx/created_table_anchor.zig");
            try std.testing.expectError(error.InvalidParagraphIndex, anchor.capture(a, session, section, first - 1, 0));
            try std.testing.expectError(error.InvalidParagraphIndex, anchor.capture(a, session, section, first + current.paragraphs.len, 0));
            const admitted = try anchor.capture(a, session, section, first, 0);
            try std.testing.expectEqual(section, admitted.section);
            break :ordinal first;
        };
        var table = if (h5) block: {
            var plan = try session.planTableIdsWithAllocator(a, 1);
            defer plan.deinit(a);
            break :block try Table.create(a, plan.identity, plan.instance_id, try @import("model/table_creation_plan.zig").create(1, 1, 14400, 7200, 1), plan.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 0 }, 1);
        } else try @import("hwpx/created_table_prepare.zig").prepare(session, section, paragraph, 0, 1, 1, 14400, 7200, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 });
        defer table.deinit(a);
        ids[section] = table.identity;
        if (h5) {
            try std.testing.expect(try history.apply(session, .{ .stage_table = .{ .section = section, .paragraph = 0, .unit = 16, .table = &table, .options = @import("new_document/hwp5_profile_test_options.zig").creationOptions() } }));
        } else {
            try std.testing.expect(try history.apply(session, .{ .kind = .created_table_stage, .section = section, .paragraph = paragraph, .start = 0, .deleted = 0, .inserted = "", .created_table = &table }));
        }
    }
    const baseline = try session.createdCellPropertyStylesWithStats(a, &stats);
    defer @import("model/created_cell_properties_projection.zig").deinit(a, baseline);
    try std.testing.expectEqual(@as(usize, 1), stats.document_prepares);
    try std.testing.expectEqual(@as(usize, 1), stats.resolved_resources);
    try std.testing.expectEqual(@as(usize, 2), stats.cells);
    const ticket = if (h5) try session.historyTicket() else try session.createdCellPropertiesTicket();
    const request: @import("model/created_cell_properties_values.zig").Request = .{ .address = .{ .section = 1, .identity = ids[1], .row = 0, .column = 0 }, .expected_ticket = ticket, .expected = .{ .width = 14400, .height = 7200 }, .size = .{ .height = 9000 }, .appearance = .{ .background = .{ .solid = .{ .color = 0x123456 } } } };
    if (h5) {
        try std.testing.expect(try history.apply(session, .{ .edit_created_cell_properties = request }));
    } else {
        try std.testing.expect(try history.apply(session, .{ .kind = .created_cell_properties, .section = 1, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .created_cell_properties = &request }));
    }
    const changed = try session.createdCellPropertyStylesWithStats(a, &stats);
    defer @import("model/created_cell_properties_projection.zig").deinit(a, changed);
    try std.testing.expectEqual(@as(usize, 1), stats.document_prepares);
    try std.testing.expectEqual(@as(usize, 2), stats.resolved_resources);
    try std.testing.expectEqual(@as(u32, 0), changed[0].section);
    try std.testing.expectEqualSlices(u8, &baseline[0].raw_sha256, &changed[0].raw_sha256);
    try std.testing.expectEqual(@as(u32, 1), changed[1].section);
    try std.testing.expectEqual(@as(u32, 0x123456), changed[1].value.background.?.solid.color);
    try std.testing.expect(try history.undo(session));
    const undone = try session.createdCellPropertyStylesWithStats(a, &stats);
    defer @import("model/created_cell_properties_projection.zig").deinit(a, undone);
    try std.testing.expectEqual(@as(usize, 1), stats.document_prepares);
    try std.testing.expectEqual(@as(usize, 1), stats.resolved_resources);
    try std.testing.expect(try history.redo(session));
    const redone = try session.createdCellPropertyStylesWithStats(a, &stats);
    defer @import("model/created_cell_properties_projection.zig").deinit(a, redone);
    try std.testing.expectEqualSlices(u8, &changed[1].raw_sha256, &redone[1].raw_sha256);
}
test "created cell projection H5 two real sections prepare once empty early return and peer section preservation" {
    try multisection(true);
}
test "created cell projection HX two real sections prepare once empty early return and peer section preservation" {
    try multisection(false);
}
