//! Focused original-cell solid background contracts. Not executed without the main heavy slot.
const std = @import("std");
const t = std.testing;
const editor = @import("editor_session.zig");
const background = @import("table_cell_background_session.zig");
const borders = @import("table_border_sources.zig");
const resources = @import("border_fill_resource_patch.zig");
const history_mod = @import("editor_history.zig");
const fixture = "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwpx";

fn select(session: *const editor.Session, source_id: u32) !struct { owner: background.Owner, paragraph: usize } {
    const a = session.allocator;
    const bindings = try @import("table_display_bindings.zig").read(a, session, 0);
    defer a.free(bindings);
    for (bindings) |binding| {
        const owner = try background.target(session, 0, binding.owner.table_node, binding.owner.list_node);
        if (owner.source_id == source_id) return .{ .owner = owner, .paragraph = binding.paragraph };
    }
    return error.MissingTestCell;
}
fn command(owner: background.Owner, requested_color: u32) history_mod.Command {
    return .{ .kind = .cell_background, .section = owner.section, .table_node = owner.table_node, .list_node = owner.list_node, .cell_background_color = requested_color, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "" };
}
fn selected(report: *const borders.Report, list_node: usize) !borders.Cell {
    for (report.cells) |cell| if (cell.list_node == list_node) return cell;
    return error.MissingTestCell;
}
fn color(report: *const borders.Report, list_node: usize) !u32 {
    const cell = try selected(report, list_node);
    const style = report.styles[cell.style_index orelse return error.MissingTestStyle];
    const faces = style.semantic_face_colors orelse return error.MissingTestColor;
    if (faces.len != 1) return error.MissingTestColor;
    return faces[0].rgb orelse error.MissingTestColor;
}

// Noori source3 is shared by24 cells. Only the selected cell may point at a clone.
test "HWPX cell background Noori live projection COW save reopen undo redo" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const target = try select(&session, 3);
    var before = try borders.read(a, &session, 0);
    defer before.deinit(a);
    var history = try history_mod.History.init(&session, 8, 8_000_000);
    defer history.deinit();
    const change = command(target.owner, 0x123456);
    try t.expect(try history.apply(&session, change));
    try t.expect(!try history.apply(&session, change));
    var live = try borders.read(a, &session, 0);
    defer live.deinit(a);
    const live_cell = try selected(&live, target.owner.list_node);
    try t.expect(live_cell.border_fill_id != target.owner.source_id);
    try t.expectEqual(@as(u32, 0x123456), try color(&live, target.owner.list_node));
    try t.expectEqual(before.cells.len, live.cells.len);
    for (before.cells, live.cells) |old, now| {
        try t.expectEqual(old.cell_node, now.cell_node);
        try t.expectEqual(old.list_node, now.list_node);
        if (old.list_node != target.owner.list_node) try t.expectEqual(old.border_fill_id, now.border_fill_id);
    }
    // Source bindings remain original identities; the border report owns current refs.
    const bound = try background.target(&session, 0, target.owner.table_node, target.owner.list_node);
    try t.expectEqual(target.owner.cell_node, bound.cell_node);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    var after = try borders.read(a, &reopened, 0);
    defer after.deinit(a);
    try t.expectEqual(live_cell.border_fill_id, (try selected(&after, target.owner.list_node)).border_fill_id);
    try t.expectEqual(@as(u32, 0x123456), try color(&after, target.owner.list_node));
    var old_package = try @import("package.zig").inspectDocument(a, input, .{});
    defer old_package.deinit(a);
    var new_package = try @import("package.zig").inspectDocument(a, saved, .{});
    defer new_package.deinit(a);
    var old_header = try old_package.readHeaderTree(a, .{});
    defer old_header.deinit(a);
    var new_header = try new_package.readHeaderTree(a, .{});
    defer new_header.deinit(a);
    // Every original BorderFill template is byte-preserved, not just the shared one.
    for (old_header.elements, 0..) |element, index| {
        if (!element.is(@import("document_xml.zig").head_uri, "borderFill")) continue;
        const id = try resources.id(a, &old_header, index);
        const unchanged = try resources.sourceNode(a, &new_header, id);
        try t.expectEqualSlices(u8, old_header.sourceOf(index), new_header.sourceOf(unchanged));
    }
    try t.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try t.expectEqualSlices(u8, input, undone);
    try t.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try t.expectEqualSlices(u8, saved, redone);
    try t.expectEqualSlices(u8, input, session.source);
}

