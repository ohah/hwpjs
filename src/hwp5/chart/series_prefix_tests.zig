const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const prefixes = @import("series_prefix.zig");
const fixture = @import("series_prefix_test_fixture.zig");
fn exercise(a: std.mem.Allocator, start: usize, known: bool, first: u16, second: u16) !void {
    var f = fixture.make(start, known, first, second);
    var types = Types.init(a, .{});
    defer types.deinit();
    if (known) try fixture.seed(&types);
    var objects = Objects.init(a, .{ .max_objects = 2, .max_string_bytes = 0, .max_total_string_bytes = 0 });
    defer objects.deinit();
    var r: Reader = .{ .bytes = f.bytes[0 .. f.end + 1], .offset = start };
    const p = prefixes.readObservedV2(&r, &types, &objects) catch |err| {
        try t.expectEqual(start, r.offset);
        return err;
    };
    try t.expectEqual(f.end, r.offset);
    try t.expectEqual(f.end, p.end);
    try t.expectEqual(f.end, p.array.end);
    try t.expectEqual(@as(u32, 0), p.object_id);
    try t.expectEqual(@as(u32, 7), p.array.object_id);
    try t.expectEqual(first, p.array.first_word);
    try t.expectEqual(second, p.array.second_word);
    try t.expectEqualSlices(u8, f.bytes[f.raw..][0..66], &p.raw);
    @memset(&f.bytes, 0);
    try t.expectEqual(@as(u8, 129), p.raw[0]);
    try t.expectEqual(@as(u32, 4), types.definitions.count());
    try t.expectEqual(@as(u32, 2), objects.entries.count());
    try t.expectEqual(@as(usize, 0), objects.string_bytes);
}
const Bad = enum { cut, null_series, null_array, duplicate_series, duplicate_array, repeated_id, cap, class, version };
fn reject(a: std.mem.Allocator, known: bool, bad: Bad, at: usize) !void {
    var f = fixture.make(17, known, 5, 0);
    var types = Types.init(a, .{});
    defer types.deinit();
    if (known) try fixture.seed(&types);
    var objects = Objects.init(a, .{ .max_objects = if (bad == .cap) 1 else 3 });
    defer objects.deinit();
    if (bad == .duplicate_series or bad == .duplicate_array) try objects.registerOther(if (bad == .duplicate_series) 0 else 7);
    if (bad == .null_series or bad == .null_array) std.mem.writeInt(u32, f.bytes[if (bad == .null_series) 17 else f.array..][0..4], 0xffffffff, .little);
    if (bad == .repeated_id) std.mem.writeInt(u32, f.bytes[f.array..][0..4], 0, .little);
    if (bad == .class or bad == .version) {
        if (known) {
            if (bad == .version) types.definitions.getPtr(@intCast(51 + at * 19)).?.version = 99 else std.mem.writeInt(u32, f.bytes[f.refs[at]..][0..4], if (at == 0) 70 else 51, .little);
        } else f.bytes[if (bad == .class) f.name_offsets[at] else f.versions[at]] ^= 1;
    }
    var r: Reader = .{ .bytes = f.bytes[0..if (bad == .cut) at else f.end], .offset = 17 };
    _ = prefixes.readObservedV2(&r, &types, &objects) catch |err| {
        try t.expectEqual(@as(usize, 17), r.offset);
        if (err == error.OutOfMemory) return err;
        const expected: anyerror = switch (bad) {
            .cut => error.UnexpectedEnd,
            .null_series, .null_array => error.UnsupportedChartObjectReference,
            .duplicate_series, .duplicate_array, .repeated_id => error.DuplicateChartObjectId,
            .cap => error.LimitExceeded,
            .class => error.UnsupportedChartClass,
            .version => error.UnsupportedChartTypeVersion,
        };
        try t.expectEqual(expected, err);
        return;
    };
    return error.ExpectedSeriesPrefixRejection;
}
test "chart series prefix new known types raw words ownership budgets and OOM" {
    for ([_]bool{ false, true }) |known| for ([_][2]u16{ .{ 0, 0 }, .{ 1, 1 }, .{ 4, 4 }, .{ 5, 0 }, .{ 65535, 65535 } }) |words| {
        for ([_]usize{ 0, 1, 17, 257 }) |start| try exercise(t.allocator, start, known, words[0], words[1]);
        try t.checkAllAllocationFailures(t.allocator, exercise, .{ @as(usize, 1), known, words[0], words[1] });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("series prefix leak");
        try exercise(gpa.allocator(), 1, known, words[0], words[1]);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    };
}
test "chart series prefix all cuts types null duplicate IDs limits late cleanup" {
    for ([_]bool{ false, true }) |known| {
        const f = fixture.make(17, known, 5, 0);
        for (17..f.end) |cut| try reject(t.allocator, known, .cut, cut);
        for ([_]Bad{ .null_series, .null_array, .duplicate_series, .duplicate_array, .repeated_id, .cap }) |bad| try reject(t.allocator, known, bad, 0);
        for (0..4) |at| for ([_]Bad{ .class, .version }) |bad| try reject(t.allocator, known, bad, at);
        try t.checkAllAllocationFailures(t.allocator, reject, .{ known, Bad.cut, f.end - 1 });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("series prefix late leak");
        try reject(gpa.allocator(), known, .cut, f.end - 1);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    }
}
