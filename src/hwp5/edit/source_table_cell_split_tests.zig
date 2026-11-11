const std = @import("std");
const a = std.testing.allocator;
const support = @import("source_table_cell_split_test_support.zig");
const grid = @import("source_table_grid.zig");
const Layout = @import("../body/list_header.zig").Layout;
const wire = @import("../record.zig");
fn primitive(allocator: std.mem.Allocator, source: []const u8, layout: Layout, row: u32, column: u32) ![]u8 {
    return grid.prepare(allocator, source, support.version, .{ .table_node = 5, .expected_rows = 2, .expected_columns = 2, .split = .{ .row = row, .column = column, .rows = 2, .columns = 3 }, .layout = layout, .new_paragraph_ids = &.{ 901, 902, 903, 904, 905 } }, .{});
}
test "H5 source cell split primitive all corners layouts raw preservation" {
    for ([_]Layout{ .spec6, .observed8 }) |layout| {
        const input = try support.fixture(layout, .none);
        defer a.free(input);
        for (0..2) |row| for (0..2) |column| {
            const output = try primitive(a, input, layout, @intCast(row), @intCast(column));
            defer a.free(output);
            var it = wire.Iterator.init(output, .{});
            var lists: usize = 0;
            var original_paragraphs: usize = 0;
            var fresh: usize = 0;
            var table = false;
            while (try it.next()) |record| {
                if (record.tag == 77) {
                    table = true;
                    try std.testing.expectEqual(@as(u16, 3), std.mem.readInt(u16, record.payload[4..6], .little));
                    try std.testing.expectEqual(@as(u16, 4), std.mem.readInt(u16, record.payload[6..8], .little));
                }
                if (record.tag == 72) lists += 1;
                if (record.tag == 66) {
                    const id = std.mem.readInt(u32, record.payload[18..22], .little);
                    if (id >= 101 and id <= 104) original_paragraphs += 1;
                    if (id >= 901 and id <= 905) fresh += 1;
                }
            }
            try std.testing.expect(table);
            try std.testing.expectEqual(@as(usize, 9), lists);
            try std.testing.expectEqual(@as(usize, 4), original_paragraphs);
            try std.testing.expectEqual(@as(usize, 5), fresh);
        };
    }
}
test "H5 source cell split refuses protected nested opaque and malformed before output" {
    for ([_]Layout{ .spec6, .observed8 }) |layout| {
        for ([_]support.Mutation{ .protected_cell, .protected_last_cell, .merged, .extra_cell, .extra_table, .zones, .caption, .nested, .cache, .unknown_child, .tracking }) |mutation| {
            const input = try support.fixture(layout, mutation);
            defer a.free(input);
            const before = try a.dupe(u8, input);
            defer a.free(before);
            if (primitive(a, input, layout, 1, 1)) |unexpected| {
                a.free(unexpected);
                return error.UnexpectedAcceptance;
            } else |_| {}
            try std.testing.expectEqualSlices(u8, before, input);
        }
    }
}
fn oomPrimitive(allocator: std.mem.Allocator, source: []const u8) !void {
    const output = try primitive(allocator, source, .observed8, 0, 1);
    defer allocator.free(output);
}
test "H5 source cell split primitive OOM every fallback allocation" {
    const input = try support.fixture(.observed8, .none);
    defer a.free(input);
    try @import("../../testing/allocation_failures.zig").check(oomPrimitive, .{input});
}

