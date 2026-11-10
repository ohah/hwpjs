//! Focused synthetic original table XML transformation tests only.
const std = @import("std");
const grid = @import("hwpx/source_table_grid.zig");
const trees = @import("hwpx/section_tree.zig");
const fields = @import("hwpx/table_xml_fields.zig");
const a = std.testing.allocator;
const opening = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:q='http://www.hancom.co.kr/hwpml/2011/paragr&#97;ph'><q:p id='90'><q:run><q:t>BEFORE&amp;</q:t>";
const closing = "<q:t>AFTER</q:t></q:run></q:p><opaque xmlns='urn:opaque' a='1'/></s:sec>";
fn fixture(allocator: std.mem.Allocator, rows: u32, cols: u32) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(allocator);
    try out.appendSlice(allocator, opening);
    const start = try std.fmt.allocPrint(allocator, "<q:tbl rowCnt='{d}' colCnt='{d}' odd='keep &amp; lexical'><q:sz width='{d}' height='{d}' widthRelTo='ABSOLUTE' heightRelTo='ABSOLUTE'/>", .{ rows, cols, cols * 20, rows * 10 });
    defer allocator.free(start);
    try out.appendSlice(allocator, start);
    for (0..rows) |r| {
        try out.appendSlice(allocator, "<q:tr><!--row-->");
        for (0..cols) |c| {
            const cell = try std.fmt.allocPrint(allocator, "<q:tc borderFillIDRef='7' protect='0'><q:subList id='' vertAlign='CENTER'><q:p id='{d}' paraPrIDRef='3'><q:run charPrIDRef='4'><q:t>A&amp;{d}😀</q:t></q:run></q:p></q:subList><q:cellAddr rowAddr='{d}' colAddr='{d}'/><q:cellSpan rowSpan='1' colSpan='1'/><q:cellSz width='20' height='10'/></q:tc>", .{ 1 + r * cols + c, r * cols + c, r, c });
            defer allocator.free(cell);
            try out.appendSlice(allocator, cell);
        }
        try out.appendSlice(allocator, "</q:tr>\n");
    }
    try out.appendSlice(allocator, "</q:tbl>");
    try out.appendSlice(allocator, closing);
    return out.toOwnedSlice(allocator);
}
fn target(source: []const u8) !usize {
    var t = try trees.parse(a, source, 0, 0, .{});
    defer t.deinit(a);
    for (t.elements, 0..) |_, i| if (fields.childIs(&t, i, "tbl")) return i;
    return error.MissingTestTable;
}
fn req(node: usize, command: grid.Command, ids: []const u32) grid.Request {
    return .{ .target = .{ .element = node }, .expected_rows = 2, .expected_columns = 2, .command = command, .fresh_paragraph_ids = ids };
}
fn num(t: *const @import("hwpx/xml_part_tree.zig").Tree, i: usize, name: []const u8) !u32 {
    return (try fields.optionalUnsigned(a, t, i, name, 4096)).?;
}
test "source grid all four commands preserve survivors and non-target bytes" {
    const source = try fixture(a, 2, 2);
    defer a.free(source);
    const node = try target(source);
    const cases = [_]struct { command: grid.Command, ids: []const u32, rows: u32, cols: u32, kept: []const u32 }{
        .{ .command = .{ .insert_row = 1 }, .ids = &.{ 100, 101 }, .rows = 3, .cols = 2, .kept = &.{ 1, 2, 3, 4 } },
        .{ .command = .{ .insert_column = 1 }, .ids = &.{ 100, 101 }, .rows = 2, .cols = 3, .kept = &.{ 1, 2, 3, 4 } },
        .{ .command = .{ .delete_row = 0 }, .ids = &.{}, .rows = 1, .cols = 2, .kept = &.{ 3, 4 } },
        .{ .command = .{ .delete_column = 1 }, .ids = &.{}, .rows = 2, .cols = 1, .kept = &.{ 1, 3 } },
    };
    for (cases) |case| {
        const output = try grid.prepare(a, source, req(node, case.command, case.ids));
        defer a.free(output);
        try std.testing.expect(std.mem.startsWith(u8, output, opening));
        try std.testing.expect(std.mem.endsWith(u8, output, closing));
        try std.testing.expect(std.mem.indexOf(u8, output, "odd='keep &amp; lexical'") != null);
        var t = try trees.parse(a, output, 0, 0, .{});
        defer t.deinit(a);
        try std.testing.expectEqual(case.rows, try num(&t, node, "rowCnt"));
        try std.testing.expectEqual(case.cols, try num(&t, node, "colCnt"));
        var address_count: usize = 0;
        var paragraphs: usize = 0;
        for (t.elements, 0..) |_, i| {
            if (fields.childIs(&t, i, "cellAddr")) {
                try std.testing.expectEqual(@as(u32, @intCast(address_count / case.cols)), try num(&t, i, "rowAddr"));
                try std.testing.expectEqual(@as(u32, @intCast(address_count % case.cols)), try num(&t, i, "colAddr"));
                address_count += 1;
            }
            if (!fields.childIs(&t, i, "p") or i == 1) continue;
            paragraphs += 1;
            const id = try num(&t, i, "id");
            if (id >= 100) {
                try std.testing.expect(std.mem.indexOf(u8, t.sourceOf(i), "<q:t></q:t>") != null);
            } else {
                try std.testing.expect(std.mem.indexOfScalar(u32, case.kept, id) != null);
                var original = try trees.parse(a, source, 0, 0, .{});
                defer original.deinit(a);
                for (original.elements, 0..) |_, oi| if (fields.childIs(&original, oi, "p") and try num(&original, oi, "id") == id) {
                    try std.testing.expectEqualStrings(original.sourceOf(oi), t.sourceOf(i));
                };
            }
        }
        try std.testing.expectEqual(@as(usize, case.rows) * case.cols, address_count);
        try std.testing.expectEqual(address_count, paragraphs);
    }
}
test "source grid edges span selection stale invalid IDs limits and last cell refusal" {
    const source = try fixture(a, 2, 2);
    defer a.free(source);
    const node = try target(source);
    for ([_]grid.Command{ .{ .insert_row = 0 }, .{ .insert_row = 2 }, .{ .insert_column = 0 }, .{ .insert_column = 2 }, .{ .delete_row = 1 }, .{ .delete_column = 0 } }) |command| {
        const insert = switch (command) {
            .insert_row, .insert_column => true,
            else => false,
        };
        const output = try grid.prepare(a, source, req(node, command, if (insert) &.{ 100, 101 } else &.{}));
        a.free(output);
    }
    var request = req(node, .{ .insert_row = 0 }, &.{ 100, 101 });
    var t = try trees.parse(a, source, 0, 0, .{});
    defer t.deinit(a);
    request.target = .{ .span = .{ .start = t.elements[node].start_tag.start, .end = t.elements[node].end } };
    a.free(try grid.prepare(a, source, request));
    request.target.span.end -= 1;
    try std.testing.expectError(error.InvalidSourceTableTarget, grid.prepare(a, source, request));
    request = req(node + 1, .{ .delete_row = 0 }, &.{});
    try std.testing.expectError(error.InvalidSourceTableTarget, grid.prepare(a, source, request));
    request = req(node, .{ .delete_row = 0 }, &.{});
    request.expected_rows = 3;
    try std.testing.expectError(error.StaleSourceTableGrid, grid.prepare(a, source, request));
    for ([_][]const u32{ &.{ 100, 100 }, &.{ 1, 100 }, &.{ 90, 100 }, &.{ 0, 100 }, &.{100} }) |ids| {
        try std.testing.expectError(error.InvalidTableParagraphIds, grid.prepare(a, source, req(node, .{ .insert_row = 0 }, ids)));
    }
    try std.testing.expectError(error.InvalidSourceTableCommand, grid.prepare(a, source, req(node, .{ .delete_column = 2 }, &.{})));
    request = req(node, .{ .insert_row = 0 }, &.{ 100, 101 });
    request.max_cells = 4;
    try std.testing.expectError(error.LimitExceeded, grid.prepare(a, source, request));
    request.max_bytes = 10;
    try std.testing.expectError(error.LimitExceeded, grid.prepare(a, source, request));
    const single = try fixture(a, 1, 1);
    defer a.free(single);
    request = .{ .target = .{ .element = try target(single) }, .expected_rows = 1, .expected_columns = 1, .command = .{ .delete_row = 0 } };
    try std.testing.expectError(error.LastSourceTableDimension, grid.prepare(a, single, request));
    request.command = .{ .delete_column = 0 };
    try std.testing.expectError(error.LastSourceTableDimension, grid.prepare(a, single, request));
}
fn allocationCase(allocator: std.mem.Allocator, source: []const u8, request: grid.Request) !void {
    var backing = NoResize{ .child = allocator };
    const output = try grid.prepare(backing.allocator(), source, request);
    defer allocator.free(output);
    try std.testing.expect(std.mem.startsWith(u8, output, opening));
}
test "source grid every allocation failure is atomic for all commands" {
    const source = try fixture(a, 2, 2);
    defer a.free(source);
    const baseline = try a.dupe(u8, source);
    defer a.free(baseline);
    const node = try target(source);
    for ([_]grid.Command{ .{ .insert_row = 1 }, .{ .insert_column = 1 }, .{ .delete_row = 1 }, .{ .delete_column = 1 } }) |command| {
        const insert = switch (command) {
            .insert_row, .insert_column => true,
            else => false,
        };
        try std.testing.checkAllAllocationFailures(a, allocationCase, .{ source, req(node, command, if (insert) &.{ 100, 101 } else &.{}) });
        try std.testing.expectEqualStrings(baseline, source);
    }
}