test "HWPX cell background strict tuple RGB no-op redo and save failure rollback" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const target = (try select(&session, 18)).owner;
    try t.expectError(error.InvalidSectionIndex, session.setCellBackground(session.sections.len, target.table_node, target.list_node, 0));
    try t.expectError(error.InvalidCellBackgroundOwner, session.setCellBackground(0, target.table_node + 1, target.list_node, 0));
    try t.expectError(error.InvalidCellBackgroundOwner, session.setCellBackground(0, target.table_node, session.sections[0].tree.elements.len, 0));
    try t.expectError(error.InvalidCharacterColor, session.setCellBackground(0, target.table_node, target.list_node, 0x1000000));
    const old_limit = session.options.max_output_bytes;
    session.options.max_output_bytes = 1;
    try t.expectError(error.LimitExceeded, session.setCellBackground(0, target.table_node, target.list_node, 0x123456));
    session.options.max_output_bytes = old_limit;
    try t.expectEqual(@as(usize, 0), session.cell_backgrounds.items.len);
    var history = try history_mod.History.init(&session, 4, 8_000_000);
    defer history.deinit();
    try t.expect(try history.apply(&session, command(target, 0x123456)));
    try t.expect(try history.undo(&session));
    try t.expect(!try history.apply(&session, command(target, 0xf2f2f2)));
    try t.expect(try history.redo(&session));
    var malformed = command(target, 0x123456);
    malformed.inserted = "x";
    try t.expectError(error.InvalidCellBackgroundCommand, history.apply(&session, malformed));
}

test "HWPX cell background char para COW mixed order current refs agree with reopen" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    for ([_]bool{ false, true }) |cell_first| {
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        const target = try select(&session, 18);
        if (cell_first) try t.expect(try session.setCellBackground(0, target.owner.table_node, target.owner.list_node, 0x123456));
        try t.expect(try session.setCharacterProperties(0, target.paragraph, 0, 1, .{ .border_fill = .{ .background = .{ .solid = .{ .color = 0x234567 } } } }));
        try t.expect(try @import("paragraph_border_fill_session.zig").apply(&session, 0, target.paragraph, .{ .background = .{ .solid = .{ .color = 0x345678 } } }, .{}));
        if (!cell_first) try t.expect(try session.setCellBackground(0, target.owner.table_node, target.owner.list_node, 0x123456));
        var live = try borders.read(a, &session, 0);
        defer live.deinit(a);
        try t.expectEqual(@as(u32, 0x123456), try color(&live, target.owner.list_node));
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        var after = try borders.read(a, &reopened, 0);
        defer after.deinit(a);
        try t.expectEqual((try selected(&live, target.owner.list_node)).border_fill_id, (try selected(&after, target.owner.list_node)).border_fill_id);
        try t.expectEqual(@as(u32, 0x123456), try color(&after, target.owner.list_node));
        try t.expectEqualSlices(u8, input, session.source);
    }
}

// Small synthetic XML only: targeted allocation cleanup and shifted cell-size composition.
test "HWPX cell background reference writer allocation failures preserve other cell and text" {
    const a = t.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
    const original = prefix ++ "<p:tbl><p:tr><p:tc borderFillIDRef='3'><p:cellSz width='1' height='2'/><p:subList><p:p><p:run><p:t>A</p:t></p:run></p:p></p:subList></p:tc><p:tc borderFillIDRef='3'><p:subList/></p:tc></p:tr></p:tbl></s:sec>";
    const changed = prefix ++ "<p:tbl><p:tr><p:tc borderFillIDRef='3'><p:cellSz width='9' height='2'/><p:subList><p:p><p:run><p:t>긴😀</p:t></p:run></p:p></p:subList></p:tc><p:tc borderFillIDRef='3'><p:subList/></p:tc></p:tr></p:tbl></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, original, 0, 0, .{});
    defer tree.deinit(a);
    try t.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("xml_part_tree.zig").Tree, xml: []const u8) !void {
            const bytes = try @import("table_cell_background_save.zig").section(allocator, source, xml, &.{.{ .section = 0, .table_node = 1, .cell_node = 3, .list_node = 5, .source_id = 3, .color = 0x123456 }}, &.{20}, &.{0}, 0, 4096);
            defer allocator.free(bytes);
            try t.expect(std.mem.indexOf(u8, bytes, "<p:tc borderFillIDRef='20'>") != null);
            try t.expect(std.mem.indexOf(u8, bytes, "<p:tc borderFillIDRef='3'><p:subList/>") != null);
            try t.expect(std.mem.indexOf(u8, bytes, "긴😀") != null);
            try t.expect(std.mem.indexOf(u8, bytes, "width='9'") != null);
        }
    }.run, .{ &tree, changed });
}

test "HWPX cell background V2 checkpoint owns live refs and same-color no-op keeps redo" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const target = (try select(&session, 18)).owner;
    var history = try history_mod.History.initV2(&session, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000, .max_retained_bytes = 32_000_000 });
    defer history.deinit();
    try t.expect(try history.apply(&session, command(target, 0x123456)));
    var live = try borders.read(a, &session, 0);
    defer live.deinit(a);
    try t.expectEqual(@as(u32, 0x123456), try color(&live, target.list_node));
    try t.expect(try history.undo(&session));
    try t.expectEqual(@as(usize, 0), session.cell_backgrounds.items.len);
    try t.expect(!try history.apply(&session, command(target, 0xf2f2f2)));
    try t.expect(try history.redo(&session));
    var redone = try borders.read(a, &session, 0);
    defer redone.deinit(a);
    try t.expectEqual(@as(u32, 0x123456), try color(&redone, target.list_node));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    var after = try borders.read(a, &reopened, 0);
    defer after.deinit(a);
    try t.expectEqual(@as(u32, 0x123456), try color(&after, target.list_node));
}

