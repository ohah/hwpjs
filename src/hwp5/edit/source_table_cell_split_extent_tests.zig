const std = @import("std");
const a = std.testing.allocator;
const base = @import("source_table_cell_split_tests.zig");
const merged = @import("source_table_cell_split_merged_tests.zig");
const Session = @import("style_preservation.zig").Session;
const History = @import("editor_history.zig").History;
const api = @import("source_table_cell_split_service.zig");
const Source = @import("../text_source.zig").Source;
const records = @import("../record.zig");
const framing = @import("../record_writer.zig");

pub fn declared(input: []const u8, width: u32, height: u32) ![]u8 {
    var source = try Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var it = records.Iterator.init(raw, .{});
    var count: usize = 0;
    while (try it.next()) |entry| {
        if (entry.tag != 71 or entry.payload.len < 24 or std.mem.readInt(u32, entry.payload[0..4], .little) != 0x74626c20) continue;
        const at = entry.offset + entry.raw.len - entry.payload.len;
        std.mem.writeInt(u32, raw[at + 16 ..][0..4], width, .little);
        std.mem.writeInt(u32, raw[at + 20 ..][0..4], height, .little);
        count += 1;
    }
    if (count != 1) return error.InvalidTestFixture;
    return @import("../../cfb/stream_replace.zig").rebuildExact(a, &source.file, "/BodyText/Section0", raw, .{});
}
fn exportFile(name: []const u8, bytes: []const u8) !void {
    var sink = (try @import("../../testing/evidence_output.zig").Sink.fromEnviron(a, std.testing.io, std.testing.environ, "HWPJS_H5_EXTENT_EVIDENCE")) orelse return;
    defer sink.deinit();
    try sink.writeFile(name, bytes);
}
fn split(input: []const u8, case: merged.Case) ![]u8 {
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
    const output = try base.save(session);
    errdefer a.free(output);
    try std.testing.expectEqual(@as(u32, 1), history.revision());
    try std.testing.expect(try history.undo(session));
    const undo = try base.save(session);
    defer a.free(undo);
    try std.testing.expectEqualSlices(u8, input, undo);
    try std.testing.expect(try history.redo(session));
    const redo = try base.save(session);
    defer a.free(redo);
    try std.testing.expectEqualSlices(u8, output, redo);
    const reopened = try Session.open(a, output);
    defer reopened.close();
    const saved = try base.save(reopened);
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, output, saved);
    return output;
}
test "H5 split extent merged smaller larger declarations preserve control bytes history reopen" {
    for (merged.cases) |case| {
        const matching = try merged.fixture(case.kind);
        defer a.free(matching);
        const matched_output = try split(matching, case);
        defer a.free(matched_output);
        const input = try declared(matching, 7777, 21001);
        defer a.free(input);
        const output = try split(input, case);
        defer a.free(output);
        const expected = try declared(matched_output, 7777, 21001);
        defer a.free(expected);
        try std.testing.expectEqualSlices(u8, expected, output);
        const before_name = try std.fmt.allocPrint(a, "{s}-before.hwp", .{case.name});
        defer a.free(before_name);
        const after_name = try std.fmt.allocPrint(a, "{s}-after.hwp", .{case.name});
        defer a.free(after_name);
        try exportFile(before_name, input);
        try exportFile(after_name, output);
    }
}
const Mutation = enum { protected_last, locked, spacing, unknown_child, width_conflict, zero_declared };
fn mutate(input: []const u8, mutation: Mutation) ![]u8 {
    if (mutation == .zero_declared) return declared(input, 0, 4000);
    var source = try Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var it = records.Iterator.init(raw, .{});
    var last_list: ?usize = null;
    var second_list: ?usize = null;
    var list_count: usize = 0;
    var table_end: ?usize = null;
    while (try it.next()) |entry| {
        const at = entry.offset + entry.raw.len - entry.payload.len;
        if (entry.tag == 71 and std.mem.readInt(u32, entry.payload[0..4], .little) == 0x74626c20 and mutation == .locked) {
            const flags = std.mem.readInt(u32, raw[at + 4 ..][0..4], .little);
            std.mem.writeInt(u32, raw[at + 4 ..][0..4], (flags & ~@as(u32, 3 << 3)) | (2 << 3) | (1 << 20), .little);
        }
        if (entry.tag == 77) {
            table_end = entry.offset + entry.raw.len;
            if (mutation == .spacing) std.mem.writeInt(u16, raw[at + 8 ..][0..2], 1, .little);
        }
        if (entry.tag == 72) {
            last_list = at;
            if (list_count == 1) second_list = at;
            list_count += 1;
        }
    }
    if (mutation == .protected_last) std.mem.writeInt(u32, raw[last_list.? + 4 ..][0..4], 1 << 17, .little);
    if (mutation == .width_conflict) std.mem.writeInt(u32, raw[second_list.? + 16 ..][0..4], 1, .little);
    var changed: std.ArrayList(u8) = .empty;
    defer changed.deinit(a);
    if (mutation == .unknown_child) {
        try changed.appendSlice(a, raw[0..table_end.?]);
        try framing.append(a, &changed, 900, 3, "unknown child preserved by refusal", 8 * 1024 * 1024);
        try changed.appendSlice(a, raw[table_end.?..]);
    } else try changed.appendSlice(a, raw);
    return @import("../../cfb/stream_replace.zig").rebuildExact(a, &source.file, "/BodyText/Section0", changed.items, .{});
}
fn fileSplit(allocator: std.mem.Allocator, input: []const u8) ![]u8 {
    var source = try Source.open(allocator, input);
    defer source.deinit();
    const raw = try source.decodeSection(allocator, 0);
    defer allocator.free(raw);
    var it = records.Iterator.init(raw, .{});
    var index: usize = 0;
    var table: ?usize = null;
    while (try it.next()) |entry| : (index += 1) {
        if (entry.tag == 77) table = index;
    }
    return @import("source_table_grid_file.zig").transform(allocator, input, .{ .section = 0, .table_node = table.?, .expected_rows = 2, .expected_columns = 2, .split = .{ .row = 0, .column = 0, .rows = 3, .columns = 2 }, .layout = .observed8 }, .{});
}
fn oom(allocator: std.mem.Allocator, input: []const u8) !void {
    const output = try fileSplit(allocator, input);
    defer allocator.free(output);
}
test "H5 split extent disagreement keeps late refusals source and existing redo unchanged" {
    const matching = try merged.fixture(.vertical);
    defer a.free(matching);
    const input = try declared(matching, 7777, 4000);
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
        if (mutation == .unknown_child) continue;
        const session = try Session.open(a, bad);
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
        var lifetime: @import("../../model/formatting_binding.zig").State = .{};
        try lifetime.open();
        const service: api.Service = .{ .session = session, .history = &history, .lifetime = &lifetime };
        const target = try service.captureWithSpans(a, 0, try base.tableNode(session), 0, 0);
        if (service.apply(a, target, 3, 2)) |_| return error.UnexpectedAcceptance else |_| {}
        const unchanged = try base.save(session);
        defer a.free(unchanged);
        try std.testing.expectEqualSlices(u8, bad, unchanged);
        try std.testing.expect(try history.redo(session));
        const restored = try base.save(session);
        defer a.free(restored);
        try std.testing.expectEqualSlices(u8, redo, restored);
    }
}
test "H5 split extent mismatch immutable file complete OOM fallback sweep" {
    const matching = try merged.fixture(.vertical);
    defer a.free(matching);
    const input = try declared(matching, 7777, 4000);
    defer a.free(input);
    try @import("../../testing/allocation_failures.zig").check(oom, .{input});
}
test "H5 split extent mismatch grid row column policy stays rejected" {
    const matching = try base.authoredInput();
    defer a.free(matching);
    const input = try declared(matching, 7777, 4000);
    defer a.free(input);
    const session = try Session.open(a, input);
    defer session.close();
    var source = try Source.open(a, input);
    defer source.deinit();
    const table = try base.tableNode(session);
    for ([_]@import("../../model/table_grid_edit_plan.zig").Command{ .{ .insert_row = 1 }, .{ .delete_row = 1 }, .{ .insert_column = 1 }, .{ .delete_column = 1 } }) |command| {
        try std.testing.expectError(error.UnsupportedSourceTableGrid, @import("source_table_grid_file.zig").transform(a, input, .{ .section = 0, .table_node = table, .expected_rows = 2, .expected_columns = 2, .command = command, .layout = .observed8 }, .{}));
    }
}
fn seedRedo(session: *Session, history: *History) ![]u8 {
    const bindings = try session.tableBindings(a, 0);
    defer a.free(bindings);
    _ = try history.apply(session, .{ .set_character_properties = .{ .section = 0, .paragraph = bindings[0].paragraph, .start_unit = 0, .end_unit = 1, .properties = .{ .bold = false } } });
    const saved = try base.save(session);
    errdefer a.free(saved);
    try std.testing.expect(try history.undo(session));
    return saved;
}
test "H5 split extent mismatch managed OOM bounded samples preserve source revision and prior redo" {
    const matching = try merged.fixture(.full);
    defer a.free(matching);
    const input = try declared(matching, 7777, 4000);
    defer a.free(input);
    var measured = std.testing.FailingAllocator.init(a, .{});
    const control = try Session.open(measured.allocator(), input);
    defer control.close();
    control.enableHistoryDelta();
    var initial = try History.initV2(measured.allocator(), control, .{});
    defer initial.deinit();
    const prior_redo = try seedRedo(control, &initial);
    defer a.free(prior_redo);
    var life: @import("../../model/formatting_binding.zig").State = .{};
    try life.open();
    const service: api.Service = .{ .session = control, .history = &initial, .lifetime = &life };
    const target = try service.captureWithSpans(a, 0, try base.tableNode(control), 0, 0);
    const start = measured.alloc_index;
    _ = try service.apply(measured.allocator(), target, 3, 2);
    const total = measured.alloc_index - start;
    var rejected: usize = 0;
    for (0..32) |sample| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const session = try Session.open(failing.allocator(), input);
        defer session.close();
        session.enableHistoryDelta();
        var history = try History.initV2(failing.allocator(), session, .{});
        defer history.deinit();
        const redo = try seedRedo(session, &history);
        defer a.free(redo);
        var lifetime: @import("../../model/formatting_binding.zig").State = .{};
        try lifetime.open();
        const current_service: api.Service = .{ .session = session, .history = &history, .lifetime = &lifetime };
        const current = try current_service.captureWithSpans(a, 0, try base.tableNode(session), 0, 0);
        failing.fail_index = failing.alloc_index + sample * total / 32;
        const result = current_service.apply(failing.allocator(), current, 3, 2);
        failing.fail_index = std.math.maxInt(usize);
        if (result) |_| return error.UnexpectedAcceptance else |err| {
            try std.testing.expectEqual(error.OutOfMemory, err);
            rejected += 1;
            const saved = try base.save(session);
            defer a.free(saved);
            try std.testing.expectEqualSlices(u8, input, saved);
            try std.testing.expectEqual(@as(u32, 0), history.revision());
            try std.testing.expect(try history.redo(session));
            const restored = try base.save(session);
            defer a.free(restored);
            try std.testing.expectEqualSlices(u8, redo, restored);
        }
    }
    std.debug.print("extent managed OOM allocations={d} samples=32 rejected={d}\n", .{ total, rejected });
}