// Arena growth may recover from a failed rawResize. Disable that optional
// optimization so each injected backing allocation failure must propagate.
const NoResize = struct {
    child: std.mem.Allocator,
    fn allocator(self: *NoResize) std.mem.Allocator {
        return .{ .ptr = self, .vtable = &.{ .alloc = alloc, .resize = std.mem.Allocator.noResize, .remap = std.mem.Allocator.noRemap, .free = free } };
    }
    fn alloc(ctx: *anyopaque, len: usize, alignment: std.mem.Alignment, ret: usize) ?[*]u8 {
        const self: *NoResize = @ptrCast(@alignCast(ctx));
        return self.child.rawAlloc(len, alignment, ret);
    }
    fn free(ctx: *anyopaque, memory: []u8, alignment: std.mem.Alignment, ret: usize) void {
        const self: *NoResize = @ptrCast(@alignCast(ctx));
        self.child.rawFree(memory, alignment, ret);
    }
};

test "source grid rejects merged nested conditional protected and unknown identity shells" {
    const source = try fixture(a, 2, 2);
    defer a.free(source);
    const cases = [_]struct { needle: []const u8, replacement: []const u8, err: anyerror }{
        .{ .needle = "<q:run charPrIDRef", .replacement = "<q:run>RAW</q:run><q:run charPrIDRef", .err = error.UnsupportedSourceTableStructure },
        .{ .needle = "<q:tr>", .replacement = "<q:tr>RAW", .err = error.UnsupportedSourceTableStructure },
        .{ .needle = "rowSpan='1'", .replacement = "rowSpan='2'", .err = error.MergedSourceTable },
        .{ .needle = "protect='0'", .replacement = "protect='1'", .err = error.ProtectedSourceTable },
        .{ .needle = "<q:subList", .replacement = "<q:tbl/><q:subList", .err = error.UnsupportedSourceTableStructure },
        .{ .needle = "<q:subList", .replacement = "<q:switch/><q:subList", .err = error.UnsupportedSourceTableStructure },
        .{ .needle = "<q:subList", .replacement = "<q:fieldBegin/><q:subList", .err = error.ProtectedFieldRange },
        .{ .needle = "id=''", .replacement = "id='identity'", .err = error.UnsupportedSourceTableStructure },
        .{ .needle = "<q:tr>", .replacement = "<q:tr id='identity'>", .err = error.UnsupportedSourceTableAttributes },
        .{ .needle = "<q:tc", .replacement = "<q:tc opaqueID='identity'", .err = error.UnsupportedSourceTableAttributes },
        .{ .needle = "<q:sz", .replacement = "<q:cellzoneList/><q:sz", .err = error.UnsupportedSourceTableStructure },
        .{ .needle = "<q:sz", .replacement = "<q:sz/><q:sz", .err = error.UnsupportedSourceTableStructure },
        .{ .needle = "colAddr='1'", .replacement = "colAddr='0'", .err = error.InvalidSourceTableGrid },
        .{ .needle = "width='20'", .replacement = "width='0'", .err = error.UnsupportedSourceTableGeometry },
        .{ .needle = "width='40'", .replacement = "width='41'", .err = error.UnsupportedSourceTableGeometry },
        .{ .needle = "'ABSOLUTE'", .replacement = "'PERCENT'", .err = error.UnsupportedSourceTableGeometry },
    };
    for (cases) |case| {
        const bad = try std.mem.replaceOwned(u8, a, source, case.needle, case.replacement);
        defer a.free(bad);
        try std.testing.expectError(case.err, grid.prepare(a, bad, req(try target(bad), .{ .insert_row = 1 }, &.{ 100, 101 })));
    }
    const wrapped = try std.mem.replaceOwned(u8, a, source, "<q:tbl rowCnt", "<q:switch><q:tbl rowCnt");
    defer a.free(wrapped);
    const branch = try std.mem.replaceOwned(u8, a, wrapped, "</q:tbl>", "</q:tbl></q:switch>");
    defer a.free(branch);
    try std.testing.expectError(error.UnsupportedSourceTableStructure, grid.prepare(a, branch, req(try target(branch), .{ .delete_row = 0 }, &.{})));
}

