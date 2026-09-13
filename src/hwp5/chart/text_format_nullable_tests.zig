const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const formats = @import("text_format.zig");
const fixture = @import("text_format_nullable_test_fixture.zig");
const alias = [_]u8{ 255, 128 };
fn exercise(a: std.mem.Allocator, start: usize, known: bool, kind: fixture.Kind, required: bool) !void {
    var f = fixture.make(start, known, kind);
    var types = Types.init(a, .{});
    defer types.deinit();
    if (known) try fixture.seed(&types);
    const stored: usize = if (kind == .alias or kind == .fresh) 2 else 0;
    var objects = Objects.init(a, .{ .max_objects = if (kind == .absent) 1 else 2, .max_total_string_bytes = stored });
    defer objects.deinit();
    if (kind == .alias) try objects.registerString(.{ .object_id = 7, .bytes = &alias, .trailer = 173 });
    var r: Reader = .{ .bytes = f.bytes[0..f.end], .offset = start };
    const v: formats.NullableFormat = if (required) blk: {
        const v = formats.readObservedV1(&r, &types, &objects, stored) catch |err| {
            try t.expectEqual(start, r.offset);
            if (err == error.OutOfMemory) return err;
            if (kind != .absent) return err;
            try t.expectEqual(error.UnsupportedChartObjectReference, err);
            return;
        };
        try t.expect(kind != .absent);
        break :blk .{ .object_id = v.object_id, .raw_word = v.raw_word, .code = v.code, .code_introduced = v.code_introduced, .code_start = v.code_start, .code_end = v.code_end, .end = v.end };
    } else formats.readNullableObservedV1(&r, &types, &objects, stored) catch |err| {
        try t.expectEqual(start, r.offset);
        return err;
    };
    try t.expectEqual(f.end, r.offset);
    try t.expectEqual(f.end, v.end);
    try t.expectEqual(@as(u32, 0), v.object_id);
    try t.expectEqual(@as(u16, 0xaa55), v.raw_word);
    try t.expectEqual(kind == .absent, v.code == null);
    try t.expectEqual(kind == .fresh or kind == .empty, v.code_introduced);
    try t.expectEqual(f.code, v.code_start);
    try t.expectEqual(@as(usize, if (kind == .absent or kind == .alias) 4 else f.end - f.code), v.code_end - v.code_start);
    try t.expectEqual(stored, objects.string_bytes);
    try t.expectEqual(@as(u32, if (kind == .absent) 1 else 2), objects.entries.count());
    if (v.code) |s| {
        try t.expectEqual(@as(u32, 7), s.object_id);
        try t.expectEqual(@as(u8, 173), s.trailer);
        try t.expectEqual(stored, s.bytes.len);
        if (kind == .alias) try t.expect(s.bytes.ptr == &alias);
        @memset(&f.bytes, 0);
        if (kind == .fresh) try t.expectEqualSlices(u8, &.{ 0, 0 }, s.bytes);
    }
}
const Bad = enum { cut, null_id, duplicate, own, class, version, cap, stored, per };
fn reject(a: std.mem.Allocator, known: bool, kind: fixture.Kind, bad: Bad, at: usize) !void {
    var f = fixture.make(17, known, kind);
    var types = Types.init(a, .{});
    defer types.deinit();
    if (known) try fixture.seed(&types);
    var objects = Objects.init(a, .{ .max_objects = if (bad == .cap) 0 else 4, .max_total_string_bytes = if (bad == .stored) 1 else 2 });
    defer objects.deinit();
    if (kind == .alias) try objects.registerString(.{ .object_id = 7, .bytes = &alias, .trailer = 173 });
    if (bad == .duplicate) try objects.registerOther(0);
    if (bad == .null_id) std.mem.writeInt(u32, f.bytes[17..][0..4], 0xffffffff, .little);
    if (bad == .own) std.mem.writeInt(u32, f.bytes[f.code..][0..4], 0, .little);
    if (bad == .class or bad == .version) {
        if (known) {
            if (bad == .version) types.definitions.getPtr(@intCast(51 + at * 19)).?.version = 99 else std.mem.writeInt(u32, f.bytes[f.refs[at]..][0..4], if (at == 0) 70 else 51, .little);
        } else f.bytes[if (bad == .class) f.name_offsets[at] else f.versions[at]] ^= 1;
    }
    var r: Reader = .{ .bytes = f.bytes[0..if (bad == .cut) at else f.end], .offset = 17 };
    _ = formats.readNullableObservedV1(&r, &types, &objects, if (bad == .per) 1 else 2) catch |err| {
        try t.expectEqual(@as(usize, 17), r.offset);
        if (err == error.OutOfMemory) return err;
        const expected: anyerror = switch (bad) {
            .cut => error.UnexpectedEnd,
            .null_id, .own => error.UnsupportedChartObjectReference,
            .duplicate => error.DuplicateChartObjectId,
            .class => error.UnsupportedChartClass,
            .version => error.UnsupportedChartTypeVersion,
            .cap, .stored, .per => error.LimitExceeded,
        };
        try t.expectEqual(expected, err);
        return;
    };
    return error.ExpectedNullableFormatRejection;
}
test "chart nullable format offsets null empty aliases required compatibility OOM" {
    for ([_]bool{ false, true }) |known| for (std.enums.values(fixture.Kind)) |kind| for ([_]bool{ false, true }) |required| {
        for ([_]usize{ 0, 1, 17, 257 }) |start| try exercise(t.allocator, start, known, kind, required);
        try t.checkAllAllocationFailures(t.allocator, exercise, .{ @as(usize, 1), known, kind, required });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("nullable format leak");
        try exercise(gpa.allocator(), 1, known, kind, required);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    };
}
test "chart nullable format all cuts types IDs budgets and late cleanup" {
    for ([_]bool{ false, true }) |known| for (std.enums.values(fixture.Kind)) |kind| {
        const f = fixture.make(17, known, kind);
        for (17..f.end) |cut| try reject(t.allocator, known, kind, .cut, cut);
        for ([_]Bad{ .null_id, .duplicate, .own }) |bad| try reject(t.allocator, known, kind, bad, 0);
        for (0..if (kind == .absent or kind == .alias) @as(usize, 2) else 4) |slot| for ([_]Bad{ .class, .version }) |bad| try reject(t.allocator, known, kind, bad, slot);
        if (kind != .alias) try reject(t.allocator, known, kind, .cap, 0);
        if (kind == .fresh) try reject(t.allocator, known, kind, .stored, 0);
        if (kind == .fresh or kind == .alias) try reject(t.allocator, known, kind, .per, 0);
        try t.checkAllAllocationFailures(t.allocator, reject, .{ known, kind, Bad.cut, f.end - 1 });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("nullable format late leak");
        try reject(gpa.allocator(), known, kind, .cut, f.end - 1);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    };
}
