//! Declared product regressions. This file has not been compiled or executed.
const std = @import("std");
const editor = @import("editor_session.zig");
const histories = @import("editor_history.zig");
const api = @import("note_create.zig");
const owner = @import("note_create_owner.zig");
const caret_api = @import("note_create_caret.zig");
const fixtures = @import("note_delete_fixtures.zig");
const Kind = @import("note_bodies.zig").Kind;
const a = std.testing.allocator;
const format: @import("note_create_profile.zig").Format = .{ .number_type = "DIGIT", .user_char = "", .prefix_char = "", .suffix_char = ")", .superscript = false };
const support = @import("note_create_test_support.zig");
const plain = @import("note_body_plain_text.zig");
const shape = support.shape;
const request = support.request;
const command = support.command;
const otherParts = support.otherParts;
const expectedError = support.expectedError;
const physicalHost = support.physicalHost;
fn lifecycle(allocator: std.mem.Allocator, kind: Kind, section_index: usize) !void {
    try lifecycleBody(allocator, kind, section_index, "새😀<&>\r\n본문", "새😀<&>\r\n본문쓰기");
}
fn lifecycleBody(allocator: std.mem.Allocator, kind: Kind, section_index: usize, body: []const u8, expected_typed: []const u8) !void {
    const input = try @import("inline_object_placement_fixture.zig").create(allocator);
    defer allocator.free(input);
    var session = try editor.open(allocator, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try histories.History.initV2(&session, .{});
    defer history.deinit();
    var observed = try owner.observe(&session, .{ .section = section_index, .paragraph = session.sections[section_index].first_paragraph }, 0, history.revision());
    defer observed.deinit(allocator);
    var receipt: caret_api.Receipt = .{ .section = 999, .paragraph_id = 999, .number = -1, .kind = kind };
    var create = request(&observed, kind, &receipt);
    create.body = body;
    const policies = [_]@import("note_create_policy.zig").Initial{ .{ .section = 0, .shape = shape(kind) }, .{ .section = 1, .shape = shape(kind) } };
    create.initial_policies = &policies;
    const before = try session.save();
    defer allocator.free(before);
    const count = history.revisionCount();
    const serial = session.mutation_serial;
    const pointer = session.source.ptr;
    const changed = history.apply(&session, command(&create)) catch |err| {
        try std.testing.expectEqual(count, history.revisionCount());
        try std.testing.expectEqual(serial, session.mutation_serial);
        try std.testing.expectEqual(pointer, session.source.ptr);
        try std.testing.expectEqual(@as(usize, 999), receipt.section);
        return err;
    };
    try std.testing.expect(changed);
    try std.testing.expectEqual(count + 1, history.revisionCount());
    try std.testing.expectEqual(section_index, receipt.section);
    try std.testing.expectEqual(@as(i32, 1), receipt.number);
    const saved = try session.save();
    defer allocator.free(saved);
    try otherParts(allocator, before, saved);
    var fresh = try editor.open(allocator, saved, .{});
    defer fresh.deinit();
    const reopened_caret = try caret_api.observe(&fresh, receipt, 0);
    const text = try plain.read(allocator, &fresh, section_index, reopened_caret.paragraph);
    defer allocator.free(text);
    try std.testing.expectEqualStrings(create.body, text);
    const expected_units = try @import("../model/independent_text_edits.zig").utf16Units(create.body);
    try std.testing.expectEqual(expected_units, reopened_caret.unit);
    // A source note still has an anchor prefix, including when body starts U+FFFC.
    const anchored = try fresh.anchorText(section_index, reopened_caret.paragraph);
    defer allocator.free(anchored);
    const expected_anchor = try std.mem.concat(allocator, u8, &.{ "\xef\xbf\xbc", create.body });
    defer allocator.free(expected_anchor);
    try std.testing.expectEqualStrings(expected_anchor, anchored);
    const caret = try caret_api.observe(&session, receipt, history.revision());
    try std.testing.expectEqual(expected_units, caret.unit);
    const typing_count = history.revisionCount();
    const typing = try caret_api.command(&session, caret, history.revision(), "쓰기");
    try std.testing.expectEqual(.plain, typing.kind);
    try std.testing.expectEqual(expected_units, typing.start);
    try std.testing.expect(try history.apply(&session, typing));
    try std.testing.expectEqual(typing_count + 1, history.revisionCount());
    try expectedError(error.StaleNoteCreateCaret, caret_api.command(&session, caret, history.revision(), "x"));
    // Read the live edited state before save, not just a reopened source view.
    const live_caret = try caret_api.observe(&session, receipt, history.revision());
    const live_text = try plain.read(allocator, &session, section_index, live_caret.paragraph);
    defer allocator.free(live_text);
    try std.testing.expectEqualStrings(expected_typed, live_text);
    try std.testing.expectEqual(try @import("../model/independent_text_edits.zig").utf16Units(expected_typed), live_caret.unit);
    const typed = try session.save();
    defer allocator.free(typed);
    var typed_fresh = try editor.open(allocator, typed, .{});
    defer typed_fresh.deinit();
    const typed_caret = try caret_api.observe(&typed_fresh, receipt, 0);
    const typed_text = try plain.read(allocator, &typed_fresh, section_index, typed_caret.paragraph);
    defer allocator.free(typed_text);
    try std.testing.expectEqualStrings(expected_typed, typed_text);
    try std.testing.expect(try history.undo(&session));
    const untyped = try session.save();
    defer allocator.free(untyped);
    try std.testing.expectEqualSlices(u8, saved, untyped);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer allocator.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    try expectedError(error.StaleNoteCreateOwner, history.apply(&session, command(&create)));
    try std.testing.expect(try history.redo(&session));
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer allocator.free(redone);
    try std.testing.expectEqualSlices(u8, typed, redone);
}
test "HWPX N02 create footnote actual package single history caret text save reopen both sections" {
    for (0..2) |section| try lifecycle(a, .foot, section);
}
test "HWPX N02 create endnote actual package single history caret text save reopen both sections" {
    for (0..2) |section| try lifecycle(a, .end, section);
}
test "HWPX N02 create package allocation failures do not publish owner receipt or history" {
    try @import("../testing/allocation_failures.zig").check(lifecycle, .{ Kind.foot, @as(usize, 1) });
}
test "HWPX N02 insert before existing note renumbers only following actual family" {
    for ([_]Kind{ .foot, .end }) |kind| {
        const input = try fixtures.create(a, if (kind == .foot) fixtures.foot ++ fixtures.foot_second ++ fixtures.end else fixtures.end ++ fixtures.end_second ++ fixtures.foot, fixtures.continuous);
        defer a.free(input);
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        session.history_delta_managed = true;
        var history = try histories.History.initV2(&session, .{});
        defer history.deinit();
        const sites = try @import("note_reference_sites.zig").read(a, &session, 0);
        defer a.free(sites);
        var observed = try owner.observe(&session, .{ .section = 0, .paragraph = sites[1].paragraph }, @intCast(sites[1].anchor_unit), history.revision());
        defer observed.deinit(a);
        var receipt: caret_api.Receipt = undefined;
        const create = request(&observed, kind, &receipt);
        try std.testing.expect(try history.apply(&session, command(&create)));
        try std.testing.expectEqual(@as(i32, 2), receipt.number);
        var numbers = try @import("automatic_number_snapshot.zig").read(a, &session.sections[0].tree);
        defer numbers.deinit(a);
        var expected: i32 = 1;
        for (numbers.rows) |row| {
            if (!std.mem.eql(u8, row.values.get(.num_type).?, if (kind == .foot) "FOOTNOTE" else "ENDNOTE")) continue;
            try std.testing.expectEqual(@as(?i32, expected), row.values.num);
            expected += 1;
        }
        try std.testing.expectEqual(@as(i32, 4), expected);
    }
}
test "HWPX N02 create source and pending generated cell retain canonical owner through undo" {
    for ([_]bool{ false, true }) |generated| {
        const input = try fixtures.twoSections(a, "");
        defer a.free(input);
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        const ids = try @import("created_table_source_ids.zig").plan(&session, 1);
        defer a.free(ids.paragraph_ids);
        var table = try @import("../model/created_table.zig").create(a, ids.identity, ids.instance_id, try @import("../model/table_creation_plan.zig").create(1, 1, 12000, 4000, 1), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 1);
        defer table.deinit(a);
        _ = try table.replaceText(a, 0, 0, "앞😀뒤", 1000);
        _ = try @import("created_table_session.zig").stage(&session, 1, session.sections[1].first_paragraph, 0, &table);
        if (!generated) {
            const materialized = try session.save();
            defer a.free(materialized);
            var reopened = try editor.open(a, materialized, .{});
            std.mem.swap(editor.Session, &session, &reopened);
            reopened.deinit();
        }
        session.history_delta_managed = true;
        var history = try histories.History.initV2(&session, .{});
        defer history.deinit();
        var identity_buffer: [20]u8 = undefined;
        const identity = try std.fmt.bufPrint(&identity_buffer, "{d}", .{ids.identity});
        var selector: @import("inline_object_placement.zig").Selector = .{ .section = 1 };
        if (generated) selector.created_cell = .{ .identity = identity, .row = 0, .column = 0 } else {
            const cells = try @import("table_display_bindings.zig").read(a, &session, 1);
            defer a.free(cells);
            try std.testing.expectEqual(@as(usize, 1), cells.len);
            selector.paragraph = cells[0].paragraph;
        }
        var observed = try owner.observe(&session, selector, 3, history.revision());
        defer observed.deinit(a);
        try std.testing.expectEqualStrings("앞😀뒤", observed.placement.text);
        const before = try session.save();
        defer a.free(before);
        var receipt: caret_api.Receipt = undefined;
        const create = request(&observed, .foot, &receipt);
        try std.testing.expect(try history.apply(&session, command(&create)));
        try std.testing.expect(receipt.paragraph_id != ids.paragraph_ids[0]);
        try std.testing.expect(receipt.paragraph_id != ids.instance_id);
        try std.testing.expectEqual(@as(usize, 0), session.sections[1].created_tables.entries.items.len);
        _ = try caret_api.observe(&session, receipt, history.revision());
        try std.testing.expect(try history.undo(&session));
        try std.testing.expectEqual(@as(usize, if (generated) 1 else 0), session.sections[1].created_tables.entries.items.len);
        const undone = try session.save();
        defer a.free(undone);
        try std.testing.expectEqualSlices(u8, before, undone);
    }
}

fn plainMatrix(kind: Kind) !void {
    const bodies = [_][]const u8{ "", "\r\n😀\t", "\t앞\t뒤\t", "\xef\xbf\xbc", "\xef\xbf\xbc앞😀\r\n\t뒤\xef\xbf\xbc" };
    for (bodies) |body| {
        const typed = try std.mem.concat(a, u8, &.{ body, "쓰기" });
        defer a.free(typed);
        for (0..2) |section| try lifecycleBody(a, kind, section, body, typed);
    }
}
test "HWPX N02 plain body footnote empty CRLF emoji tabs literal UFFFC lifecycle" {
    try plainMatrix(.foot);
}
test "HWPX N02 plain body endnote empty CRLF emoji tabs literal UFFFC lifecycle" {
    try plainMatrix(.end);
}
test "HWPX N02 plain body allocation failures preserve empty body history receipt" {
    try @import("../testing/allocation_failures.zig").check(lifecycleBody, .{ Kind.foot, @as(usize, 1), @as([]const u8, ""), @as([]const u8, "쓰기") });
}
