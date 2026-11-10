//! Independent synthetic oracle: official HWP5 record framing and fixed fields.
//! No fixture, reference implementation or shared coordinate-plan expectations.
const std = @import("std");
const file_grid = @import("source_table_grid_file.zig");
const Source = @import("../text_source.zig").Source;
const wire = @import("../record.zig");
const writer = @import("../record_writer.zig");
const Layout = @import("../body/list_header.zig").Layout;
const Command = @import("../../model/table_grid_edit_plan.zig").Command;
const a = std.testing.allocator;
const version = @import("../version.zig").Version{ .raw = 0x05000302 };
const budget = 16384;
const fresh = [_]u32{ 4, 5 };
const Mutation = enum { none, merged, extra_cell, extra_table, zones, caption, nested, cache, unknown_child, tracking };
fn put(comptime T: type, bytes: []u8, at: usize, value: T) void {
    std.mem.writeInt(T, bytes[at..][0..@sizeOf(T)], value, .little);
}
fn header(id: u32, units: u32) [24]u8 {
    var b: [24]u8 = @splat(0);
    put(u32, &b, 0, 0x80000000 | units);
    put(u16, &b, 8, @intCast(id % 7));
    b[10] = @intCast(id % 5);
    put(u16, &b, 12, 2);
    put(u32, &b, 18, id);
    put(u16, &b, 22, 0);
    return b;
}
fn fixture(layout: Layout, mutation: Mutation) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    var host = header(700, 1);
    put(u16, &host, 12, 1);
    try writer.append(a, &out, 66, 0, &host, budget);
    try writer.append(a, &out, 67, 1, &.{ 13, 0 }, budget);
    try writer.append(a, &out, 68, 1, &(@as([8]u8, @splat(0))), budget);
    // Unknown non-target record must survive byte-for-byte.
    try writer.append(a, &out, 900, 1, "prefix opaque", budget);
    var common: [46]u8 = @splat(0);
    put(u32, &common, 0, 0x74626c20); // official 'tbl ' control ID
    put(u32, &common, 4, 0x6a2211);
    put(i32, &common, 8, -19);
    put(u32, &common, 16, 101);
    put(u32, &common, 20, 34);
    put(u32, &common, 36, 800);
    try writer.append(a, &out, 71, 1, &common, budget);
    if (mutation == .caption) {
        var caption: [30]u8 = @splat(0);
        put(u16, &caption, 0, 1);
        try writer.append(a, &out, 72, 2, &caption, budget);
        var ch = header(777, 1);
        put(u16, &ch, 12, 1);
        try writer.append(a, &out, 66, 2, &ch, budget);
        try writer.append(a, &out, 67, 3, &.{ 13, 0 }, budget);
        try writer.append(a, &out, 68, 3, &(@as([8]u8, @splat(0))), budget);
    }
    var table: [36]u8 = @splat(0);
    put(u32, &table, 0, 5);
    put(u16, &table, 4, 2);
    put(u16, &table, 6, 2);
    put(u16, &table, 10, 3);
    put(u16, &table, 18, 2);
    put(u16, &table, 20, 2);
    put(u16, &table, 22, 9);
    if (mutation == .zones) put(u16, &table, 24, 1);
    const table_len: usize = if (mutation == .zones) 36 else if (mutation == .extra_table) 27 else 26;
    try writer.append(a, &out, 77, 2, table[0..table_len], budget);
    for (0..4) |i| {
        var cell: [35]u8 = @splat(0);
        put(u16, &cell, 0, 1);
        const base: usize = if (layout == .spec6) 6 else 8;
        const attr: usize = if (layout == .spec6) 2 else 4;
        if (layout == .observed8) put(u16, &cell, 2, 0x1234);
        put(u32, &cell, attr, @intCast(0x20 + i));
        put(u16, &cell, base, @intCast(i % 2));
        put(u16, &cell, base + 2, @intCast(i / 2));
        put(u16, &cell, base + 4, if (mutation == .merged and i == 0) 2 else 1);
        put(u16, &cell, base + 6, 1);
        put(u32, &cell, base + 8, if (i % 2 == 0) 51 else 50);
        put(u32, &cell, base + 12, 17);
        put(u16, &cell, base + 16, @intCast(i + 1));
        put(u16, &cell, base + 24, @intCast(i + 2));
        try writer.append(a, &out, 72, 2, cell[0 .. base + 26 + @intFromBool(mutation == .extra_cell and i == 0)], budget);
        var h = header(@intCast(101 + i), 4);
        if (mutation == .tracking and i == 0) put(u16, &h, 22, 1);
        if (mutation == .cache and i == 0) put(u16, &h, 16, 1);
        try writer.append(a, &out, 66, 2, &h, budget);
        // Distinct letter + surrogate pair + paragraph terminator.
        var text = [_]u8{ @intCast(65 + i), 0, 0x3d, 0xd8, 0x00, 0xde, 13, 0 };
        try writer.append(a, &out, 67, 3, &text, budget);
        var runs: [16]u8 = @splat(0);
        put(u32, &runs, 4, @intCast(10 + i));
        put(u32, &runs, 8, 1);
        put(u32, &runs, 12, @intCast(20 + i));
        try writer.append(a, &out, 68, 3, &runs, budget);
        if (i == 0) switch (mutation) {
            .nested => try writer.append(a, &out, 71, 3, &common, budget),
            .unknown_child => try writer.append(a, &out, 900, 3, "opaque cell", budget),
            .cache => try writer.append(a, &out, 69, 3, &(@as([36]u8, @splat(0))), budget),
            else => {},
        };
    }
    var tail = header(701, 1);
    put(u16, &tail, 12, 1);
    try writer.append(a, &out, 66, 0, &tail, budget);
    try writer.append(a, &out, 67, 1, &.{ 13, 0 }, budget);
    try writer.append(a, &out, 68, 1, &(@as([8]u8, @splat(0))), budget);
    try writer.append(a, &out, 901, 0, "tail opaque", budget);
    return out.toOwnedSlice(a);
}
fn records(bytes: []const u8) ![]wire.Record {
    var out: std.ArrayList(wire.Record) = .empty;
    errdefer out.deinit(a);
    var it = wire.Iterator.init(bytes, .{});
    while (try it.next()) |r| try out.append(a, r);
    return out.toOwnedSlice(a);
}
fn check(source: []const u8, output: []const u8, layout: Layout, rows: usize, columns: usize, matrix: []const i8, templates: []const u8) !void {
    const before = try records(source);
    defer a.free(before);
    const after = try records(output);
    defer a.free(after);
    try std.testing.expectEqual(6 + rows * columns * 4 + 4, after.len);
    for (0..4) |i| try std.testing.expectEqualSlices(u8, before[i].raw, after[i].raw);
    for (0..4) |i| try std.testing.expectEqualSlices(u8, before[before.len - 4 + i].raw, after[after.len - 4 + i].raw);
    var common: [46]u8 = undefined;
    @memcpy(&common, before[4].payload);
    var expected_width: u32 = 0;
    for (0..columns) |c| {
        const original: usize = if (matrix[c] >= 0) @intCast(matrix[c]) else templates[c];
        const base: usize = if (layout == .spec6) 6 else 8;
        expected_width += std.mem.readInt(u32, before[6 + original * 4].payload[base + 8 ..][0..4], .little);
    }
    put(u32, &common, 16, expected_width);
    put(u32, &common, 20, @intCast(rows * 17));
    try std.testing.expectEqualSlices(u8, &common, after[4].payload);
    const t = after[5].payload;
    try std.testing.expectEqual(@as(u16, @intCast(rows)), std.mem.readInt(u16, t[4..6], .little));
    try std.testing.expectEqual(@as(u16, @intCast(columns)), std.mem.readInt(u16, t[6..8], .little));
    try std.testing.expectEqualSlices(u8, before[5].payload[0..4], t[0..4]);
    try std.testing.expectEqualSlices(u8, before[5].payload[8..18], t[8..18]);
    for (0..rows) |r| try std.testing.expectEqual(@as(u16, @intCast(columns)), std.mem.readInt(u16, t[18 + r * 2 ..][0..2], .little));
    try std.testing.expectEqualSlices(u8, before[5].payload[22..], t[18 + rows * 2 ..]);
    var new_index: usize = 0;
    for (matrix, 0..) |old, i| {
        const start = 6 + i * 4;
        const original: usize = if (old >= 0) @intCast(old) else templates[i];
        const old_start = 6 + original * 4;
        const base: usize = if (layout == .spec6) 6 else 8;
        var expected: [34]u8 = undefined;
        const n = before[old_start].payload.len;
        @memcpy(expected[0..n], before[old_start].payload);
        put(u16, &expected, base, @intCast(i % columns));
        put(u16, &expected, base + 2, @intCast(i / columns));
        try std.testing.expectEqualSlices(u8, expected[0..n], after[start].payload);
        try std.testing.expectEqual(@as(u10, 72), after[start].tag);
        try std.testing.expectEqual(@as(u10, 2), after[start].level);
        if (old >= 0) {
            for (1..4) |j| try std.testing.expectEqualSlices(u8, before[old_start + j].raw, after[start + j].raw);
        } else {
            var h: [24]u8 = undefined;
            @memcpy(&h, before[old_start + 1].payload);
            put(u32, &h, 0, 0x80000001);
            put(u16, &h, 12, 1);
            put(u32, &h, 18, fresh[new_index]);
            new_index += 1;
            try std.testing.expectEqualSlices(u8, &h, after[start + 1].payload);
            try std.testing.expectEqualSlices(u8, &.{ 13, 0 }, after[start + 2].payload);
            try std.testing.expectEqualSlices(u8, before[old_start + 3].payload[0..8], after[start + 3].payload);
            for (1..4) |j| {
                try std.testing.expectEqual(@as(u10, @intCast(65 + j)), after[start + j].tag);
                try std.testing.expectEqual(@as(u10, if (j == 1) 2 else 3), after[start + j].level);
            }
        }
    }
}

