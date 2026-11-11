const std = @import("std");
const editor = @import("editor_session.zig");
const history = @import("editor_history.zig");
const fields = @import("table_xml_fields.zig");
const a = std.testing.allocator;
fn authoredTable() ![]u8 {
    const blank = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(blank);
    var document = try @import("package.zig").inspectDocument(a, blank, .{});
    defer document.deinit(a);
    for (document.archive.entries, 0..) |entry, i| {
        if (!std.mem.eql(u8, entry.name, "Contents/section0.xml")) continue;
        const source = try document.archive.decode(entry, 1024 * 1024);
        defer a.free(source);
        const table = comptime "<hp:p id='10' paraPrIDRef='0' styleIDRef='0'><hp:run charPrIDRef='0'>" ++
            "<hp:tbl id='20' rowCnt='1' colCnt='2'><hp:sz width='300' height='100' widthRelTo='ABSOLUTE' heightRelTo='ABSOLUTE'/>" ++
            "<hp:tr>" ++ cell(1, 0, 100, "A😀") ++ cell(2, 1, 200, "B<hp:tab width='100'/>C") ++
            "</hp:tr></hp:tbl></hp:run></hp:p></hs:sec>";
        const updated = try std.mem.replaceOwned(u8, a, source, "</hs:sec>", table);
        defer a.free(updated);
        return @import("../zip/replace_writer.zig").write(a, blank, &.{.{ .entry_index = i, .bytes = updated }}, .{});
    }
    return error.MissingTestSection;
}

fn cell(comptime id: u32, comptime column: u32, comptime width: u32, comptime text: []const u8) []const u8 {
    return std.fmt.comptimePrint("<hp:tc borderFillIDRef='1'><hp:subList id=''><hp:p id='{d}' paraPrIDRef='0' styleIDRef='0'><hp:run charPrIDRef='0'><hp:t>{s}</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr='{d}' rowAddr='0'/><hp:cellSpan rowSpan='1' colSpan='1'/><hp:cellSz width='{d}' height='100'/></hp:tc>", .{ id, text, column, width });
}

fn command(session: *const editor.Session, split: bool) !history.Command {
    const tree = &session.sections[0].tree;
    for (tree.elements, 0..) |_, i| if (fields.childIs(tree, i, "tbl")) return .{
        .kind = if (split) .source_table_cell_split else .source_table_cell_merge,
        .paragraph = 0,
        .start = 0,
        .deleted = 0,
        .inserted = "",
        .source_grid_node = i,
        .source_grid_expected_rows = 1,
        .source_grid_expected_columns = 2,
        .source_merge_rectangle = .{ .top = 0, .left = 0, .bottom = 1, .right = 2 },
        .source_split_options = .{
            .rectangle = .{ .top = 0, .left = 0, .bottom = 1, .right = 2 },
            .selected_cells = 1,
            .rows = 2,
            .columns = 2,
            .mode = .each,
            .equalize_rows = true,
        },
    };
    return error.MissingTestTable;
}

