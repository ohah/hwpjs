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

fn mergeCommand(session: *const editor.Session) !history.Command {
    const tree = &session.sections[0].tree;
    for (tree.elements, 0..) |_, i| {
        if (fields.childIs(tree, i, "tbl")) return .{
            .kind = .source_table_cell_merge,
            .paragraph = 0,
            .start = 0,
            .deleted = 0,
            .inserted = "",
            .source_grid_node = i,
            .source_grid_expected_rows = 1,
            .source_grid_expected_columns = 2,
            .source_merge_rectangle = .{ .top = 0, .left = 0, .bottom = 1, .right = 2 },
        };
    }
    return error.MissingTestTable;
}

test "HWPX source cell merge samples allocation failure through the actual owned History" {
    const authored = try authoredTable();
    defer a.free(authored);
    const probes = [_]usize{ 0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233 };
    var total: usize = 0;
    for (0..probes.len + 5) |sample| {
        var fault = std.testing.FailingAllocator.init(a, .{});
        const alloc = fault.allocator();
        var session = try editor.open(alloc, authored, .{});
        defer session.deinit();
        session.history_delta_managed = true;
        var h = try history.History.initV2(&session, .{});
        defer h.deinit();
        try std.testing.expect(try h.apply(&session, .{ .paragraph = 1, .start = 0, .deleted = 0, .inserted = "prior" }));
        const redo = try session.save();
        defer alloc.free(redo);
        try std.testing.expect(try h.undo(&session));
        const before = try session.save();
        defer alloc.free(before);
        const original = session.sections[0].original_basis;
        const pointer = session.source.ptr;
        const command = try mergeCommand(&session);
        const start = fault.alloc_index;
        if (sample == 0) {
            try std.testing.expect(try h.apply(&session, command));
            total = fault.alloc_index - start;
            try std.testing.expect(total > probes[probes.len - 1]);
            std.debug.print("successful merge used {d} allocation attempts\n", .{total});
            // The abandoned redo already used revision 1.
            try std.testing.expectEqual(@as(u32, 2), h.revision());
            const report = try @import("table_geometry.zig").inspectElement(alloc, &session.sections[0].tree, command.source_grid_node, .{});
            try std.testing.expectEqual(@as(usize, 1), report.cells);
            try std.testing.expectEqual(@as(u64, 300), report.cell_fields.size_sum[0]);
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
        const offset = if (sample <= probes.len) probes[sample - 1] else total - (probes.len + 5 - sample);
        fault.fail_index = start + offset;
        const result = h.apply(&session, command);
        fault.fail_index = std.math.maxInt(usize);
        try std.testing.expectError(error.OutOfMemory, result);
        try std.testing.expectEqual(@as(u32, 0), h.revision());
        try std.testing.expectEqual(pointer, session.source.ptr);
        try std.testing.expectEqual(original, session.sections[0].original_basis);
        const after = try session.save();
        defer alloc.free(after);
        try std.testing.expectEqualSlices(u8, before, after);
        try std.testing.expect(try h.redo(&session));
        const recovered = try session.save();
        defer alloc.free(recovered);
        try std.testing.expectEqualSlices(u8, redo, recovered);
    }
}