fn wrap(raw: []const u8, compressed: bool, flags: u32) ![]u8 {
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const s = arena.allocator();
    var head: [256]u8 = @splat(0);
    @memcpy(head[0..17], "HWP Document File");
    put(u32, &head, 32, version.raw);
    put(u32, &head, 36, flags | @intFromBool(compressed));
    var info: std.ArrayList(u8) = .empty;
    var props: [26]u8 = @splat(0);
    put(u16, &props, 0, 2);
    try writer.append(s, &info, 16, 0, &props, budget);
    try writer.append(s, &info, 17, 0, &(@as([72]u8, @splat(0))), budget);
    var other: std.ArrayList(u8) = .empty;
    for ([_]u32{ 1, 2, 3, 0, 1 }) |id| {
        var h = header(id, 1);
        put(u16, &h, 12, 1);
        try writer.append(s, &other, 66, 0, &h, budget);
        try writer.append(s, &other, 67, 1, &.{ 13, 0 }, budget);
        try writer.append(s, &other, 68, 1, &(@as([8]u8, @splat(0))), budget);
    }
    const deflate = @import("../../compression/raw_deflate.zig");
    return @import("../../cfb/writer.zig").write(a, &.{
        .{ .name = "Root Entry", .kind = 5, .clsid = @splat(0x12), .state = 0x1234, .modified = 12345 },
        .{ .name = "FileHeader", .parent = 0, .content = &head },
        .{ .name = "DocInfo", .parent = 0, .content = if (compressed) try deflate.encodeStored(s, info.items, budget) else info.items },
        .{ .name = "BodyText", .parent = 0, .kind = 1, .clsid = @splat(0x34), .state = 0x5678, .created = 67890, .modified = 78901 },
        .{ .name = "Section0", .parent = 3, .content = if (compressed) try deflate.encodeStored(s, raw, budget) else raw },
        .{ .name = "Section1", .parent = 3, .content = if (compressed) try deflate.encodeStored(s, other.items, budget) else other.items },
        .{ .name = "PrvText", .parent = 0, .content = "opaque preview" },
        .{ .name = "Unknown", .parent = 0, .state = 0x9012, .content = "uninspected bytes" },
    }, .{});
}
fn req(command: Command, layout: Layout) file_grid.Request {
    return .{ .section = 0, .table_node = 5, .expected_rows = 2, .expected_columns = 2, .command = command, .layout = layout };
}
const Case = struct { command: Command, rows: usize, columns: usize, matrix: []const i8, templates: []const u8 };
const cases = [_]Case{
    .{ .command = .{ .insert_row = 1 }, .rows = 3, .columns = 2, .matrix = &.{ 0, 1, -1, -1, 2, 3 }, .templates = &.{ 0, 1, 0, 1, 2, 3 } },
    .{ .command = .{ .insert_column = 1 }, .rows = 2, .columns = 3, .matrix = &.{ 0, -1, 1, 2, -1, 3 }, .templates = &.{ 0, 0, 1, 2, 2, 3 } },
    .{ .command = .{ .delete_row = 0 }, .rows = 1, .columns = 2, .matrix = &.{ 2, 3 }, .templates = &.{ 2, 3 } },
    .{ .command = .{ .delete_column = 0 }, .rows = 2, .columns = 1, .matrix = &.{ 1, 3 }, .templates = &.{ 1, 3 } },
};
fn preserved(before: *Source, after: *Source) !void {
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const s = arena.allocator();
    try std.testing.expectEqual(before.file.entries.len, after.file.entries.len);
    const target = (try before.file.findExact("/BodyText/Section0")).?;
    for (before.file.entries, 0..) |entry, index| {
        if (entry.kind == 0) continue;
        const path = try before.file.rootRelativePath(index);
        const other = after.file.entries[(try after.file.findExact(path)).?];
        try std.testing.expectEqual(entry.kind, other.kind);
        try std.testing.expectEqualSlices(u8, &entry.clsid, &other.clsid);
        try std.testing.expectEqual(entry.state, other.state);
        try std.testing.expectEqual(entry.created, other.created);
        try std.testing.expectEqual(entry.modified, other.modified);
        if (entry.kind != 2 or index == target) continue;
        try std.testing.expectEqualSlices(u8, try before.file.readStream(s, entry.path), try after.file.readStream(s, entry.path));
    }
}
fn attempt(allocator: std.mem.Allocator, input: []const u8, baseline: []const u8, r: file_grid.Request) !void {
    defer std.testing.expectEqualSlices(u8, baseline, input) catch @panic("input modified");
    const output = try file_grid.transform(allocator, input, r, .{});
    defer allocator.free(output);
}
test "HWP5 source file grid all four commands compressed and raw save reopen exact oracle document IDs" {
    for ([_]Layout{ .spec6, .observed8 }) |layout| for ([_]bool{ false, true }) |compressed| {
        const raw = try fixture(layout, .none);
        defer a.free(raw);
        const input = try wrap(raw, compressed, 0);
        defer a.free(input);
        const baseline = try a.dupe(u8, input);
        defer a.free(baseline);
        var before = try Source.open(a, input);
        defer before.deinit();
        for (cases) |c| {
            const output = try file_grid.transform(a, input, req(c.command, layout), .{});
            defer a.free(output);
            var after = try Source.open(a, output);
            defer after.deinit();
            const decoded = try after.decodeSection(a, 0);
            defer a.free(decoded);
            try check(raw, decoded, layout, c.rows, c.columns, c.matrix, c.templates);
            try preserved(&before, &after);
            try std.testing.expectEqualSlices(u8, baseline, input);
            const repeated = try file_grid.transform(a, input, req(c.command, layout), .{});
            defer a.free(repeated);
            try std.testing.expectEqualSlices(u8, output, repeated);
        }
    };
}
test "HWP5 source file grid rejects unsafe features complex structures bindings and aggregate limits" {
    for ([_]Mutation{ .merged, .extra_cell, .extra_table, .zones, .caption, .nested, .cache, .unknown_child, .tracking }) |mutation| {
        const raw = try fixture(.observed8, mutation);
        defer a.free(raw);
        const input = try wrap(raw, true, 0);
        defer a.free(input);
        var r = req(.{ .insert_row = 1 }, .observed8);
        if (mutation == .caption) r.table_node = 9;
        try std.testing.expectError(error.UnsupportedSourceTableGrid, file_grid.transform(a, input, r, .{}));
    }
    const raw = try fixture(.observed8, .none);
    defer a.free(raw);
    for ([_]u32{ 1 << 6, 1 << 7, 1 << 9 }) |flag| {
        const input = try wrap(raw, false, flag);
        defer a.free(input);
        try std.testing.expectError(error.UnsupportedSourceTableGridSaveFeatures, file_grid.transform(a, input, req(.{ .insert_row = 1 }, .observed8), .{}));
    }
    const input = try wrap(raw, true, 0);
    defer a.free(input);
    const r = req(.{ .insert_row = 1 }, .observed8);
    var bad = r;
    bad.section = 2;
    try std.testing.expectError(error.InvalidSection, file_grid.transform(a, input, bad, .{}));
    bad = r;
    bad.expected_rows = 3;
    try std.testing.expectError(error.SourceBindingMismatch, file_grid.transform(a, input, bad, .{}));
    bad = r;
    bad.table_node = 0;
    try std.testing.expectError(error.InvalidSourceTableGridTarget, file_grid.transform(a, input, bad, .{}));
    for ([_]file_grid.Options{
        .{ .max_input_bytes = 1 },               .{ .max_output_bytes = 1 }, .{ .max_section_bytes = 1 },
        .{ .max_decoded_bytes = raw.len + 106 }, .{ .max_records = 30 },     .{ .max_paragraphs = 10 },
        .{ .max_cells = 4 },
    }) |options| try std.testing.expectError(error.LimitExceeded, file_grid.transform(a, input, r, options));
}
test "HWP5 source file grid allocation failure sweep four commands preserves input" {
    const raw = try fixture(.observed8, .none);
    defer a.free(raw);
    const input = try wrap(raw, true, 0);
    defer a.free(input);
    const baseline = try a.dupe(u8, input);
    defer a.free(baseline);
    for (cases) |c| try @import("../../testing/allocation_failures.zig").check(attempt, .{ input, baseline, req(c.command, .observed8) });
}