const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const service = @import("source_table_cell_split_service.zig");
fn authoredInput() ![]u8 {
    const blank = try @import("../../new_document/root.zig").hwp5(a);
    defer a.free(blank);
    const session = try edit.Session.open(a, blank);
    defer session.close();
    var ids = try session.planTableIds(4);
    defer ids.deinit(a);
    const fixture = @import("created_table_grid_session_tests.zig");
    var table = try fixture.table(a, ids.identity, ids.instance_id, ids.paragraph_ids);
    defer table.deinit(a);
    table.resources.border_fill = 0; // Authored blank DocInfo has no border-fill resource.
    try session.apply(.{ .stage_table = .{ .section = 0, .paragraph = 0, .unit = 0, .table = &table, .options = fixture.options } });
    return (try session.save(a, .{ .allow_stale_layout = true })).bytes;
}
fn tableNode(session: *const edit.Session) !usize {
    const layouts = try session.tableLayoutSources(a, 0);
    defer a.free(layouts);
    if (layouts.len != 1) return error.InvalidTestTable;
    return layouts[0].table_record_node;
}
fn save(session: *const edit.Session) ![]u8 {
    return (try session.save(a, .{ .allow_stale_layout = true })).bytes;
}
fn expectSaved(session: *const edit.Session, expected: []const u8) !void {
    const actual = try save(session);
    defer a.free(actual);
    try std.testing.expectEqualSlices(u8, expected, actual);
}
fn exportEvidence(name: []const u8, bytes: []const u8) !void {
    var sink = (try @import("../../testing/evidence_output.zig").Sink.fromEnviron(a, std.testing.io, std.testing.environ, "HWPJS_H5_SPLIT_EVIDENCE")) orelse return;
    defer sink.deinit();
    try sink.writeFile(name, bytes);
}
test "H5 source cell split actual managed History single revision save reopen exact undo redo" {
    const input = try authoredInput();
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    var lifetime: @import("../../model/formatting_binding.zig").State = .{};
    try lifetime.open();
    const api: service.Service = .{ .session = session, .history = &history, .lifetime = &lifetime };
    const bindings = try session.tableBindings(a, 0);
    defer a.free(bindings);
    const paragraph = bindings[0].paragraph;
    _ = try history.apply(session, .{ .set_character_properties = .{ .section = 0, .paragraph = paragraph, .start_unit = 0, .end_unit = 1, .properties = .{ .bold = true, .italic = true, .text_color = 0x123456 } } });
    const before = try save(session);
    defer a.free(before);
    const target = try api.capture(a, 0, try tableNode(session), 0, 0);
    const revision = history.revision();
    try std.testing.expect(try api.apply(a, target, 2, 3));
    try std.testing.expectEqual(revision + 1, history.revision());
    const output = try save(session);
    defer a.free(output);
    try exportEvidence("before.hwp", before);
    try exportEvidence("after.hwp", output);
    const reopened = try edit.Session.open(a, output);
    defer reopened.close();
    try expectSaved(reopened, output);
    try std.testing.expectError(error.StaleMutationEpoch, api.apply(a, target, 2, 3));
    try std.testing.expect(try history.undo(session));
    try expectSaved(session, before);
    try exportEvidence("undo.hwp", before);
    // ABA undo restores the old revision; the non-rewinding ticket still rejects.
    try std.testing.expectError(error.StaleMutationEpoch, api.apply(a, target, 2, 3));
    try std.testing.expect(try history.redo(session));
    try expectSaved(session, output);
    try exportEvidence("redo.hwp", output);
}
test "H5 source cell split service owner protocol forged stale and invalid geometry refuse unchanged" {
    const input = try authoredInput();
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    const other = try edit.Session.open(a, input);
    defer other.close();
    var lifetime: @import("../../model/formatting_binding.zig").State = .{};
    try lifetime.open();
    const api: service.Service = .{ .session = session, .history = &history, .lifetime = &lifetime };
    const target = try api.capture(a, 0, try tableNode(session), 1, 1);
    const foreign: service.Service = .{ .session = other, .history = &history, .lifetime = &lifetime };
    try std.testing.expectError(error.SourceBindingMismatch, foreign.apply(a, target, 2, 2));
    var forged = target;
    forged.list_node += 1;
    try std.testing.expectError(error.SourceBindingMismatch, api.apply(a, forged, 2, 2));
    try std.testing.expectError(error.InvalidSourceTableCellSplit, api.apply(a, target, 1, 1));
    try std.testing.expectError(error.InvalidSourceTableCellSplit, api.apply(a, target, 64, 1));
    try std.testing.expectEqual(@as(u32, 0), history.revision());
    try expectSaved(session, input);
    var unmanaged = try History.initV2(a, other, .{});
    defer unmanaged.deinit();
    const old: service.Service = .{ .session = other, .history = &unmanaged, .lifetime = &lifetime };
    try std.testing.expectError(error.HistoryProtocolRequired, old.capture(a, 0, try tableNode(other), 0, 0));
}
test "H5 source cell split managed OOM bounded exact save history" {
    const input = try authoredInput();
    defer a.free(input);
    var measured = std.testing.FailingAllocator.init(a, .{});
    const baseline = try edit.Session.open(measured.allocator(), input);
    defer baseline.close();
    baseline.enableHistoryDelta();
    var initial = try History.initV2(measured.allocator(), baseline, .{});
    defer initial.deinit();
    var lifetime: @import("../../model/formatting_binding.zig").State = .{};
    try lifetime.open();
    const control: service.Service = .{ .session = baseline, .history = &initial, .lifetime = &lifetime };
    const target = try control.capture(a, 0, try tableNode(baseline), 0, 0);
    const start = measured.alloc_index;
    _ = try control.apply(measured.allocator(), target, 2, 3);
    const allocations = measured.alloc_index - start;
    const samples = @min(allocations, 40);
    var rejected: usize = 0;
    for (0..samples) |sample| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const session = try edit.Session.open(failing.allocator(), input);
        defer session.close();
        session.enableHistoryDelta();
        var history = try History.initV2(failing.allocator(), session, .{});
        defer history.deinit();
        var case_lifetime: @import("../../model/formatting_binding.zig").State = .{};
        try case_lifetime.open();
        const api: service.Service = .{ .session = session, .history = &history, .lifetime = &case_lifetime };
        const current = try api.capture(a, 0, try tableNode(session), 0, 0);
        failing.fail_index = failing.alloc_index + sample * allocations / samples;
        const result = api.apply(failing.allocator(), current, 2, 3);
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
    std.debug.print("H5 split managed OOM samples={d} rejected={d} applyAllocations={d}\n", .{ samples, rejected, allocations });
}