test "source grid preceding style policy keeps nonuniform geometry and empty text namespaces" {
    const source = try fixture(a, 2, 2);
    defer a.free(source);
    var input = try a.dupe(u8, source);
    defer a.free(input);
    for (0..2) |r| {
        const needle = try std.fmt.allocPrint(a, "rowAddr='{d}' colAddr='0'/><q:cellSpan rowSpan='1' colSpan='1'/><q:cellSz width='20'", .{r});
        defer a.free(needle);
        const replacement = try std.fmt.allocPrint(a, "rowAddr='{d}' colAddr='0'/><q:cellSpan rowSpan='1' colSpan='1'/><q:cellSz width='30'", .{r});
        defer a.free(replacement);
        const next = try std.mem.replaceOwned(u8, a, input, needle, replacement);
        a.free(input);
        input = next;
    }
    const next = try std.mem.replaceOwned(u8, a, input, "width='40'", "width='50'");
    a.free(input);
    input = next;
    for ([_]u32{ 1, 3 }, 0..) |id, offset| {
        const needle = try std.fmt.allocPrint(a, "<q:p id='{d}' paraPrIDRef='3'>", .{id});
        defer a.free(needle);
        const replacement = try std.fmt.allocPrint(a, "<q:p id='{d}' paraPrIDRef='{d}'>", .{ id, 17 + offset });
        defer a.free(replacement);
        const updated = try std.mem.replaceOwned(u8, a, input, needle, replacement);
        a.free(input);
        input = updated;
    }
    const output = try grid.prepare(a, input, req(try target(input), .{ .insert_column = 1 }, &.{ 100, 101 }));
    defer a.free(output);
    var t = try trees.parse(a, output, 0, 0, .{});
    defer t.deinit(a);
    for (t.elements, 0..) |_, i| if (fields.childIs(&t, i, "p")) {
        const id = try num(&t, i, "id");
        if (id == 100 or id == 101) try std.testing.expectEqual(id - 100 + 17, try num(&t, i, "paraPrIDRef"));
    };
    var widths: [6]u32 = undefined;
    var count: usize = 0;
    for (t.elements, 0..) |_, i| {
        if (fields.childIs(&t, i, "cellSz")) {
            widths[count] = try num(&t, i, "width");
            count += 1;
        }
        if (fields.childIs(&t, i, "sz")) try std.testing.expectEqual(@as(u32, 80), try num(&t, i, "width"));
    }
    try std.testing.expectEqualSlices(u32, &.{ 30, 30, 20, 30, 30, 20 }, &widths);
}

