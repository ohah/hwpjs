const std = @import("std");
const grid = @import("source_table_grid.zig");
const trees = @import("section_tree.zig");
const fields = @import("table_xml_fields.zig");
const a = std.testing.allocator;
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:q='http://www.hancom.co.kr/hwpml/2011/paragraph'><q:p id='90000'><q:run><q:tbl rowCnt='";
const runs = "<q:run charPrIDRef='4'><q:t>한&amp;😀</q:t><q:t/><q:t>&#xAC00;&lt;</q:t></q:run><!--styles--><m:run xmlns:m='http://www.hancom.co.kr/hwpml/2011/paragr&#97;ph' charPrIDRef=\"27\"><m:t>乙&#13;B</m:t><q:t></q:t></m:run><q:run charPrIDRef='9'/><q:run charPrIDRef='10'></q:run>";
// Independent lexical oracle: no production writer, source spans, or replacement
// of input text is used to construct the expected blank shell.
const blank = "<q:run charPrIDRef='4'><q:t></q:t><q:t/><q:t></q:t></q:run><!--styles--><m:run xmlns:m='http://www.hancom.co.kr/hwpml/2011/paragr&#97;ph' charPrIDRef=\"27\"><m:t></m:t><q:t></q:t></m:run><q:run charPrIDRef='9'/><q:run charPrIDRef='10'></q:run>";
const suffix = "</q:tbl></q:run></q:p><q:p id='90001'><q:run><q:t>OUTSIDE&amp;한</q:t></q:run></q:p></s:sec>";
const Spec = struct { id: u32, r: u32, c: u32, body: []const u8 = runs };
fn cell(alloc: std.mem.Allocator, out: *std.ArrayList(u8), spec: Spec) !void {
    try out.print(alloc, "<q:tc borderFillIDRef='7'><q:cellAddr rowAddr='{d}' colAddr='{d}'/><q:subList id='' vertAlign='CENTER'><q:p id='{d}' paraPrIDRef='3' styleIDRef='2'>{s}</q:p></q:subList><q:cellSpan rowSpan='1' colSpan='1'/><q:cellSz width='20' height='10'/></q:tc>", .{ spec.r, spec.c, spec.id, spec.body });
}
fn document(alloc: std.mem.Allocator, rows: u32, cols: u32, specs: []const Spec) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(alloc);
    try out.print(alloc, "{s}{d}' colCnt='{d}'><q:sz width='{d}' height='{d}' widthRelTo='ABSOLUTE' heightRelTo='ABSOLUTE'/>", .{ prefix, rows, cols, cols * 20, rows * 10 });
    for (0..rows) |r| {
        try out.appendSlice(alloc, "<q:tr>");
        for (specs[r * cols .. (r + 1) * cols]) |spec| try cell(alloc, &out, spec);
        try out.appendSlice(alloc, "</q:tr>");
    }
    try out.appendSlice(alloc, suffix);
    return out.toOwnedSlice(alloc);
}
fn request(source: []const u8, rows: u32, cols: u32, command: grid.Command, ids: []const u32) !grid.Request {
    var t = try trees.parse(a, source, 0, 0, .{});
    defer t.deinit(a);
    for (t.elements, 0..) |_, i| if (fields.childIs(&t, i, "tbl")) return .{ .target = .{ .element = i }, .expected_rows = rows, .expected_columns = cols, .command = command, .fresh_paragraph_ids = ids };
    return error.MissingTestTable;
}
const original = [_]Spec{ .{ .id = 1, .r = 0, .c = 0 }, .{ .id = 2, .r = 0, .c = 1 }, .{ .id = 3, .r = 1, .c = 0 }, .{ .id = 4, .r = 1, .c = 1 } };
test "source grid multirun independent full XML all commands and future blank templates" {
    const source = try document(a, 2, 2, &original);
    defer a.free(source);
    const cases = [_]struct { cmd: grid.Command, rows: u32, cols: u32, ids: []const u32, specs: []const Spec }{
        .{ .cmd = .{ .insert_row = 1 }, .rows = 3, .cols = 2, .ids = &.{ 100, 101 }, .specs = &.{ original[0], original[1], .{ .id = 100, .r = 1, .c = 0, .body = blank }, .{ .id = 101, .r = 1, .c = 1, .body = blank }, .{ .id = 3, .r = 2, .c = 0 }, .{ .id = 4, .r = 2, .c = 1 } } },
        .{ .cmd = .{ .insert_column = 1 }, .rows = 2, .cols = 3, .ids = &.{ 100, 101 }, .specs = &.{ original[0], .{ .id = 100, .r = 0, .c = 1, .body = blank }, .{ .id = 2, .r = 0, .c = 2 }, original[2], .{ .id = 101, .r = 1, .c = 1, .body = blank }, .{ .id = 4, .r = 1, .c = 2 } } },
        .{ .cmd = .{ .delete_row = 0 }, .rows = 1, .cols = 2, .ids = &.{}, .specs = &.{ .{ .id = 3, .r = 0, .c = 0 }, .{ .id = 4, .r = 0, .c = 1 } } },
        .{ .cmd = .{ .delete_column = 0 }, .rows = 2, .cols = 1, .ids = &.{}, .specs = &.{ .{ .id = 2, .r = 0, .c = 0 }, .{ .id = 4, .r = 1, .c = 0 } } },
    };
    for (cases) |case| {
        const output = try grid.prepare(a, source, try request(source, 2, 2, case.cmd, case.ids));
        defer a.free(output);
        const expected = try document(a, case.rows, case.cols, case.specs);
        defer a.free(expected);
        try std.testing.expectEqualStrings(expected, output);
        // Reparse and use the inserted blank run shells as the next template.
        if (case.ids.len != 0) {
            const row_edit = case.rows == 3;
            const cmd: grid.Command = if (row_edit) .{ .insert_row = 2 } else .{ .insert_column = 2 };
            const again = try grid.prepare(a, output, try request(output, case.rows, case.cols, cmd, &.{ 102, 103 }));
            defer a.free(again);
            var specs: std.ArrayList(Spec) = .empty;
            defer specs.deinit(a);
            const nr = case.rows + @as(u32, @intFromBool(row_edit));
            const nc = case.cols + @as(u32, @intFromBool(!row_edit));
            var fresh: u32 = 102;
            for (0..nr) |r| for (0..nc) |c| {
                const inserted = if (row_edit) r == 2 else c == 2;
                const sr = r - @intFromBool(row_edit and r > 2);
                const sc = c - @intFromBool(!row_edit and c > 2);
                var spec = if (inserted) Spec{ .id = fresh, .r = @intCast(r), .c = @intCast(c), .body = blank } else case.specs[sr * case.cols + sc];
                if (inserted) fresh += 1;
                spec.r = @intCast(r);
                spec.c = @intCast(c);
                try specs.append(a, spec);
            };
            const expected_again = try document(a, nr, nc, specs.items);
            defer a.free(expected_again);
            try std.testing.expectEqualStrings(expected_again, again);
        }
    }
}