const Totals = struct { bytes: usize, count: usize };
fn decodedTotals(input: []const u8) !Totals {
    var source = try Source.open(a, input);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, budget);
    defer a.free(info);
    var total: Totals = .{ .bytes = info.len, .count = 0 };
    var it = wire.Iterator.init(info, .{});
    while (try it.next()) |_| total.count += 1;
    for (0..source.section_count) |index| {
        const raw = try source.decodeSection(a, index);
        defer a.free(raw);
        total.bytes += raw.len;
        it = wire.Iterator.init(raw, .{});
        while (try it.next()) |_| total.count += 1;
    }
    return total;
}
fn expectLimit(input: []const u8, r: file_grid.Request, options: file_grid.Options) !void {
    if (file_grid.transform(a, input, r, options)) |output| {
        a.free(output);
        return error.ExpectedLimitExceeded;
    } else |err| try std.testing.expectEqual(error.LimitExceeded, err);
}
fn outputBudgetRegression(comptime record_cap: bool) !void {
    const raw = try fixture(.observed8, .none);
    defer a.free(raw);
    for ([_]bool{ false, true }) |compressed| {
        const input = try wrap(raw, compressed, 0);
        defer a.free(input);
        const baseline = try a.dupe(u8, input);
        defer a.free(baseline);
        defer std.testing.expectEqualSlices(u8, baseline, input) catch @panic("input modified");
        const totals = try decodedTotals(input);
        var options: file_grid.Options = .{};
        if (record_cap) options.max_records = totals.count else options.max_decoded_bytes = totals.bytes;
        // Deletion proves that this exact input is admitted at its own total.
        const smaller = try file_grid.transform(a, input, req(.{ .delete_row = 0 }, .observed8), options);
        defer a.free(smaller);
        for (cases[0..2]) |c| {
            const unrestricted = try file_grid.transform(a, input, req(c.command, .observed8), .{});
            defer a.free(unrestricted);
            const larger = try decodedTotals(unrestricted);
            try std.testing.expect(larger.bytes > totals.bytes);
            try std.testing.expect(larger.count > totals.count);
            std.debug.print("input fits: decoded {d}->{d}, records {d}->{d}, compressed={} cap={s}\n", .{ totals.bytes, larger.bytes, totals.count, larger.count, compressed, if (record_cap) "records" else "bytes" });
            try expectLimit(input, req(c.command, .observed8), options);
        }
    }
}
test "HWP5 source file grid input fits output exceeds decoded byte aggregate" {
    try outputBudgetRegression(false);
}
test "HWP5 source file grid input fits output exceeds record aggregate" {
    try outputBudgetRegression(true);
}