test "source grid selects second original table and preserves first table bytes" {
    const source = try fixture(a, 2, 2);
    defer a.free(source);
    var original = try trees.parse(a, source, 0, 0, .{});
    defer original.deinit(a);
    const first = try target(source);
    var second = try a.dupe(u8, original.sourceOf(first));
    defer a.free(second);
    for (1..5) |id| {
        const needle = try std.fmt.allocPrint(a, "<q:p id='{d}'", .{id});
        defer a.free(needle);
        const replacement = try std.fmt.allocPrint(a, "<q:p id='{d}'", .{id + 100});
        defer a.free(replacement);
        const next = try std.mem.replaceOwned(u8, a, second, needle, replacement);
        a.free(second);
        second = next;
    }
    const combined = try std.fmt.allocPrint(a, "{s}{s}{s}", .{ source[0..original.elements[first].end], second, source[original.elements[first].end..] });
    defer a.free(combined);
    var t = try trees.parse(a, combined, 0, 0, .{});
    defer t.deinit(a);
    var second_index: usize = 0;
    for (t.elements, 0..) |_, i| if (i != first and fields.childIs(&t, i, "tbl")) {
        second_index = i;
    };
    const out = try grid.prepare(a, combined, req(second_index, .{ .insert_row = 2 }, &.{ 201, 202 }));
    defer a.free(out);
    try std.testing.expectEqualStrings(combined[0..t.elements[second_index].start_tag.start], out[0..t.elements[second_index].start_tag.start]);
    try std.testing.expect(std.mem.endsWith(u8, out, combined[t.elements[second_index].end..]));
}

