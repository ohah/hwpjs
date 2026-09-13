const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const points = @import("series_point.zig");
const labels = @import("series_label.zig");
const fixture = @import("series_point_test_fixture.zig");
fn exercise(a: std.mem.Allocator, start: usize, known: bool, kind: fixture.Kind, only_label: bool) !void {
    var f = fixture.make(start, known, kind);
    var types = Types.init(a, .{});
    defer types.deinit();
    if (known) try fixture.seed(&types);
    const extra: u32 = if (kind == .fresh or kind == .empty) 1 else 0;
    const stored: usize = if (kind == .fresh) 5 else 2;
    const total: usize = if (kind == .alias) 4 else stored;
    var objects = Objects.init(a, .{ .max_objects = 4 + extra, .max_total_string_bytes = stored });
    defer objects.deinit();
    if (only_label) try objects.registerOther(0);
    const offset = if (only_label) f.label else start;
    var r: Reader = .{ .bytes = f.bytes[0..if (only_label) f.raw else f.end], .offset = offset };
    const options: labels.Options = .{ .max_string_bytes = if (kind == .fresh) 3 else 2, .max_total_string_bytes = total };
    const label = if (only_label) labels.readObservedV1(&r, &types, &objects, options) catch |err| {
        try t.expectEqual(offset, r.offset);
        return err;
    } else blk: {
        const p = points.readObservedV1(&r, &types, &objects, options) catch |err| {
            try t.expectEqual(offset, r.offset);
            return err;
        };
        try t.expectEqual(@as(u32, 0), p.object_id);
        try t.expectEqual(f.end, p.end);
        try t.expectEqualSlices(u8, f.bytes[f.raw..][0..20], &p.raw);
        break :blk p.label;
    };
    try t.expectEqual(r.bytes.len, r.offset);
    try t.expectEqual(f.raw, label.end);
    try t.expectEqual(f.raw, label.body.end);
    try t.expectEqual(@as(u32, 7), label.object_id);
    try t.expectEqual(4 + extra, objects.entries.count());
    try t.expectEqual(stored, objects.string_bytes);
    try t.expectEqual(kind == .absent, label.body.text == null);
    try t.expectEqual(kind == .fresh or kind == .empty, label.body.text_introduced);
    if (label.body.text) |s| try t.expectEqual(@as(usize, if (kind == .alias) 2 else if (kind == .fresh) 3 else 0), s.bytes.len);
    @memset(&f.bytes, 0);
    try t.expectEqual(@as(u8, 0x81), label.body.prefix[0]);
    try t.expectEqual(@as(u8, 0), label.body.font.name.bytes[0]);
}
const Bad = enum { cut, null_id, duplicate, class, version, cap, string_cap, base };
fn reject(a: std.mem.Allocator, known: bool, kind: fixture.Kind, bad: Bad, at: usize, only_label: bool) !void {
    var f = fixture.make(17, known, kind);
    var types = Types.init(a, .{});
    defer types.deinit();
    if (known) try fixture.seed(&types);
    var objects = Objects.init(a, .{ .max_objects = if (bad == .cap) 2 else 10 });
    defer objects.deinit();
    if (bad == .duplicate) try objects.registerOther(@intCast(at));
    if (bad == .null_id) std.mem.writeInt(u32, f.bytes[at..][0..4], 0xffffffff, .little);
    if (bad == .class or bad == .version) {
        if (known) {
            if (bad == .version) types.definitions.getPtr(@intCast(51 + at * 19)).?.version = 99 else std.mem.writeInt(u32, f.bytes[f.refs[at]..][0..4], if (at == 0) 70 else 51, .little);
        } else f.bytes[if (bad == .class) f.name_offsets[at] else f.versions[at]] ^= 1;
    }
    if (bad == .base) std.mem.writeInt(u32, f.bytes[f.base..][0..4], 51, .little);
    const offset = if (only_label) f.label else 17;
    var r: Reader = .{ .bytes = f.bytes[0..if (bad == .cut) at else if (only_label) f.raw else f.end], .offset = offset };
    const options: labels.Options = .{ .max_total_string_bytes = if (bad == .string_cap) 1 else 100 };
    const result = if (only_label) blk: {
        _ = labels.readObservedV1(&r, &types, &objects, options) catch |err| break :blk err;
        break :blk error.ExpectedSeriesRejection;
    } else blk: {
        _ = points.readObservedV1(&r, &types, &objects, options) catch |err| break :blk err;
        break :blk error.ExpectedSeriesRejection;
    };
    try t.expectEqual(offset, r.offset);
    if (result == error.OutOfMemory) return result;
    const expected: anyerror = switch (bad) {
        .cut => error.UnexpectedEnd,
        .null_id => error.UnsupportedChartObjectReference,
        .duplicate => if (at == 11) error.UnsupportedChartObjectReference else error.DuplicateChartObjectId,
        .class, .base => error.UnsupportedChartClass,
        .version => error.UnsupportedChartTypeVersion,
        .cap, .string_cap => error.LimitExceeded,
    };
    try t.expectEqual(expected, result);
}
test "chart series label point shared body offsets ownership budgets OOM" {
    for ([_]bool{ false, true }) |known| for (std.enums.values(fixture.Kind)) |kind| for ([_]bool{ false, true }) |only_label| {
        for ([_]usize{ 0, 1, 17, 257 }) |start| try exercise(t.allocator, start, known, kind, only_label);
        try t.checkAllAllocationFailures(t.allocator, exercise, .{ @as(usize, 1), known, kind, only_label });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("series label point leak");
        try exercise(gpa.allocator(), 1, known, kind, only_label);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    };
}
test "chart series label point all cuts types IDs limits late errors and OOM" {
    for ([_]bool{ false, true }) |known| for (std.enums.values(fixture.Kind)) |kind| for ([_]bool{ false, true }) |only_label| {
        const f = fixture.make(17, known, kind);
        const start = if (only_label) f.label else 17;
        const end = if (only_label) f.raw else f.end;
        for (start..end) |cut| try reject(t.allocator, known, kind, .cut, cut, only_label);
        for ([_]usize{ start, f.label, f.font }) |at| try reject(t.allocator, known, kind, .null_id, at, only_label);
        for ([_]usize{ 7, 10, 11 }) |id| try reject(t.allocator, known, kind, .duplicate, id, only_label);
        for (if (only_label) @as(usize, 1) else 0..7) |slot| for ([_]Bad{ .class, .version }) |bad| try reject(t.allocator, known, kind, bad, slot, only_label);
        for ([_]Bad{ .cap, .string_cap }) |bad| try reject(t.allocator, known, kind, bad, 0, only_label);
        if (!only_label) try reject(t.allocator, known, kind, .base, 0, false);
        try t.checkAllAllocationFailures(t.allocator, reject, .{ known, kind, Bad.cut, end - 1, only_label });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("series label point late leak");
        try reject(gpa.allocator(), known, kind, .cut, end - 1, only_label);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    };
}