test "source grid multirun rejects unknown attributes children controls caches and multiple owners" {
    const source = try document(a, 2, 2, &original);
    defer a.free(source);
    const cases = [_]struct { from: []const u8, to: []const u8, err: anyerror = error.UnsupportedSourceTableStructure }{
        .{ .from = "<q:run charPrIDRef='9'/>", .to = "<q:run id='unsafe'/>", .err = error.UnsupportedSourceTableAttributes },
        .{ .from = "<m:t>", .to = "<m:t xml:space='preserve'>", .err = error.UnsupportedSourceTableAttributes },
        .{ .from = "<q:t/>", .to = "<q:t opaque='x'/>", .err = error.UnsupportedSourceTableAttributes },
        .{ .from = "<q:run charPrIDRef='9'/>", .to = "<q:run><q:ctrl/></q:run>" },
        .{ .from = "<q:t/>", .to = "<q:t><q:tab/></q:t>" },
        .{ .from = "<q:t/>", .to = "<q:t><q:tbl/></q:t>" },
        .{ .from = "<q:t/>", .to = "<q:t><q:fieldBegin/></q:t>", .err = error.ProtectedFieldRange },
        .{ .from = "<q:t/>", .to = "<q:t/><q:linesegarray/>" },
        .{ .from = "</q:p></q:subList>", .to = "</q:p><q:p id='700'/></q:subList>" },
        .{ .from = "</q:subList>", .to = "</q:subList><q:subList/>" },
        .{ .from = "<q:run charPrIDRef='9'/>", .to = "<q:run>RAW</q:run>" },
        .{ .from = "<q:t/>", .to = "<x:t xmlns:x='urn:unknown'/>" },
    };
    for (cases) |case| {
        const input = try std.mem.replaceOwned(u8, a, source, case.from, case.to);
        defer a.free(input);
        try std.testing.expectError(case.err, grid.prepare(a, input, try request(input, 2, 2, .{ .insert_row = 1 }, &.{ 100, 101 })));
    }
}

