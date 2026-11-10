//! Synthetic wire oracle; no files, sessions or reference implementation.
const std = @import("std");
const grid = @import("source_table_grid.zig");
const wire = @import("../record.zig");
const writer = @import("../record_writer.zig");
const Layout = @import("../body/list_header.zig").Layout;
const Command = @import("../../model/table_grid_edit_plan.zig").Command;
const a = std.testing.allocator;
const version = @import("../version.zig").Version{ .raw = 0x05000302 };
const fresh = [_]u32{ 901, 902, 903 };
const Mutation = enum { none, units, runs_count, run_order, run_boundary, control, nested, cache, tracking, missing_text, duplicate_text, list_count, protected };
fn put(comptime T: type, bytes: []u8, at: usize, value: T) void {
    std.mem.writeInt(T, bytes[at..][0..@sizeOf(T)], value, .little);
}
fn header(id: u32, units: u32, high: bool) [24]u8 {
    var h: [24]u8 = @splat(0);
    put(u32, &h, 0, units | (if (high) @as(u32, 0x80000000) else 0));
    put(u16, &h, 8, @intCast(id % 7));
    h[10] = @intCast(id % 5);
    put(u16, &h, 12, 2);
    put(u32, &h, 18, id);
    return h;
}
const Bits = enum { observed, inverse, clear, set };
fn fixture(layout: Layout, mutation: Mutation, bits: Bits) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    const host = header(700, 1, true);
    try writer.append(a, &out, 66, 0, &host, 65536);
    var common: [46]u8 = @splat(0);
    put(u32, &common, 0, 0x74626c20);
    put(u32, &common, 4, 0x6a2211);
    put(u32, &common, 16, 150);
    put(u32, &common, 20, 51);
    try writer.append(a, &out, 71, 1, &common, 65536);
    var table: [28]u8 = @splat(0);
    put(u16, &table, 4, 3);
    put(u16, &table, 6, 3);
    for (0..3) |r| put(u16, &table, 18 + r * 2, 3);
    try writer.append(a, &out, 77, 2, &table, 65536);
    for (0..9) |i| {
        const count = 2 + i % 2;
        var cell: [34]u8 = @splat(0);
        put(u16, &cell, 0, @intCast(count + @intFromBool(i == 8 and mutation == .list_count)));
        const base: usize = if (layout == .spec6) 6 else 8;
        if (layout == .observed8) put(u16, &cell, 2, 0x1234);
        put(u32, &cell, base - 4, if (i == 8 and mutation == .protected) 1 << 17 else 0x20);
        put(u16, &cell, base, @intCast(i % 3));
        put(u16, &cell, base + 2, @intCast(i / 3));
        put(u16, &cell, base + 4, 1);
        put(u16, &cell, base + 6, 1);
        put(u32, &cell, base + 8, 50);
        put(u32, &cell, base + 12, 17);
        put(u16, &cell, base + 24, @intCast(i + 1));
        try writer.append(a, &out, 72, 2, cell[0 .. base + 26], 65536);
        for (0..count) |p| {
            const bad = i == 8 and p == 1;
            var h = header(@intCast(100 + i * 10 + p), if (bad and mutation == .units) 5 else 4, switch (bits) {
                .observed => p + 1 == count,
                .inverse => p == 0,
                .clear => false,
                .set => true,
            });
            if (bad and mutation == .runs_count) put(u16, &h, 12, 1);
            if (bad and mutation == .tracking) put(u16, &h, 22, 1);
            if (bad and mutation == .cache) put(u16, &h, 16, 1);
            try writer.append(a, &out, 66, 2, &h, 65536);
            var text = [_]u8{ @intCast(65 + i + p), 0, 0x3d, 0xd8, 0, 0xde, 13, 0 };
            if (bad and mutation == .control) text[0] = 3;
            if (!(bad and mutation == .missing_text)) try writer.append(a, &out, 67, 3, &text, 65536);
            if (bad and mutation == .duplicate_text) try writer.append(a, &out, 67, 3, &text, 65536);
            var runs: [16]u8 = @splat(0);
            put(u32, &runs, 4, @intCast(20 + i * 3 + p));
            put(u32, &runs, 8, if (bad and mutation == .run_order) 0 else if (bad and mutation == .run_boundary) 2 else 1);
            put(u32, &runs, 12, @intCast(80 + i * 3 + p));
            try writer.append(a, &out, 68, 3, &runs, 65536);
            if (bad and mutation == .nested) try writer.append(a, &out, 71, 3, &common, 65536);
            if (bad and mutation == .cache) try writer.append(a, &out, 69, 3, &(@as([36]u8, @splat(0))), 65536);
        }
    }
    const tail = header(701, 1, true);
    try writer.append(a, &out, 66, 0, &tail, 65536);
    return out.toOwnedSlice(a);
}
const Records = struct {
    items: []wire.Record,
    starts: [9]usize,
};
fn records(bytes: []const u8) !Records {
    var out: std.ArrayList(wire.Record) = .empty;
    errdefer out.deinit(a);
    var starts: [9]usize = undefined;
    var n: usize = 0;
    var it = wire.Iterator.init(bytes, .{});
    while (try it.next()) |r| {
        if (r.tag == 72 and n < 9) {
            starts[n] = out.items.len;
            n += 1;
        }
        try out.append(a, r);
    }
    return .{ .items = try out.toOwnedSlice(a), .starts = starts };
}
fn request(command: Command, layout: Layout) grid.Request {
    return .{ .table_node = 2, .expected_rows = 3, .expected_columns = 3, .command = command, .layout = layout, .new_paragraph_ids = switch (command) {
        .insert_row, .insert_column => &fresh,
        else => &.{},
    } };
}
fn check(source: []const u8, output: []const u8, layout: Layout, command: Command) !void {
    const before = try records(source);
    defer a.free(before.items);
    const after = try records(output);
    defer a.free(after.items);
    const vertical = command == .insert_row or command == .delete_row;
    const inserting = command == .insert_row or command == .insert_column;
    const at: usize = switch (command) {
        inline else => |v| v,
    };
    const rows: usize = if (vertical) (if (inserting) 4 else 2) else 3;
    const columns: usize = if (!vertical) (if (inserting) 4 else 2) else 3;
    try std.testing.expectEqualSlices(u8, before.items[0].raw, after.items[0].raw);
    try std.testing.expectEqualSlices(u8, before.items[before.items.len - 1].raw, after.items[after.items.len - 1].raw);
    try std.testing.expectEqual(@as(u16, @intCast(rows)), std.mem.readInt(u16, after.items[2].payload[4..6], .little));
    try std.testing.expectEqual(@as(u16, @intCast(columns)), std.mem.readInt(u16, after.items[2].payload[6..8], .little));
    try std.testing.expectEqual(@as(u32, @intCast(columns * 50)), std.mem.readInt(u32, after.items[1].payload[16..20], .little));
    try std.testing.expectEqual(@as(u32, @intCast(rows * 17)), std.mem.readInt(u32, after.items[1].payload[20..24], .little));
    var cursor: usize = 3;
    var next: usize = 0;
    for (0..rows) |r| for (0..columns) |c| {
        const axis = if (vertical) r else c;
        const inserted = inserting and axis == at;
        const old_axis = if (inserting) (if (inserted) (if (at == 0) 0 else at - 1) else axis - @intFromBool(axis > at)) else axis + @intFromBool(axis >= at);
        const original = (if (vertical) old_axis else r) * 3 + (if (vertical) c else old_axis);
        const start = before.starts[original];
        const end = if (original == 8) before.items.len - 1 else before.starts[original + 1];
        var final_header = start + 1;
        var first_runs: ?usize = null;
        for (start + 1..end) |j| {
            if (before.items[j].tag == 66) final_header = j;
            if (before.items[j].tag == 68 and first_runs == null) first_runs = j;
        }
        var expected: [34]u8 = undefined;
        const n = before.items[start].payload.len;
        @memcpy(expected[0..n], before.items[start].payload);
        const base: usize = if (layout == .spec6) 6 else 8;
        put(u16, &expected, base, @intCast(c));
        put(u16, &expected, base + 2, @intCast(r));
        if (inserted) put(u16, &expected, 0, 1);
        try std.testing.expectEqualSlices(u8, expected[0..n], after.items[cursor].payload);
        cursor += 1;
        if (!inserted) {
            const surviving_records = end - start - 1;
            for (0..surviving_records) |j| try std.testing.expectEqualSlices(u8, before.items[start + 1 + j].raw, after.items[cursor + j].raw);
            cursor += surviving_records;
        } else {
            var h: [24]u8 = undefined;
            @memcpy(&h, before.items[start + 1].payload);
            // Opaque high bit is inherited from the final template paragraph.
            put(u32, &h, 0, std.mem.readInt(u32, before.items[final_header].payload[0..4], .little) & 0x80000000 | 1);
            put(u16, &h, 12, 1);
            put(u32, &h, 18, fresh[next]);
            next += 1;
            try std.testing.expectEqualSlices(u8, &h, after.items[cursor].payload);
            try std.testing.expectEqualSlices(u8, &.{ 13, 0 }, after.items[cursor + 1].payload);
            try std.testing.expectEqualSlices(u8, before.items[first_runs.?].payload[0..8], after.items[cursor + 2].payload);
            cursor += 3;
        }
    };
    try std.testing.expectEqual(after.items.len - 1, cursor);
    try std.testing.expectEqual(@as(usize, if (inserting) 3 else 0), next);
}
fn commandFor(action: usize, at: u32) Command {
    return switch (action) {
        0 => .{ .insert_row = at },
        1 => .{ .insert_column = at },
        2 => .{ .delete_row = at },
        else => .{ .delete_column = at },
    };
}
test "HWP5 multipara source grid all four actions first middle end exact bytes styles IDs counts" {
    for ([_]Layout{ .spec6, .observed8 }) |layout| for (std.enums.values(Bits)) |bits| {
        const source = try fixture(layout, .none, bits);
        defer a.free(source);
        const baseline = try a.dupe(u8, source);
        defer a.free(baseline);
        for (0..4) |action| for ([_]u32{ 0, 1, if (action < 2) 3 else 2 }) |at| {
            const command = commandFor(action, at);
            const output = try grid.prepare(a, source, version, request(command, layout), .{});
            defer a.free(output);
            try check(source, output, layout, command);
            try std.testing.expectEqualSlices(u8, baseline, source);
        };
    };
}
fn attempt(allocator: std.mem.Allocator, source: []const u8, baseline: []const u8, layout: Layout, command: Command, rejection: bool) !void {
    defer std.testing.expectEqualSlices(u8, baseline, source) catch @panic("source mutated");
    const output = grid.prepare(allocator, source, version, request(command, layout), .{}) catch |err| {
        if (err == error.OutOfMemory) return err;
        if (!rejection) return err;
        return;
    };
    defer allocator.free(output);
    if (rejection) return error.TestExpectedError;
    try check(source, output, layout, command);
}
test "HWP5 multipara source grid malformed second paragraph later controls protected refuses all actions" {
    for ([_]Layout{ .spec6, .observed8 }) |layout| for (std.enums.values(Mutation)) |mutation| {
        if (mutation == .none) continue;
        const source = try fixture(layout, mutation, .observed);
        defer a.free(source);
        const baseline = try a.dupe(u8, source);
        defer a.free(baseline);
        for (0..4) |action| try attempt(a, source, baseline, layout, commandFor(action, 2), true);
    };
}
test "HWP5 multipara source grid full allocation failure sweeps all actions positions and later rejection" {
    for ([_]Layout{ .spec6, .observed8 }) |layout| for (std.enums.values(Mutation)) |mutation| {
        const source = try fixture(layout, mutation, .observed);
        defer a.free(source);
        const baseline = try a.dupe(u8, source);
        defer a.free(baseline);
        for (0..4) |action| {
            if (mutation == .none) {
                for ([_]u32{ 0, 1, if (action < 2) 3 else 2 }) |at|
                    try @import("../../testing/allocation_failures.zig").check(attempt, .{ source, baseline, layout, commandFor(action, at), false });
            } else try @import("../../testing/allocation_failures.zig").check(attempt, .{ source, baseline, layout, commandFor(action, 2), true });
        }
    };
}

