const std = @import("std");
const a = std.testing.allocator;
const base = @import("source_table_cell_split_tests.zig");
const Source = @import("../text_source.zig").Source;
const source_tree = @import("source_tree.zig");
const lists = @import("../body/list_groups.zig");
const body = @import("../body/reader.zig");
const framing = @import("../record_writer.zig");
const Session = @import("style_preservation.zig").Session;
const History = @import("editor_history.zig").History;
const api = @import("source_table_cell_split_service.zig");
pub const Kind = enum { full, vertical, horizontal, offset };
fn end(tree: @import("../body/tree.zig").Tree, index: usize, length: usize) usize {
    return if (index == tree.nodes.len) length else tree.nodes[index].record.framing.offset;
}
pub fn fixture(kind: Kind) ![]u8 {
    if (kind == .offset) return offsetFixture();
    const original = try base.authoredInput();
    defer a.free(original);
    const edit = try Session.open(a, original);
    defer edit.close();
    const bindings = try edit.tableBindings(a, 0);
    defer a.free(bindings);
    try edit.apply(.{ .set_character_properties = .{ .section = 0, .paragraph = bindings[0].paragraph, .start_unit = 0, .end_unit = 1, .properties = .{ .bold = true, .italic = true, .text_color = 0x123456 } } });
    const input = try base.save(edit);
    defer a.free(input);
    return joined(input, switch (kind) {
        .full => &.{ 0, 1, 2, 3 },
        .vertical => &.{ 0, 2 },
        .horizontal => &.{ 0, 1 },
        .offset => unreachable,
    }, if (kind == .vertical) 1 else 2, if (kind == .horizontal) 1 else 2, if (kind == .vertical) 15000 else 30000, if (kind == .horizontal) 8000 else 16000, switch (kind) {
        .full => &.{ 1, 0 },
        .vertical => &.{ 2, 1 },
        .horizontal => &.{ 1, 2 },
        .offset => unreachable,
    });
}
fn offsetFixture() ![]u8 {
    const blank = try @import("../../new_document/root.zig").hwp5(a);
    defer a.free(blank);
    const session = try Session.open(a, blank);
    defer session.close();
    var ids = try session.planTableIds(9);
    defer ids.deinit(a);
    var table = try @import("../../model/created_table.zig").create(a, ids.identity, ids.instance_id, try @import("../../model/table_creation_plan.zig").create(3, 3, 45000, 8000, 64), ids.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 0 }, 64);
    defer table.deinit(a);
    for ([_][]const u8{ "aa", "bb", "cc", "dd", "e😀", "ff", "gg", "hh", "ii" }, 0..) |text, index|
        _ = try table.replaceText(a, @intCast(index / 3), @intCast(index % 3), text, 1024);
    try session.apply(.{ .stage_table = .{ .section = 0, .paragraph = 0, .unit = 0, .table = &table, .options = @import("created_table_grid_session_tests.zig").options } });
    const file = try base.save(session);
    defer a.free(file);
    return joined(file, &.{ 4, 5, 7, 8 }, 2, 2, 30000, 16000, &.{ 3, 2, 1 });
}
fn joined(input: []const u8, members: []const usize, columns: u16, rows: u16, width: u32, height: u32, row_counts: []const u16) ![]u8 {
    var source = try Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var tree = try source_tree.parse(a, raw, source.header.version(), .{});
    defer tree.deinit(a);
    var groups = try lists.Groups.build(a, tree);
    defer groups.deinit(a);
    var table_node: usize = 0;
    for (tree.nodes, 0..) |node, index| if (node.record.value == .table) {
        table_node = index;
    };
    const marker = tree.nodes[table_node];
    const owner = marker.parent.?;
    var cells: std.ArrayList(lists.Group) = .empty;
    defer cells.deinit(a);
    for (groups.items) |group| if (group.parent_node == owner) {
        try cells.append(a, group);
    };
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    try output.appendSlice(a, raw[0..marker.record.framing.offset]);
    const table = try a.dupe(u8, marker.record.framing.payload);
    defer a.free(table);
    for (row_counts, 0..) |count, row| std.mem.writeInt(u16, table[18 + row * 2 ..][0..2], count, .little);
    try framing.append(a, &output, 77, marker.record.framing.level, table, 8 * 1024 * 1024);
    for (cells.items, 0..) |group, index| {
        if (index != members[0] and std.mem.indexOfScalar(usize, members, index) != null) continue;
        if (index != members[0]) {
            try output.appendSlice(a, raw[tree.nodes[group.header_node].record.framing.offset..end(tree, group.end, raw.len)]);
            continue;
        }
        const list = tree.nodes[group.header_node].record.framing;
        const payload = try a.dupe(u8, list.payload);
        defer a.free(payload);
        // Authored observed8 LIST_HEADER; retain flags and every original paragraph.
        std.mem.writeInt(u32, payload[0..4], @intCast(members.len), .little);
        std.mem.writeInt(u16, payload[12..14], columns, .little);
        std.mem.writeInt(u16, payload[14..16], rows, .little);
        std.mem.writeInt(u32, payload[16..20], width, .little);
        std.mem.writeInt(u32, payload[20..24], height, .little);
        try framing.append(a, &output, 72, list.level, payload, 8 * 1024 * 1024);
        for (members) |member| try output.appendSlice(a, raw[tree.nodes[cells.items[member].begin].record.framing.offset..end(tree, cells.items[member].end, raw.len)]);
    }
    try output.appendSlice(a, raw[end(tree, tree.nodes[owner].subtree_end, raw.len)..]);
    return @import("../../cfb/stream_replace.zig").rebuildExact(a, &source.file, "/BodyText/Section0", output.items, .{});
}
fn expectSaved(session: *const Session, expected: []const u8) !void {
    const bytes = try base.save(session);
    defer a.free(bytes);
    try std.testing.expectEqualSlices(u8, expected, bytes);
}
fn exportEvidence(name: []const u8, bytes: []const u8) !void {
    var sink = (try @import("../../testing/evidence_output.zig").Sink.fromEnviron(a, std.testing.io, std.testing.environ, "HWPJS_H5_MERGED_EVIDENCE")) orelse return;
    defer sink.deinit();
    try sink.writeFile(name, bytes);
}
pub const Case = struct { kind: Kind, row: u32, column: u32, rows: u32, columns: u32, name: []const u8 };
pub const cases = [_]Case{
    .{ .kind = .offset, .row = 1, .column = 1, .rows = 3, .columns = 2, .name = "offset" },
    .{ .kind = .full, .row = 0, .column = 0, .rows = 2, .columns = 2, .name = "full" },
    .{ .kind = .vertical, .row = 0, .column = 0, .rows = 3, .columns = 2, .name = "vertical" },
    .{ .kind = .horizontal, .row = 0, .column = 0, .rows = 2, .columns = 3, .name = "horizontal" },
    .{ .kind = .vertical, .row = 0, .column = 1, .rows = 2, .columns = 2, .name = "unselected-span" },
};
test "H5 merged source split full vertical horizontal surrounding spans one History exact reopen" {
    for (cases) |case| {
        const input = try fixture(case.kind);
        defer a.free(input);
        const session = try Session.open(a, input);
        defer session.close();
        session.enableHistoryDelta();
        var history = try History.initV2(a, session, .{});
        defer history.deinit();
        var lifetime: @import("../../model/formatting_binding.zig").State = .{};
        try lifetime.open();
        const service: api.Service = .{ .session = session, .history = &history, .lifetime = &lifetime };
        const target = try service.captureWithSpans(a, 0, try base.tableNode(session), case.row, case.column);
        try std.testing.expect(try service.apply(a, target, case.rows, case.columns));
        try std.testing.expectEqual(@as(u32, 1), history.revision());
        const output = try base.save(session);
        defer a.free(output);
        const reopened = try Session.open(a, output);
        defer reopened.close();
        try expectSaved(reopened, output);
        try std.testing.expect(try history.undo(session));
        try expectSaved(session, input);
        try std.testing.expectError(error.StaleMutationEpoch, service.apply(a, target, case.rows, case.columns));
        try std.testing.expect(try history.redo(session));
        try expectSaved(session, output);
        const before_name = try std.fmt.allocPrint(a, "{s}-before.hwp", .{case.name});
        defer a.free(before_name);
        const after_name = try std.fmt.allocPrint(a, "{s}-after.hwp", .{case.name});
        defer a.free(after_name);
        try exportEvidence(before_name, input);
        try exportEvidence(after_name, output);
    }
}
test "H5 merged source split repeated native refinement and forged span reject" {
    const input = try fixture(.full);
    defer a.free(input);
    const session = try Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    var lifetime: @import("../../model/formatting_binding.zig").State = .{};
    try lifetime.open();
    const service: api.Service = .{ .session = session, .history = &history, .lifetime = &lifetime };
    var target = try service.captureWithSpans(a, 0, try base.tableNode(session), 0, 0);
    var forged = target;
    forged.row_span = 1;
    try std.testing.expectError(error.SourceBindingMismatch, service.apply(a, forged, 1, 2));
    try std.testing.expect(try service.apply(a, target, 1, 2));
    const once = try base.save(session);
    defer a.free(once);
    target = try service.captureWithSpans(a, 0, try base.tableNode(session), 0, 0);
    try std.testing.expectEqual(@as(u32, 2), target.row_span);
    try std.testing.expect(try service.apply(a, target, 3, 1));
    const twice = try base.save(session);
    defer a.free(twice);
    try std.testing.expect(try history.undo(session));
    try expectSaved(session, once);
    try std.testing.expect(try history.undo(session));
    try expectSaved(session, input);
    try std.testing.expect(try history.redo(session));
    try expectSaved(session, once);
    try std.testing.expect(try history.redo(session));
    try expectSaved(session, twice);
}