test "H5 source cell split late protected refusal keeps exact source and prior redo" {
    const original = try authoredInput();
    defer a.free(original);
    var source = try @import("../text_source.zig").Source.open(a, original);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var records = wire.Iterator.init(raw, .{});
    var lists: usize = 0;
    while (try records.next()) |record| {
        if (record.tag != 72) continue;
        lists += 1;
        if (lists != 4) continue;
        const payload_offset = record.offset + record.raw.len - record.payload.len;
        const attributes = std.mem.readInt(u32, raw[payload_offset + 4 ..][0..4], .little);
        std.mem.writeInt(u32, raw[payload_offset + 4 ..][0..4], attributes | (1 << 17), .little);
    }
    const input = try @import("../../cfb/stream_replace.zig").rebuildExact(a, &source.file, "/BodyText/Section0", raw, .{});
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    const bindings = try session.tableBindings(a, 0);
    defer a.free(bindings);
    _ = try history.apply(session, .{ .set_character_properties = .{ .section = 0, .paragraph = bindings[0].paragraph, .start_unit = 0, .end_unit = 1, .properties = .{ .italic = true } } });
    const redo = try save(session);
    defer a.free(redo);
    try std.testing.expect(try history.undo(session));
    try expectSaved(session, input);
    const revisions = history.revisionCount();
    var lifetime: @import("../../model/formatting_binding.zig").State = .{};
    try lifetime.open();
    const api: service.Service = .{ .session = session, .history = &history, .lifetime = &lifetime };
    const target = try api.capture(a, 0, try tableNode(session), 0, 0);
    try std.testing.expectError(error.UnsupportedSourceTableGrid, api.apply(a, target, 2, 3));
    try std.testing.expectEqual(revisions, history.revisionCount());
    try expectSaved(session, input);
    try std.testing.expect(try history.redo(session));
    try expectSaved(session, redo);
}
test "H5 source cell split closed and reopened lifetime refuses old target" {
    const input = try authoredInput();
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    var lifetime: @import("../../model/formatting_binding.zig").State = .{};
    try lifetime.open();
    const api: service.Service = .{ .session = session, .history = &history, .lifetime = &lifetime };
    const target = try api.capture(a, 0, try tableNode(session), 0, 1);
    lifetime.close();
    try std.testing.expectError(error.EditorNotOpen, api.apply(a, target, 1, 2));
    try lifetime.open();
    try std.testing.expectError(error.StaleFormattingBinding, api.apply(a, target, 1, 2));
    try expectSaved(session, input);
}