const approved_fixture = "/zig-out/verification/created-table-ui-r1/browser-public-r1/vanilla-hwp5.hwp";
const candidate_suffix = "/zig-out/verification/document-transforms-connect-r1/source";
// Pure lexical gate: no stat, realpath, open or hash of the supplied path.
fn requireApprovedFixture(root: []const u8, supplied: []const u8) !void {
    if (!std.fs.path.isAbsolute(supplied) or supplied.len != root.len + approved_fixture.len or
        !std.mem.startsWith(u8, supplied, root) or !std.mem.endsWith(u8, supplied, approved_fixture)) return error.UnapprovedSourceGridFixture;
}
test "HWP5 source file grid fixture gate rejects protected unowned malformed paths before IO" {
    const root = "/independent-workspace";
    try requireApprovedFixture(root, root ++ approved_fixture);
    const rejected = [_][]const u8{
        "",                                        "relative.hwp",                                          root ++ "/legacy/hwpers/private.hwp",
        root ++ "/hwpers_test4_complex_table.hwp", root ++ "/tests/hwpx/title-column-roundtrip.test.mjs",   "/unowned" ++ approved_fixture,
        root ++ "/other.hwp",                      root ++ "/../independent-workspace" ++ approved_fixture, root ++ "/" ++ approved_fixture,
        root ++ approved_fixture ++ "/..",         root ++ approved_fixture ++ "\x00",
    };
    for (rejected) |path| try std.testing.expectError(error.UnapprovedSourceGridFixture, requireApprovedFixture(root, path));
}