const Mutation = enum { overlap, gap, zero_span, bounds, width, height, row_count, protected, last_protected, table_child };
fn mutate(input: []const u8, mutation: Mutation) ![]u8 {
    var source = try Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var records = @import("../record.zig").Iterator.init(raw, .{});
    var cell: usize = 0;
    var marker_offset: usize = 0;
    var marker_end: usize = 0;
    while (try records.next()) |record| {
        const at = record.offset + record.raw.len - record.payload.len;
        if (record.tag == 77) {
            marker_offset = at;
            marker_end = record.offset + record.raw.len;
        }
        if (record.tag != 72) continue;
        if (cell == 0) switch (mutation) {
            .gap => std.mem.writeInt(u16, raw[at + 14 ..][0..2], 1, .little),
            .zero_span => std.mem.writeInt(u16, raw[at + 12 ..][0..2], 0, .little),
            .bounds => std.mem.writeInt(u16, raw[at + 14 ..][0..2], 3, .little),
            .protected => std.mem.writeInt(u32, raw[at + 4 ..][0..4], 1 << 17, .little),
            else => {},
        };
        if (cell == 1) switch (mutation) {
            .width => std.mem.writeInt(u32, raw[at + 16 ..][0..4], 15001, .little),
            .height => std.mem.writeInt(u32, raw[at + 20 ..][0..4], 7999, .little),
            else => {},
        };
        if (cell == 2) switch (mutation) {
            .overlap => std.mem.writeInt(u16, raw[at + 10 ..][0..2], 0, .little),
            .last_protected => std.mem.writeInt(u32, raw[at + 4 ..][0..4], 1 << 17, .little),
            else => {},
        };
        cell += 1;
    }
    if (mutation == .row_count) std.mem.writeInt(u16, raw[marker_offset + 18 ..][0..2], 1, .little);
    var changed: std.ArrayList(u8) = .empty;
    defer changed.deinit(a);
    if (mutation == .table_child) {
        try changed.appendSlice(a, raw[0..marker_end]);
        try framing.append(a, &changed, 900, 3, "unowned table child", 8 * 1024 * 1024);
        try changed.appendSlice(a, raw[marker_end..]);
    } else try changed.appendSlice(a, raw);
    return @import("../../cfb/stream_replace.zig").rebuildExact(a, &source.file, "/BodyText/Section0", changed.items, .{});
}
fn fileSplit(allocator: std.mem.Allocator, input: []const u8) ![]u8 {
    var source = try Source.open(allocator, input);
    defer source.deinit();
    const raw = try source.decodeSection(allocator, 0);
    defer allocator.free(raw);
    var it = @import("../record.zig").Iterator.init(raw, .{});
    var index: usize = 0;
    var table_node: ?usize = null;
    while (try it.next()) |record| : (index += 1) if (record.tag == 77) {
        table_node = index;
    };
    return @import("source_table_grid_file.zig").transform(allocator, input, .{ .section = 0, .table_node = table_node.?, .expected_rows = 2, .expected_columns = 2, .split = .{ .row = 0, .column = 0, .rows = 3, .columns = 2 }, .layout = .observed8 }, .{});
}
test "H5 merged source split malformed occupancy geometry row metadata protected ownership refuse" {
    const input = try fixture(.vertical);
    defer a.free(input);
    for (std.enums.values(Mutation)) |mutation| {
        const bad = try mutate(input, mutation);
        defer a.free(bad);
        const before = try a.dupe(u8, bad);
        defer a.free(before);
        if (fileSplit(a, bad)) |unexpected| {
            a.free(unexpected);
            return error.UnexpectedAcceptance;
        } else |_| {}
        try std.testing.expectEqualSlices(u8, before, bad);
    }
}
fn oomFile(allocator: std.mem.Allocator, input: []const u8) !void {
    const output = try fileSplit(allocator, input);
    defer allocator.free(output);
}
test "H5 merged source split complete immutable file OOM fallback sweep" {
    const input = try fixture(.vertical);
    defer a.free(input);
    try @import("../../testing/allocation_failures.zig").check(oomFile, .{input});
}
test "H5 merged source split managed bounded OOM source revision unchanged" {
    const input = try fixture(.full);
    defer a.free(input);
    var measured = std.testing.FailingAllocator.init(a, .{});
    const control = try Session.open(measured.allocator(), input);
    defer control.close();
    control.enableHistoryDelta();
    var initial = try History.initV2(measured.allocator(), control, .{});
    defer initial.deinit();
    var life: @import("../../model/formatting_binding.zig").State = .{};
    try life.open();
    const service: api.Service = .{ .session = control, .history = &initial, .lifetime = &life };
    const target = try service.captureWithSpans(a, 0, try base.tableNode(control), 0, 0);
    const start = measured.alloc_index;
    _ = try service.apply(measured.allocator(), target, 3, 2);
    const total = measured.alloc_index - start;
    var rejected: usize = 0;
    for (0..40) |sample| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const session = try Session.open(failing.allocator(), input);
        defer session.close();
        session.enableHistoryDelta();
        var history = try History.initV2(failing.allocator(), session, .{});
        defer history.deinit();
        var lifetime: @import("../../model/formatting_binding.zig").State = .{};
        try lifetime.open();
        const apply: api.Service = .{ .session = session, .history = &history, .lifetime = &lifetime };
        const current = try apply.captureWithSpans(a, 0, try base.tableNode(session), 0, 0);
        failing.fail_index = failing.alloc_index + sample * total / 40;
        const result = apply.apply(failing.allocator(), current, 3, 2);
        failing.fail_index = std.math.maxInt(usize);
        if (result) |_| {} else |err| {
            if (err != error.OutOfMemory) return err;
            rejected += 1;
            try expectSaved(session, input);
            try std.testing.expectEqual(@as(u32, 0), history.revision());
            try std.testing.expect(!try history.undo(session));
        }
    }
    try std.testing.expect(rejected > 0);
    std.debug.print("merged managed OOM total={d} samples=40 rejected={d}\n", .{ total, rejected });
}
test "H5 merged source split late protection preserves existing redo and budget rollback" {
    const original = try fixture(.vertical);
    defer a.free(original);
    const input = try mutate(original, .last_protected);
    defer a.free(input);
    const session = try Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    const bindings = try session.tableBindings(a, 0);
    defer a.free(bindings);
    _ = try history.apply(session, .{ .set_character_properties = .{ .section = 0, .paragraph = bindings[0].paragraph, .start_unit = 0, .end_unit = 1, .properties = .{ .bold = false } } });
    const redo = try base.save(session);
    defer a.free(redo);
    try std.testing.expect(try history.undo(session));
    try expectSaved(session, input);
    var lifetime: @import("../../model/formatting_binding.zig").State = .{};
    try lifetime.open();
    const service: api.Service = .{ .session = session, .history = &history, .lifetime = &lifetime };
    const target = try service.captureWithSpans(a, 0, try base.tableNode(session), 0, 0);
    try std.testing.expectError(error.UnsupportedSourceTableGrid, service.apply(a, target, 3, 2));
    try expectSaved(session, input);
    try std.testing.expect(try history.redo(session));
    try expectSaved(session, redo);
    const bounded = try Session.open(a, original);
    defer bounded.close();
    bounded.enableHistoryDelta();
    var budget = try History.initV2(a, bounded, .{ .max_checkpoint_bytes = @intCast(try bounded.checkpointSize(8 * 1024 * 1024) + 16) });
    defer budget.deinit();
    const limited: api.Service = .{ .session = bounded, .history = &budget, .lifetime = &lifetime };
    const limited_target = try limited.captureWithSpans(a, 0, try base.tableNode(bounded), 0, 0);
    if (limited.apply(a, limited_target, 3, 2)) |_| return error.UnexpectedAcceptance else |_| {}
    try expectSaved(bounded, original);
    try std.testing.expectEqual(@as(u32, 0), budget.revision());
}
test "H5 merged source split geometry work linear 32 64 128 source cells" {
    const geom = @import("source_table_cell_split_geometry.zig");
    var previous: usize = 0;
    for ([_]usize{ 32, 64, 128 }) |count| {
        var arena = std.heap.ArenaAllocator.init(a);
        defer arena.deinit();
        const scratch = arena.allocator();
        const cells = try scratch.alloc(body.Cell, count - 1);
        for (cells, 0..) |*cell, index| cell.* = .{ .column = @intCast(if (index == 0) 0 else index + 1), .row = 0, .column_span = if (index == 0) 2 else 1, .row_span = 1, .width = if (index == 0) 200 else 100, .height = 100, .margins = .{ 0, 0, 0, 0 }, .border_fill_id = 0, .extra = &.{} };
        var work: geom.Work = .{};
        geom.Testing.active = &work;
        defer geom.Testing.active = null;
        _ = try geom.create(scratch, cells, 1, @intCast(count), @intCast(count * 100), 100, 0, .{ .row = 0, .column = 0, .rows = 2, .columns = 3 }, 4096);
        const observed = work.links + work.link_visits + work.merged_edges + work.output_slots;
        if (previous != 0) try std.testing.expect(observed <= 2 * previous);
        std.debug.print("merged geometry N={d} links={d} visits={d} edges={d} slots={d} total={d}\n", .{ count, work.links, work.link_visits, work.merged_edges, work.output_slots, observed });
        previous = observed;
    }
}