test "H5 source cell split dimensions budgets and mutually exclusive intent exact refusal" {
    const input = try support.fixture(.observed8, .none);
    defer a.free(input);
    var request: grid.Request = .{ .table_node = 5, .expected_rows = 2, .expected_columns = 2, .split = .{ .row = 0, .column = 0, .rows = 2, .columns = 63 }, .layout = .observed8 };
    try std.testing.expectError(error.UnsupportedSourceTableSplitDimensions, grid.prepare(a, input, support.version, request, .{}));
    request.split.?.columns = 3;
    request.command = .{ .insert_row = 0 };
    try std.testing.expectError(error.InvalidSourceTableGridOperation, grid.prepare(a, input, support.version, request, .{}));
    request.command = null;
    try std.testing.expectError(error.LimitExceeded, grid.prepare(a, input, support.version, request, .{ .max_cells = 5 }));
    request.new_paragraph_ids = &.{ 101, 102, 103, 104, 105 };
    try std.testing.expectError(error.InvalidTableParagraphIds, grid.prepare(a, input, support.version, request, .{}));
}
test "H5 source cell split postprepare History checkpoint budget rolls back source and revision" {
    const input = try authoredInput();
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    const initial_cost = try session.checkpointSize(8 * 1024 * 1024);
    var history = try History.initV2(a, session, .{ .max_checkpoint_bytes = @intCast(initial_cost + 16) });
    defer history.deinit();
    var lifetime: @import("../../model/formatting_binding.zig").State = .{};
    try lifetime.open();
    const api: service.Service = .{ .session = session, .history = &history, .lifetime = &lifetime };
    const target = try api.capture(a, 0, try tableNode(session), 0, 0);
    if (api.apply(a, target, 2, 3)) |_| return error.UnexpectedBudgetAcceptance else |err| {
        try std.testing.expect(err == error.LimitExceeded or err == error.HistoryCheckpointLimitExceeded or err == error.HistoryCheckpointBudgetExceeded);
    }
    try std.testing.expectEqual(@as(u32, 0), history.revision());
    try expectSaved(session, input);
    try std.testing.expect(!try history.undo(session));
}

fn compressedInput(input: []const u8) ![]u8 {
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, 8 * 1024 * 1024);
    defer a.free(info);
    const section = try source.decodeSection(a, 0);
    defer a.free(section);
    const compressed_info = try @import("../../compression/raw_deflate.zig").encodeStored(a, info, 8 * 1024 * 1024);
    defer a.free(compressed_info);
    const compressed_section = try @import("../../compression/raw_deflate.zig").encodeStored(a, section, 8 * 1024 * 1024);
    defer a.free(compressed_section);
    const replace = @import("../../cfb/stream_replace.zig");
    const file1 = try replace.rebuildExact(a, &source.file, "/DocInfo", compressed_info, .{});
    defer a.free(file1);
    var first = try @import("../../cfb/reader.zig").File.open(a, file1, .{});
    defer first.deinit();
    const file2 = try replace.rebuildExact(a, &first, "/BodyText/Section0", compressed_section, .{});
    defer a.free(file2);
    var second = try @import("../../cfb/reader.zig").File.open(a, file2, .{});
    defer second.deinit();
    var header = source.header.raw;
    header[36] |= 1;
    return replace.rebuildExact(a, &second, "/FileHeader", &header, .{});
}
test "H5 source cell split compressed original managed save reopen undo redo" {
    const original = try authoredInput();
    defer a.free(original);
    const input = try compressedInput(original);
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    var lifetime: @import("../../model/formatting_binding.zig").State = .{};
    try lifetime.open();
    const api: service.Service = .{ .session = session, .history = &history, .lifetime = &lifetime };
    const before = try save(session);
    defer a.free(before);
    const target = try api.capture(a, 0, try tableNode(session), 0, 0);
    try std.testing.expect(try api.apply(a, target, 2, 3));
    const output = try save(session);
    defer a.free(output);
    const reopened = try edit.Session.open(a, output);
    defer reopened.close();
    try expectSaved(reopened, output);
    try std.testing.expect(try history.undo(session));
    try expectSaved(session, before);
    try std.testing.expect(try history.redo(session));
    try expectSaved(session, output);
    try exportEvidence("compressed-before.hwp", before);
    try exportEvidence("compressed-after.hwp", output);
}