// A matching unsigned declaration must not turn the spec's signed unknown
// range into supported source-grid input. Groups alone accepts this fixture.
fn negativeCountFixture(layout: Layout) ![]u8 {
    const source = try fixture(layout, .none, .observed);
    defer a.free(source);
    const parsed = try records(source);
    defer a.free(parsed.items);
    const start = parsed.starts[8];
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for (parsed.items[0..start]) |r| try out.appendSlice(a, r.raw);
    var list: [34]u8 = undefined;
    const record = parsed.items[start];
    @memcpy(list[0..record.payload.len], record.payload);
    put(u16, &list, 0, 0x8000);
    try writer.append(a, &out, 72, 2, list[0..record.payload.len], 4 * 1024 * 1024);
    for (0..32768) |_| for (parsed.items[start + 1 .. start + 4]) |r| try out.appendSlice(a, r.raw);
    try out.appendSlice(a, parsed.items[parsed.items.len - 1].raw);
    return out.toOwnedSlice(a);
}
test "HWP5 multipara source grid signed negative list count rejects even matching 32768 direct paragraphs" {
    for ([_]Layout{ .spec6, .observed8 }) |layout| {
        const source = try negativeCountFixture(layout);
        defer a.free(source);
        const baseline = try a.dupe(u8, source);
        defer a.free(baseline);
        // Independently prove this is not a count-mismatch-only rejection.
        var tree = try @import("source_tree.zig").parse(a, source, version, .{});
        defer tree.deinit(a);
        var groups = try @import("../body/list_groups.zig").Groups.build(a, tree);
        defer groups.deinit(a);
        try std.testing.expectEqual(@as(usize, 32768), groups.items[8].paragraph_count);
        for (0..4) |action| {
            if (grid.prepare(a, source, version, request(commandFor(action, 2), layout), .{})) |output| {
                defer a.free(output);
                std.debug.print("unexpected acceptance of matched signed-negative count layout={s} action={d} output_bytes={d}\n", .{ @tagName(layout), action, output.len });
                return error.TestExpectedError;
            } else |err| try std.testing.expectEqual(error.UnsupportedSourceTableGrid, err);
            try std.testing.expectEqualSlices(u8, baseline, source);
            try @import("../../testing/allocation_failures.zig").check(attempt, .{ source, baseline, layout, commandFor(action, 2), true });
        }
    }
}