test "HWP5 source file grid output exact aggregate boundary safe reopen metadata identity" {
    const raw = try fixture(.observed8, .none);
    defer a.free(raw);
    for ([_]bool{ false, true }) |compressed| {
        const input = try wrap(raw, compressed, 0);
        defer a.free(input);
        const baseline = try a.dupe(u8, input);
        defer a.free(baseline);
        defer std.testing.expectEqualSlices(u8, baseline, input) catch @panic("input modified");
        for (cases[0..2]) |c| {
            const r = req(c.command, .observed8);
            const expected = try file_grid.transform(a, input, r, .{});
            defer a.free(expected);
            const totals = try decodedTotals(expected);
            const options: file_grid.Options = .{ .max_decoded_bytes = totals.bytes, .max_records = totals.count, .max_paragraphs = 13 };
            const output = try file_grid.transform(a, input, r, options);
            defer a.free(output);
            try std.testing.expectEqualSlices(u8, expected, output);
            var before = try Source.open(a, input);
            defer before.deinit();
            var after = try Source.open(a, output);
            defer after.deinit();
            try preserved(&before, &after);
            var under = options;
            under.max_decoded_bytes -= 1;
            try expectLimit(input, r, under);
            under = options;
            under.max_records -= 1;
            try expectLimit(input, r, under);
            under = options;
            under.max_paragraphs -= 1;
            try expectLimit(input, r, under);
        }
    }
}