test "HWPX cell background batch indexes once reuses same source color and appends once" {
    const a = t.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><h:refList><h:borderFills itemCnt='1'><h:borderFill id='3' opaque='preserve'><h:leftBorder type='SOLID' width='0.12 mm' color='#000000'/></h:borderFill></h:borderFills></h:refList></h:head>";
    var tree = try @import("header_tree.zig").parse(a, input, 0, .{});
    defer tree.deinit(a);
    var stats: resources.SolidBatchStats = .{};
    const result = try resources.writeSolidBatch(a, &tree, &.{ .{ .source_id = 3, .color = 0x123456 }, .{ .source_id = 3, .color = 0x123456 }, .{ .source_id = 3, .color = 0x654321 }, .{ .source_id = 3, .color = 0x123456 } }, 8000, .{ .id = "synthetic-verified-rgb", .verified = true }, &stats);
    defer a.free(result.bytes);
    defer a.free(result.ids);
    try t.expectEqual(@as(usize, 1), stats.resources);
    try t.expectEqual(@as(usize, 2), stats.fragments);
    try t.expectEqual(@as(usize, 2), stats.reused);
    try t.expectEqual(@as(usize, 1), stats.header_writes);
    try t.expectEqual(result.ids[0], result.ids[1]);
    try t.expectEqual(result.ids[0], result.ids[3]);
    try t.expect(result.ids[0] != result.ids[2]);
    var after = try @import("header_tree.zig").parse(a, result.bytes, 0, .{});
    defer after.deinit(a);
    try t.expectEqualSlices(u8, tree.sourceOf(try resources.sourceNode(a, &tree, 3)), after.sourceOf(try resources.sourceNode(a, &after, 3)));
    const source = try resources.sourceNode(a, &after, result.ids[0]);
    const observed = try @import("border_fill_xml_patch.zig").observeSelected(a, &after, source, .{ .verified = true }, @splat(false), true);
    try t.expectEqual(@as(u32, 0x123456), observed.background.?.solid.color);
}

test "HWPX cell background batch live COW duplicates invalid precedence and bounded OOM" {
    const a = t.allocator;
    const batch = @import("table_border_sources_batch.zig");
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const target = try select(&session, 3);
    try t.expect(try session.setCellBackground(0, target.owner.table_node, target.owner.list_node, 0x123456));
    var current = try borders.read(a, &session, 0);
    defer current.deinit(a);
    const expected = try std.json.Stringify.valueAlloc(a, current, .{});
    defer a.free(expected);
    var counter = std.testing.FailingAllocator.init(a, .{});
    var result = try batch.read(counter.allocator(), &session, &.{ 0, 0, session.sections.len });
    const allocation_count = counter.alloc_index;
    for (result.entries[0..2]) |entry| {
        const actual = try std.json.Stringify.valueAlloc(a, entry.result.value, .{});
        defer a.free(actual);
        try t.expectEqualStrings(expected, actual);
        try t.expectEqual(@as(u32, 0x123456), try color(&entry.result.value, target.owner.list_node));
        try t.expect((try selected(&entry.result.value, target.owner.list_node)).border_fill_id != target.owner.source_id);
    }
    try t.expect(result.entries[0].result.value.cells.ptr != result.entries[1].result.value.cells.ptr);
    try t.expect(result.entries[0].result.value.styles.ptr != result.entries[1].result.value.styles.ptr);
    try t.expectEqual(error.InvalidSectionIndex, result.entries[2].result.unavailable);
    result.deinit(counter.allocator());
    try t.expectEqual(counter.allocated_bytes, counter.freed_bytes);
    // Sample early plan/header and late duplicate-projection failures without
    // an unbounded real-document allocation sweep.
    for ([_]usize{ 0, 1, allocation_count / 2, allocation_count - 1 }) |failure| {
        var failing = std.testing.FailingAllocator.init(a, .{ .fail_index = failure });
        try t.expectError(error.OutOfMemory, batch.read(failing.allocator(), &session, &.{ 0, 0, session.sections.len }));
        try t.expect(failing.has_induced_failure);
        try t.expectEqual(failing.allocated_bytes, failing.freed_bytes);
    }
    var broken = session;
    broken.source = @constCast("broken ZIP");
    var invalid = try batch.read(a, &broken, &.{session.sections.len});
    defer invalid.deinit(a);
    try t.expectEqual(error.InvalidSectionIndex, invalid.entries[0].result.unavailable);
    var failed = try batch.read(a, &broken, &.{ 0, session.sections.len, 0 });
    defer failed.deinit(a);
    _ = borders.read(a, &broken, 0) catch |err| {
        try t.expectEqual(err, failed.entries[0].result.unavailable);
        try t.expectEqual(err, failed.entries[2].result.unavailable);
        try t.expectEqual(error.InvalidSectionIndex, failed.entries[1].result.unavailable);
        return;
    };
    return error.ExpectedInvalidSource;
}