test "source grid accepts self-closing empty text and refuses output growth budget" {
    const source = try fixture(a, 2, 2);
    defer a.free(source);
    const empty = try std.mem.replaceOwned(u8, a, source, "<q:t>A&amp;0😀</q:t>", "<q:t/>");
    defer a.free(empty);
    var request = req(try target(empty), .{ .insert_row = 0 }, &.{ 100, 101 });
    const out = try grid.prepare(a, empty, request);
    defer a.free(out);
    try std.testing.expect(std.mem.indexOf(u8, out, "<q:p id='100' paraPrIDRef='3'><q:run charPrIDRef='4'><q:t/>") != null);
    request.max_bytes = empty.len;
    try std.testing.expectError(error.LimitExceeded, grid.prepare(a, empty, request));
}

test "source grid tall single column preserves linear ordered assembly" {
    const original = try fixture(a, 2048, 1);
    defer a.free(original);
    const source = try std.mem.replaceOwned(u8, a, original, "<q:p id='90'><q:run>", "<q:p id='90000'><q:run>");
    defer a.free(source);
    const node = try target(source);
    const output = try grid.prepare(a, source, .{
        .target = .{ .element = node },
        .expected_rows = 2048,
        .expected_columns = 1,
        .command = .{ .insert_row = 1024 },
        .fresh_paragraph_ids = &.{9000},
    });
    defer a.free(output);
    var tree = try trees.parse(a, output, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqual(@as(u32, 2049), try num(&tree, node, "rowCnt"));
    var count: u32 = 0;
    for (tree.elements, 0..) |_, i| if (fields.childIs(&tree, i, "cellAddr")) {
        try std.testing.expectEqual(count, try num(&tree, i, "rowAddr"));
        count += 1;
    };
    try std.testing.expectEqual(@as(u32, 2049), count);
}