const EmptyWire = enum { absent, zero_payload };
const EmptyIssue = enum { none, positive_units, run_count, run_start };
// Each source cell has a first, middle (where three paragraphs), or final empty
// paragraph. The wire absence/empty-payload distinction must survive unchanged.
fn emptyFixture(layout: Layout, wire_form: EmptyWire, placement: usize, issue: EmptyIssue) ![]u8 {
    const source = try fixture(layout, .none, .observed);
    defer a.free(source);
    const parsed = try records(source);
    defer a.free(parsed.items);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    var cell: usize = 0;
    var paragraph: usize = 0;
    var selected = false;
    for (parsed.items) |record| {
        if (record.tag == 72) {
            cell += 1;
            paragraph = 0;
        }
        if (record.tag == 66 and record.level == 2) {
            const count = 2 + (cell - 1) % 2;
            selected = paragraph == (if (placement == 2) count - 1 else placement);
            paragraph += 1;
            if (selected) {
                var h: [24]u8 = undefined;
                @memcpy(&h, record.payload);
                const high = std.mem.readInt(u32, h[0..4], .little) & 0x80000000;
                put(u32, &h, 0, high | @as(u32, if (issue == .positive_units) 1 else 0));
                put(u16, &h, 12, if (issue == .run_count) 2 else 1);
                try writer.append(a, &out, 66, 2, &h, 65536);
                continue;
            }
        }
        if (selected and record.level == 3) {
            if (record.tag == 67) {
                if (wire_form == .zero_payload) try writer.append(a, &out, 67, 3, &.{}, 65536);
                continue;
            }
            if (record.tag == 68) {
                var runs: [8]u8 = undefined;
                @memcpy(&runs, record.payload[0..8]);
                if (issue == .run_start) put(u32, &runs, 0, 1);
                try writer.append(a, &out, 68, 3, &runs, 65536);
                continue;
            }
        }
        try out.appendSlice(a, record.raw);
    }
    return out.toOwnedSlice(a);
}
test "HWP5 multipara source grid zero count absent or empty TEXT first middle final raw survival template style and OOM" {
    for ([_]Layout{ .spec6, .observed8 }) |layout| for (std.enums.values(EmptyWire)) |wire_form| for (0..3) |placement| {
        const source = try emptyFixture(layout, wire_form, placement, .none);
        defer a.free(source);
        const baseline = try a.dupe(u8, source);
        defer a.free(baseline);
        for (0..4) |action| for ([_]u32{ 0, 1, if (action < 2) 3 else 2 }) |at| {
            const command = commandFor(action, at);
            try attempt(a, source, baseline, layout, command, false);
            try @import("../../testing/allocation_failures.zig").check(attempt, .{ source, baseline, layout, command, false });
        };
    };
}
test "HWP5 multipara source grid positive count missing or empty TEXT malformed empty style refuses and OOM" {
    for ([_]Layout{ .spec6, .observed8 }) |layout| for (std.enums.values(EmptyWire)) |wire_form| for ([_]EmptyIssue{ .positive_units, .run_count, .run_start }) |issue| {
        const source = try emptyFixture(layout, wire_form, 1, issue);
        defer a.free(source);
        const baseline = try a.dupe(u8, source);
        defer a.free(baseline);
        for (0..4) |action| {
            const command = commandFor(action, 2);
            try attempt(a, source, baseline, layout, command, true);
            try @import("../../testing/allocation_failures.zig").check(attempt, .{ source, baseline, layout, command, true });
        }
    };
}
