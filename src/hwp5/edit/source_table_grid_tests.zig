//! Independent synthetic oracle: official HWP5 record framing and fixed fields.
//! No fixture, reference implementation or shared coordinate-plan expectations.
const std = @import("std");
const grid = @import("source_table_grid.zig");
const wire = @import("../record.zig");
const writer = @import("../record_writer.zig");
const Layout = @import("../body/list_header.zig").Layout;
const Command = @import("../../model/table_grid_edit_plan.zig").Command;
const a = std.testing.allocator;
const version = @import("../version.zig").Version{ .raw = 0x05000302 };
const budget = 16384;
const fresh = [_]u32{ 901, 902 };
const Mutation = enum { none, protected_cell, protected_last_cell, other_attributes, merged, extra_cell, extra_table, zones, caption, nested, cache, unknown_child, tracking };
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
        // Independent wire input; production protection semantics belong to CellAttributes.
        if (mutation == .protected_cell and i == 0) put(u32, &cell, attr, 0x20 | (1 << 17));
        if (mutation == .protected_last_cell and i == 3) put(u32, &cell, attr, 0x23 | (1 << 17));
        if (mutation == .other_attributes) put(u32, &cell, attr, @as(u32, @intCast(0x20 + i)) | 0x800d0000);
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
fn request(command: Command, layout: Layout) grid.Request {
    return .{ .table_node = 5, .expected_rows = 2, .expected_columns = 2, .command = command, .layout = layout, .new_paragraph_ids = switch (command) {
        .insert_row, .insert_column => &fresh,
        else => &.{},
    } };
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
const Case = struct { command: Command, rows: usize, columns: usize, matrix: []const i8, templates: []const u8 };
const cases = [_]Case{
    .{ .command = .{ .insert_row = 0 }, .rows = 3, .columns = 2, .matrix = &.{ -1, -1, 0, 1, 2, 3 }, .templates = &.{ 0, 1, 0, 1, 2, 3 } },
    .{ .command = .{ .insert_row = 1 }, .rows = 3, .columns = 2, .matrix = &.{ 0, 1, -1, -1, 2, 3 }, .templates = &.{ 0, 1, 0, 1, 2, 3 } },
    .{ .command = .{ .insert_row = 2 }, .rows = 3, .columns = 2, .matrix = &.{ 0, 1, 2, 3, -1, -1 }, .templates = &.{ 0, 1, 2, 3, 2, 3 } },
    .{ .command = .{ .insert_column = 0 }, .rows = 2, .columns = 3, .matrix = &.{ -1, 0, 1, -1, 2, 3 }, .templates = &.{ 0, 0, 1, 2, 2, 3 } },
    .{ .command = .{ .insert_column = 1 }, .rows = 2, .columns = 3, .matrix = &.{ 0, -1, 1, 2, -1, 3 }, .templates = &.{ 0, 0, 1, 2, 2, 3 } },
    .{ .command = .{ .insert_column = 2 }, .rows = 2, .columns = 3, .matrix = &.{ 0, 1, -1, 2, 3, -1 }, .templates = &.{ 0, 1, 1, 2, 3, 3 } },
    .{ .command = .{ .delete_row = 0 }, .rows = 1, .columns = 2, .matrix = &.{ 2, 3 }, .templates = &.{ 2, 3 } },
    .{ .command = .{ .delete_row = 1 }, .rows = 1, .columns = 2, .matrix = &.{ 0, 1 }, .templates = &.{ 0, 1 } },
    .{ .command = .{ .delete_column = 0 }, .rows = 2, .columns = 1, .matrix = &.{ 1, 3 }, .templates = &.{ 1, 3 } },
    .{ .command = .{ .delete_column = 1 }, .rows = 2, .columns = 1, .matrix = &.{ 0, 2 }, .templates = &.{ 0, 2 } },
};
test "HWP5 source table grid explicit spec6 observed8 all actions independent matrix and exact record survival" {
    for ([_]Layout{ .spec6, .observed8 }) |layout| for ([_]Mutation{ .none, .other_attributes }) |mutation| {
        const source = try fixture(layout, mutation);
        defer a.free(source);
        const baseline = try a.dupe(u8, source);
        defer a.free(baseline);
        for (cases) |c| {
            const output = try grid.prepare(a, source, version, request(c.command, layout), .{});
            defer a.free(output);
            try check(source, output, layout, c.rows, c.columns, c.matrix, c.templates);
            try std.testing.expectEqualSlices(u8, baseline, source);
        }
    };
}
test "HWP5 source table grid protected first or last cell refuses every action including deletion target zero" {
    var accepted: usize = 0;
    for ([_]Layout{ .spec6, .observed8 }) |layout| for ([_]Mutation{ .protected_cell, .protected_last_cell }) |mutation| {
        const source = try fixture(layout, mutation);
        defer a.free(source);
        const baseline = try a.dupe(u8, source);
        defer a.free(baseline);
        for (cases) |c| {
            if (grid.prepare(a, source, version, request(c.command, layout), .{})) |output| {
                defer a.free(output);
                accepted += 1;
                const after = try records(output);
                defer a.free(after);
                const attr: usize = if (layout == .spec6) 2 else 4;
                var protected_count: usize = 0;
                for (after) |record| if (record.tag == 72) {
                    const flags = std.mem.readInt(u32, record.payload[attr..][0..4], .little);
                    protected_count += @intFromBool(flags & (1 << 17) != 0);
                };
                std.debug.print("UNEXPECTED accepted layout={s} mutation={s} command={any} protected_output_cells={d}\n", .{ @tagName(layout), @tagName(mutation), c.command, protected_count });
            } else |err| {
                try std.testing.expectEqual(error.UnsupportedSourceTableGrid, err);
            }
            try std.testing.expectEqualSlices(u8, baseline, source);
        }
    };
    try std.testing.expectEqual(@as(usize, 0), accepted);
}
fn protectedAllocationAttempt(allocator: std.mem.Allocator, source: []const u8, baseline: []const u8, layout: Layout, command: Command) !void {
    defer std.testing.expectEqualSlices(u8, baseline, source) catch @panic("protected source changed on allocation failure");
    const output = grid.prepare(allocator, source, version, request(command, layout), .{}) catch |err| switch (err) {
        error.UnsupportedSourceTableGrid => return,
        else => return err,
    };
    defer allocator.free(output);
    return error.TestExpectedError;
}
test "HWP5 source table grid protected rejection every allocation failure four actions preserves source" {
    for ([_]Layout{ .spec6, .observed8 }) |layout| for ([_]Mutation{ .protected_cell, .protected_last_cell }) |mutation| {
        const source = try fixture(layout, mutation);
        defer a.free(source);
        const baseline = try a.dupe(u8, source);
        defer a.free(baseline);
        for ([_]usize{ 1, 4, 6, 8 }) |i|
            try @import("../../testing/allocation_failures.zig").check(protectedAllocationAttempt, .{ source, baseline, layout, cases[i].command });
    };
}
fn refusal(source: []const u8, r: grid.Request, expected: anyerror) !void {
    const baseline = try a.dupe(u8, source);
    defer a.free(baseline);
    try std.testing.expectError(expected, grid.prepare(a, source, version, r, .{}));
    try std.testing.expectEqualSlices(u8, baseline, source);
}
test "HWP5 source table grid invalid target counts indexes IDs refuse without source changes" {
    for ([_]Layout{ .spec6, .observed8 }) |layout| {
        const source = try fixture(layout, .none);
        defer a.free(source);
        const valid = request(.{ .insert_row = 1 }, layout);
        for ([_]usize{ 0, 4, 9999 }) |target| {
            var r = valid;
            r.table_node = target;
            try refusal(source, r, error.InvalidSourceTableGridTarget);
        }
        var r = valid;
        r.expected_rows = 3;
        try refusal(source, r, error.SourceBindingMismatch);
        r = valid;
        r.expected_columns = 0;
        try refusal(source, r, error.SourceBindingMismatch);
        for ([_]Command{ .{ .insert_row = 3 }, .{ .delete_row = 2 }, .{ .insert_column = 3 }, .{ .delete_column = 2 } }) |cmd| {
            r = request(cmd, layout);
            try refusal(source, r, error.InvalidTableGridEdit);
        }
        for ([_][]const u32{ &.{}, &.{901}, &.{ 901, 902, 903 }, &.{ 901, 901 }, &.{ 0, 902 }, &.{ 101, 902 }, &.{ 700, 902 }, &.{ 701, 902 } }) |ids| {
            r = valid;
            r.new_paragraph_ids = ids;
            try refusal(source, r, error.InvalidTableParagraphIds);
        }
        r = request(.{ .delete_column = 0 }, layout);
        r.new_paragraph_ids = &fresh;
        try refusal(source, r, error.InvalidTableParagraphIds);
    }
}
test "HWP5 source table grid merged extensions zones caption nested cache opaque children rejection" {
    for ([_]Layout{ .spec6, .observed8 }) |layout| for ([_]Mutation{ .merged, .extra_cell, .extra_table, .zones, .caption, .nested, .cache, .unknown_child, .tracking }) |mutation| {
        const source = try fixture(layout, mutation);
        defer a.free(source);
        var r = request(.{ .insert_row = 1 }, layout);
        if (mutation == .caption) r.table_node = 9;
        try refusal(source, r, error.UnsupportedSourceTableGrid);
    };
}
fn allocationAttempt(allocator: std.mem.Allocator, source: []const u8, baseline: []const u8, layout: Layout, c: Case) !void {
    defer std.testing.expectEqualSlices(u8, baseline, source) catch @panic("source changed on allocation failure");
    const output = try grid.prepare(allocator, source, version, request(c.command, layout), .{});
    defer allocator.free(output);
    try check(source, output, layout, c.rows, c.columns, c.matrix, c.templates);
}
test "HWP5 source table grid every allocation failure four actions preserves source" {
    for ([_]Layout{ .spec6, .observed8 }) |layout| {
        const source = try fixture(layout, .none);
        defer a.free(source);
        const baseline = try a.dupe(u8, source);
        defer a.free(baseline);
        // Existing project helper keeps a normal resize/remap success control,
        // then forces deterministic fallback allocation sites for OOM injection.
        for ([_]usize{ 1, 4, 6, 8 }) |i|
            try @import("../../testing/allocation_failures.zig").check(allocationAttempt, .{ source, baseline, layout, cases[i] });
    }
}