// Explicit required Browser-generated fixture ONLY. Never scan for a fallback.
test "HWP5 source file grid approved Browser fresh table real file save reopen" {
    const supplied = std.process.Environ.getPosix(std.testing.environ, "HWPJS_TEST_SOURCE_GRID_HWP5") orelse return error.MissingRequiredFixtureEnvironment;
    const cwd = try std.Io.Dir.cwd().realPathFileAlloc(std.testing.io, ".", a);
    defer a.free(cwd);
    const root = if (std.mem.endsWith(u8, cwd, candidate_suffix)) cwd[0 .. cwd.len - candidate_suffix.len] else cwd;
    try requireApprovedFixture(root, supplied);
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, supplied, a, .limited(64 * 1024 * 1024));
    defer a.free(input);
    var before = try Source.open(a, input);
    defer before.deinit();
    const raw = try before.decodeSection(a, 0);
    defer a.free(raw);
    const rs = try records(raw);
    defer a.free(rs);
    var target: ?usize = null;
    for (rs, 0..) |r, i| if (r.tag == 77) {
        try std.testing.expect(target == null);
        target = i;
    };
    const node = target orelse return error.ApprovedFixtureMissingTable;
    const rows = std.mem.readInt(u16, rs[node].payload[4..6], .little);
    const cols = std.mem.readInt(u16, rs[node].payload[6..8], .little);
    std.debug.print("approved Browser table: section=0 node={d} rows={d} columns={d}\n", .{ node, rows, cols });
    try std.testing.expectEqual(@as(u16, 2), rows);
    try std.testing.expectEqual(@as(u16, 2), cols);
    const baseline = try a.dupe(u8, input);
    defer a.free(baseline);
    for (cases) |c| {
        const command = c.command;
        const output = try file_grid.transform(a, input, .{ .section = 0, .table_node = node, .expected_rows = rows, .expected_columns = cols, .command = command, .layout = .observed8 }, .{});
        defer a.free(output);
        var after = try Source.open(a, output);
        defer after.deinit();
        const changed = try after.decodeSection(a, 0);
        defer a.free(changed);
        const rr = try records(changed);
        defer a.free(rr);
        const expected_rows: u16 = switch (command) {
            .insert_row => rows + 1,
            .delete_row => rows - 1,
            else => rows,
        };
        const expected_cols: u16 = switch (command) {
            .insert_column => cols + 1,
            .delete_column => cols - 1,
            else => cols,
        };
        try std.testing.expectEqual(expected_rows, std.mem.readInt(u16, rr[node].payload[4..6], .little));
        try std.testing.expectEqual(expected_cols, std.mem.readInt(u16, rr[node].payload[6..8], .little));
        try realRecords(rs, rr, node, c);
        try preserved(&before, &after);
        try std.testing.expectEqualSlices(u8, baseline, input);
    }
}