test "chart series label point final base new declaration checks its own version" {
    for ([_]u16{ 1, 99 }) |version| {
        var f = fixture.make(17, false, .alias);
        const name = "VtObject\x00";
        std.mem.writeInt(u32, f.bytes[f.base..][0..4], 999, .little);
        std.mem.writeInt(u16, f.bytes[f.base + 4 ..][0..2], name.len, .little);
        @memcpy(f.bytes[f.base + 6 ..][0..name.len], name);
        std.mem.writeInt(u16, f.bytes[f.base + 6 + name.len ..][0..2], version, .little);
        f.end = f.base + 8 + name.len;
        var types = Types.init(t.allocator, .{});
        defer types.deinit();
        var objects = Objects.init(t.allocator, .{});
        defer objects.deinit();
        var r: Reader = .{ .bytes = f.bytes[0..f.end], .offset = 17 };
        if (version == 1) {
            const p = try points.readObservedV1(&r, &types, &objects, .{});
            try t.expectEqual(f.end, p.end);
            try t.expectEqual(f.end, r.offset);
            try t.expectEqual(@as(u32, 8), types.definitions.count());
        } else {
            try t.expectError(error.UnsupportedChartTypeVersion, points.readObservedV1(&r, &types, &objects, .{}));
            try t.expectEqual(@as(usize, 17), r.offset);
        }
    }
}
