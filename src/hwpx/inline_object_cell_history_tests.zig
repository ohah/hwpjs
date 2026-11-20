//! Synthetic declared tests; Native execution requires a frozen Main slot.
const std = @import("std");
const editor = @import("editor_session.zig");
const History = @import("editor_history.zig").History;
const placement = @import("inline_object_placement.zig");
const Kind = @import("chart_plot_kind.zig").Kind;
const chart_cases = @import("chart_create_kinds_tests.zig");

fn exercise(a: std.mem.Allocator, generated: bool, section_index: usize, chart: bool, kind: ?Kind) !void {
    const input = try @import("inline_object_placement_fixture.zig").create(a);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const ids = try @import("created_table_source_ids.zig").plan(&session, 4);
    defer a.free(ids.paragraph_ids);
    var table = try @import("../model/created_table.zig").create(a, ids.identity, ids.instance_id, try @import("../model/table_creation_plan.zig").create(2, 2, 20000, 4000, 4), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 4);
    defer table.deinit(a);
    _ = try table.replaceText(a, 0, 1, "앞😀\n뒤", 1000);
    _ = try table.replaceText(a, 1, 0, "preserve sibling", 1000);
    _ = try @import("created_table_session.zig").stage(&session, section_index, session.sections[section_index].first_paragraph, 0, &table);
    if (!generated) {
        const saved = try session.save();
        defer a.free(saved);
        var source = try editor.open(a, saved, .{});
        std.mem.swap(editor.Session, &session, &source);
        source.deinit();
    }
    var identity_buffer: [20]u8 = undefined;
    const identity = try std.fmt.bufPrint(&identity_buffer, "{d}", .{ids.identity});
    const binding: placement.Binding = .{ .session = "s1", .revision = 0, .serial = "0" };
    var selector: placement.Selector = .{ .section = section_index };
    if (generated) selector.created_cell = .{ .identity = identity, .row = 0, .column = 1 } else {
        const bindings = try @import("table_display_bindings.zig").read(a, &session, section_index);
        defer a.free(bindings);
        for (bindings) |value| if (value.owner.cell.row == 0 and value.owner.cell.column == 1) {
            selector.paragraph = value.paragraph;
            break;
        };
        if (selector.paragraph == null) return error.MissingTestCell;
    }
    var observed = try placement.current(&session, selector, binding);
    defer observed.deinit(a);
    try std.testing.expectEqualStrings("앞😀\n뒤", observed.text);
    session.history_delta_managed = true;
    var history = try History.initV2(&session, .{});
    defer history.deinit();
    const before = try session.save();
    defer a.free(before);
    const revisions = history.revisionCount();
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(before, &digest, .{});
    const target: @import("inline_object_insert.zig").Target = .{ .section = section_index, .paragraph = selector.paragraph orelse 0, .owner = observed.owner, .unit = 3, .expected_text = observed.text };
    if (chart) {
        const request: @import("chart_create.zig").Request = .{ .expected_source_sha256 = digest, .target = target, .size = .{ .width = 6000, .height = 2000 }, .chart = if (kind) |k| chart_cases.profileFor(k) else null, .data = if (kind) |k| chart_cases.dataFor(k) else .{ .categories = &.{"A"}, .series = &.{.{ .name = "S", .values = &.{"1"} }} } };
        try std.testing.expect(try history.apply(&session, .{ .kind = .chart_create, .section = section_index, .paragraph = target.paragraph, .start = 3, .deleted = 0, .inserted = "", .chart_create = &request }));
    } else {
        const request: @import("equation_insert.zig").Request = .{ .expected_source_sha256 = digest, .target = target, .script = "x+y", .width = 3000, .height = 1000, .base_line = 80, .base_unit = 1000, .version = "Equation Version 60", .font = "HYhwpEQ" };
        try std.testing.expect(try history.apply(&session, .{ .kind = .equation_insert, .section = section_index, .paragraph = target.paragraph, .start = 3, .deleted = 0, .inserted = "", .equation_insert = &request }));
    }
    try std.testing.expectEqual(revisions + 1, history.revisionCount());
    // Explicit verified transition, not duplicate typed and physical owners.
    try std.testing.expectEqual(@as(usize, 0), session.sections[section_index].created_tables.entries.items.len);
    const after = try session.save();
    defer a.free(after);
    var reopened = try editor.open(a, after, .{});
    defer reopened.deinit();
    if (kind) |k| {
        var archive = try @import("../zip/archive.zig").open(a, after, .{});
        defer archive.deinit();
        const xml = try archive.decode(archive.find("Chart/hwpjs-created-0.xml").?, 8000000);
        defer a.free(xml);
        try chart_cases.reopen(a, xml, chart_cases.profileFor(k), chart_cases.dataFor(k));
    }
    const resaved = try reopened.save();
    defer a.free(resaved);
    try std.testing.expectEqualSlices(u8, after, resaved);
    try std.testing.expect(try history.undo(&session));
    try std.testing.expectEqual(@as(usize, if (generated) 1 else 0), session.sections[section_index].created_tables.entries.items.len);
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
}

test "HWPX inline placement generated and source cell equation one history edge both sections" {
    for ([_]bool{ false, true }) |generated| for (0..2) |section| try exercise(std.testing.allocator, generated, section, false, null);
}
test "HWPX inline placement generated and source cell chart one history edge both sections" {
    for ([_]bool{ false, true }) |generated| for (0..2) |section| try exercise(std.testing.allocator, generated, section, true, null);
}
test "HWPX inline placement generated cell equation ownership allocation failures" {
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            try exercise(a, true, 1, false, null);
        }
    }.run, .{});
}

test "HWPX inline placement all sixteen kinds original generated cells both sections persist exact series" {
    for (std.meta.tags(Kind)) |kind| for ([_]bool{ false, true }) |generated| for (0..2) |section|
        try exercise(std.testing.allocator, generated, section, true, kind);
}