// Fixture-specific independent field oracle: no coordinate-plan API.
fn realRecords(before: []const wire.Record, after: []const wire.Record, node: usize, c: Case) !void {
    try std.testing.expectEqual(before.len - 16 + c.rows * c.columns * 4, after.len);
    for (0..node - 1) |i| try std.testing.expectEqualSlices(u8, before[i].raw, after[i].raw);
    for (before[node + 17 ..], after[node + 1 + c.rows * c.columns * 4 ..]) |b, v|
        try std.testing.expectEqualSlices(u8, b.raw, v.raw);
    var common: [48]u8 = undefined;
    try std.testing.expectEqual(@as(usize, 48), before[node - 1].payload.len);
    @memcpy(&common, before[node - 1].payload);
    put(u32, &common, 16, @intCast(c.columns * 18000));
    put(u32, &common, 20, @intCast(c.rows * 1800));
    try std.testing.expectEqualSlices(u8, &common, after[node - 1].payload);
    try std.testing.expectEqualSlices(u8, before[node].payload[0..4], after[node].payload[0..4]);
    try std.testing.expectEqualSlices(u8, before[node].payload[8..18], after[node].payload[8..18]);
    for (0..c.rows) |r| try std.testing.expectEqual(@as(u16, @intCast(c.columns)), std.mem.readInt(u16, after[node].payload[18 + r * 2 ..][0..2], .little));
    try std.testing.expectEqualSlices(u8, before[node].payload[22..], after[node].payload[18 + c.rows * 2 ..]);
    var ids: std.AutoHashMap(u32, void) = .init(a);
    defer ids.deinit();
    for (before) |r| if (r.tag == 66) {
        try ids.put(std.mem.readInt(u32, r.payload[18..22], .little), {});
    };
    for (c.matrix, c.templates, 0..) |old, template, i| {
        const b = node + 1 + @as(usize, if (old >= 0) @intCast(old) else template) * 4;
        const v = node + 1 + i * 4;
        var list: [34]u8 = undefined;
        @memcpy(&list, before[b].payload);
        put(u16, &list, 8, @intCast(i % c.columns));
        put(u16, &list, 10, @intCast(i / c.columns));
        // Unchanged 18000 x 1800 dimensions are included in this exact comparison.
        try std.testing.expectEqualSlices(u8, &list, after[v].payload);
        if (old >= 0) {
            for (1..4) |j| try std.testing.expectEqualSlices(u8, before[b + j].raw, after[v + j].raw);
        } else {
            var expected: [22]u8 = undefined;
            @memcpy(&expected, before[b + 1].payload);
            put(u32, &expected, 0, 0x80000001);
            put(u16, &expected, 12, 1);
            var next: u32 = 1;
            while (ids.contains(next)) : (next += 1) {}
            put(u32, &expected, 18, next);
            try ids.put(next, {});
            try std.testing.expectEqualSlices(u8, &expected, after[v + 1].payload);
            try std.testing.expectEqualSlices(u8, &.{ 13, 0 }, after[v + 2].payload);
            try std.testing.expectEqualSlices(u8, before[b + 3].payload[0..8], after[v + 3].payload);
        }
    }
}

test "HWP5 source file grid refuses copy repaired CFB without changing original" {
    const raw = try fixture(.observed8, .none);
    defer a.free(raw);
    const input = try wrap(raw, false, 0);
    defer a.free(input);
    const h = try @import("../../cfb/header.zig").Header.parse(input);
    const root = (@as(usize, h.directory_start) + 1) * h.sector_size;
    // Independent synthetic CFB violation: root storage creation time must be 0.
    put(u64, input, root + 100, 123);
    const baseline = try a.dupe(u8, input);
    defer a.free(baseline);
    try std.testing.expectError(error.RepairedSourceUnsupported, file_grid.transform(a, input, req(.{ .insert_row = 1 }, .observed8), .{}));
    try std.testing.expectEqualSlices(u8, baseline, input);
}