test "H5 source cell split unknown selected section owner rejected before rebase" {
    const original = try authoredInput();
    defer a.free(original);
    var source = try @import("../text_source.zig").Source.open(a, original);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var changed: std.ArrayList(u8) = .empty;
    defer changed.deinit(a);
    try changed.appendSlice(a, raw);
    try @import("../record_writer.zig").append(a, &changed, 900, 0, "unknown source owner", 8 * 1024 * 1024);
    const input = try @import("../../cfb/stream_replace.zig").rebuildExact(a, &source.file, "/BodyText/Section0", changed.items, .{});
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    var lifetime: @import("../../model/formatting_binding.zig").State = .{};
    try lifetime.open();
    const api: service.Service = .{ .session = session, .history = &history, .lifetime = &lifetime };
    const target = try api.capture(a, 0, try tableNode(session), 0, 0);
    try std.testing.expectError(error.UnsupportedSectionRecord, api.apply(a, target, 2, 3));
    try expectSaved(session, input);
    try std.testing.expectEqual(@as(u32, 0), history.revision());
}

fn twoSections(input: []const u8, unsupported: bool) ![]u8 {
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const blank = try @import("../../new_document/root.zig").hwp5(a);
    defer a.free(blank);
    var empty = try @import("../text_source.zig").Source.open(a, blank);
    defer empty.deinit();
    const raw = try empty.decodeSection(a, 0);
    defer a.free(raw);
    var section: std.ArrayList(u8) = .empty;
    defer section.deinit(a);
    try section.appendSlice(a, raw);
    if (unsupported) try @import("../record_writer.zig").append(a, &section, 900, 0, "unsupported unselected owner", 8 * 1024 * 1024);
    const info = try source.decodeDocInfo(a, 8 * 1024 * 1024);
    defer a.free(info);
    // Authored constructor writes DOCUMENT_PROPERTIES as the first short record.
    std.mem.writeInt(u16, info[4..6], 2, .little);
    const old = try source.file.toNodes(a);
    defer a.free(old);
    const nodes = try a.alloc(@import("../../cfb/writer.zig").Node, old.len + 2);
    defer a.free(nodes);
    @memcpy(nodes[0..old.len], old);
    const parent = try source.file.nodeIndex((try source.file.findExact("/BodyText")).?);
    for (nodes[0..old.len]) |*node| if (std.mem.eql(u8, node.name, "DocInfo")) {
        node.content = info;
    };
    nodes[old.len] = .{ .name = "Section1", .parent = @intCast(parent), .content = section.items };
    nodes[old.len + 1] = .{ .name = "OpaqueUnselectedData", .parent = 0, .state = 0x1234, .content = "preserve these opaque bytes" };
    return @import("../../cfb/writer.zig").write(a, nodes, .{});
}
test "H5 source cell split two sections preserve other bytes and refuse unsupported unselected owner" {
    const original = try authoredInput();
    defer a.free(original);
    for ([_]bool{ false, true }) |unsupported| {
        const input = try twoSections(original, unsupported);
        defer a.free(input);
        const session = try edit.Session.open(a, input);
        defer session.close();
        session.enableHistoryDelta();
        var history = try History.initV2(a, session, .{});
        defer history.deinit();
        var lifetime: @import("../../model/formatting_binding.zig").State = .{};
        try lifetime.open();
        const api: service.Service = .{ .session = session, .history = &history, .lifetime = &lifetime };
        const target = try api.capture(a, 0, try tableNode(session), 0, 0);
        if (unsupported) {
            try std.testing.expectError(error.UnsupportedSectionRecord, api.apply(a, target, 2, 3));
            try std.testing.expectEqual(@as(u32, 0), history.revision());
            try expectSaved(session, input);
        } else {
            try std.testing.expect(try api.apply(a, target, 2, 3));
            const output = try save(session);
            defer a.free(output);
            const reopened = try edit.Session.open(a, output);
            defer reopened.close();
            try expectSaved(reopened, output);
            try std.testing.expect(try history.undo(session));
            try expectSaved(session, input);
            try std.testing.expect(try history.redo(session));
            try expectSaved(session, output);
            try exportEvidence("two-sections-before.hwp", input);
            try exportEvidence("two-sections-after.hwp", output);
        }
    }
}