fn allocationCase(alloc: std.mem.Allocator, source: []const u8, req: grid.Request, expected: []const u8) !void {
    const result = try grid.prepare(alloc, source, req);
    defer alloc.free(result);
    try std.testing.expectEqualStrings(expected, result);
}
test "source grid multirun full shared allocation failure sweep all commands" {
    const source = try document(a, 2, 2, &original);
    defer a.free(source);
    const baseline = try a.dupe(u8, source);
    defer a.free(baseline);
    for ([_]grid.Command{ .{ .insert_row = 1 }, .{ .insert_column = 1 }, .{ .delete_row = 1 }, .{ .delete_column = 1 } }) |cmd| {
        const insert = switch (cmd) {
            .insert_row, .insert_column => true,
            else => false,
        };
        const req = try request(source, 2, 2, cmd, if (insert) &.{ 100, 101 } else &.{});
        const expected = try grid.prepare(a, source, req);
        defer a.free(expected);
        try @import("../testing/allocation_failures.zig").check(allocationCase, .{ source, req, expected });
        try std.testing.expectEqualStrings(baseline, source);
    }
}

test "source grid multirun tall many run linear assembly with large text bytes" {
    var body: std.ArrayList(u8) = .empty;
    defer body.deinit(a);
    var empty_body: std.ArrayList(u8) = .empty;
    defer empty_body.deinit(a);
    for (0..16) |_| {
        try body.appendSlice(a, runs);
        try empty_body.appendSlice(a, blank);
    }
    var specs: std.ArrayList(Spec) = .empty;
    defer specs.deinit(a);
    for (0..2048) |r| try specs.append(a, .{ .id = @intCast(r + 1), .r = @intCast(r), .c = 0, .body = body.items });
    const source = try document(a, 2048, 1, specs.items);
    defer a.free(source);
    const req = try request(source, 2048, 1, .{ .insert_row = 1024 }, &.{80000});
    const output = try grid.prepare(a, source, req);
    defer a.free(output);
    try specs.insert(a, 1024, .{ .id = 80000, .r = 1024, .c = 0, .body = empty_body.items });
    for (specs.items, 0..) |*spec, r| spec.r = @intCast(r);
    const expected = try document(a, 2049, 1, specs.items);
    defer a.free(expected);
    try std.testing.expectEqualStrings(expected, output);
}

test "source grid multirun accepts exclusively blank run shells on repeated edits" {
    const shells = "<q:run charPrIDRef='21'/><m:run xmlns:m='http://www.hancom.co.kr/hwpml/2011/paragraph' charPrIDRef='22'></m:run>";
    const source = try document(a, 1, 1, &.{.{ .id = 1, .r = 0, .c = 0, .body = shells }});
    defer a.free(source);
    const output = try grid.prepare(a, source, try request(source, 1, 1, .{ .insert_column = 1 }, &.{100}));
    defer a.free(output);
    const expected = try document(a, 1, 2, &.{ .{ .id = 1, .r = 0, .c = 0, .body = shells }, .{ .id = 100, .r = 0, .c = 1, .body = shells } });
    defer a.free(expected);
    try std.testing.expectEqualStrings(expected, output);
    const again = try grid.prepare(a, output, try request(output, 1, 2, .{ .insert_column = 2 }, &.{101}));
    defer a.free(again);
    const expected_again = try document(a, 1, 3, &.{ .{ .id = 1, .r = 0, .c = 0, .body = shells }, .{ .id = 100, .r = 0, .c = 1, .body = shells }, .{ .id = 101, .r = 0, .c = 2, .body = shells } });
    defer a.free(expected_again);
    try std.testing.expectEqualStrings(expected_again, again);
}