test "HWPX source cell split owned History allocation samples preserve merged contents and redo" {
    const authored = try authoredTable();
    defer a.free(authored);
    const probes = [_]usize{ 0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233 };
    var allocations: usize = 0;
    for (0..probes.len + 5) |sample| {
        var failure = std.testing.FailingAllocator.init(a, .{});
        const alloc = failure.allocator();
        var session = try editor.open(alloc, authored, .{});
        defer session.deinit();
        session.history_delta_managed = true;
        var h = try history.History.initV2(&session, .{});
        defer h.deinit();
        try std.testing.expect(try h.apply(&session, try command(&session, false)));
        try std.testing.expect(try h.apply(&session, .{ .paragraph = 1, .start = 0, .deleted = 0, .inserted = "prior" }));
        const redo = try session.save();
        defer alloc.free(redo);
        try std.testing.expect(try h.undo(&session));
        const before = try session.save();
        defer alloc.free(before);
        const basis = session.sections[0].original_basis;
        const pointer = session.source.ptr;
        const split = try command(&session, true);
        const start = failure.alloc_index;
        if (sample == 0) {
            try std.testing.expect(try h.apply(&session, split));
            allocations = failure.alloc_index - start;
            std.debug.print("source split successful allocation attempts={d}\n", .{allocations});
            try std.testing.expect(allocations > probes[probes.len - 1]);
            try std.testing.expectEqual(@as(u32, 3), h.revision());
            const after = try session.save();
            defer alloc.free(after);
            try std.testing.expect(try h.undo(&session));
            const undone = try session.save();
            defer alloc.free(undone);
            try std.testing.expectEqualSlices(u8, before, undone);
            try std.testing.expect(try h.redo(&session));
            const redone = try session.save();
            defer alloc.free(redone);
            try std.testing.expectEqualSlices(u8, after, redone);
            continue;
        }
        const offset = if (sample <= probes.len) probes[sample - 1] else allocations - (probes.len + 5 - sample);
        failure.fail_index = start + offset;
        const result = h.apply(&session, split);
        failure.fail_index = std.math.maxInt(usize);
        try std.testing.expectError(error.OutOfMemory, result);
        try std.testing.expectEqual(@as(u32, 1), h.revision());
        try std.testing.expectEqual(pointer, session.source.ptr);
        try std.testing.expectEqual(basis, session.sections[0].original_basis);
        const actual = try session.save();
        defer alloc.free(actual);
        try std.testing.expectEqualSlices(u8, before, actual);
        try std.testing.expect(try h.redo(&session));
        const recovered = try session.save();
        defer alloc.free(recovered);
        try std.testing.expectEqualSlices(u8, redo, recovered);
    }
}

test "HWPX source cell split linear work for N32 N64 N128 independent source cells" {
    const split = @import("source_table_cell_split.zig");
    for ([_]u32{ 32, 64, 128 }) |n| {
        var source: std.ArrayList(u8) = .empty;
        defer source.deinit(a);
        try source.appendSlice(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:hp='http://www.hancom.co.kr/hwpml/2011/paragraph'><hp:p id='0'><hp:run><hp:tbl id='1' rowCnt='1' colCnt='");
        const start = try std.fmt.allocPrint(a, "{d}'><hp:sz width='{d}' height='100' widthRelTo='ABSOLUTE' heightRelTo='ABSOLUTE'/><hp:tr>", .{ n, n * 100 });
        defer a.free(start);
        try source.appendSlice(a, start);
        for (0..n) |i| {
            const text = try std.fmt.allocPrint(a, "<hp:tc><hp:subList id=''><hp:p id='{d}'><hp:run><hp:t>original😀</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr rowAddr='0' colAddr='{d}'/><hp:cellSpan rowSpan='1' colSpan='1'/><hp:cellSz width='100' height='100'/></hp:tc>", .{ i + 1, i });
            defer a.free(text);
            try source.appendSlice(a, text);
        }
        try source.appendSlice(a, "</hp:tr></hp:tbl></hp:run></hp:p></s:sec>");
        const ids = try a.alloc(u32, n);
        defer a.free(ids);
        for (ids, 0..) |*id, i| id.* = @intCast(1000 + i);
        var tree = try @import("section_tree.zig").parse(a, source.items, 0, 0, .{});
        defer tree.deinit(a);
        var table: ?usize = null;
        for (tree.elements, 0..) |_, i| if (fields.childIs(&tree, i, "tbl")) {
            table = i;
            break;
        };
        const result = try split.prepare(a, source.items, .{
            .target = .{ .element = table.? },
            .expected_rows = 1,
            .expected_columns = n,
            .options = .{ .rectangle = .{ .top = 0, .left = 0, .bottom = 1, .right = n }, .selected_cells = n, .rows = 1, .columns = 2, .mode = .each, .equalize_rows = false },
            .fresh_paragraph_ids = ids,
        });
        defer a.free(result);
        try std.testing.expectEqual(@as(usize, n), split.Work.source_cells);
        try std.testing.expectEqual(@as(usize, 4 * n + 4), split.Work.axis_links);
        try std.testing.expectEqual(@as(usize, 2 * n), split.Work.emitted_cells);
        try std.testing.expectEqual(@as(usize, 2 * n), split.Work.output_slots);
        std.debug.print("N={d} source={d} links={d} emitted={d} slots={d} input={d} output={d}\n", .{
            n,                       split.Work.source_cells, split.Work.axis_links, split.Work.emitted_cells,
            split.Work.output_slots, source.items.len,        result.len,
        });
    }
}
