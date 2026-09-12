const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const blocks = @import("post_line.zig");
const fixture = @import("post_line_test_fixture.zig");
fn exercise(a: std.mem.Allocator, start: usize, known: bool, first: u16, second: u16) !void {
    var f = fixture.make(start, known, first, second);
    var types = Types.init(a, .{});
    defer types.deinit();
    if (known) try fixture.seed(&types);
    var objects = Objects.init(a, .{ .max_objects = 1, .max_string_bytes = 0, .max_total_string_bytes = 0 });
    defer objects.deinit();
    var r: Reader = .{ .bytes = f.bytes[0 .. f.end + 1], .offset = start };
    const block = blocks.readObserved(&r, &types, &objects) catch |err| {
        try t.expectEqual(start, r.offset);
        return err;
    };
    try t.expectEqual(f.end, r.offset);
    try t.expectEqual(f.end, block.end);
    try t.expectEqual(f.end, block.array.end);
    try t.expectEqual(@as(u32, 0), block.array.object_id);
    try t.expectEqual(first, block.array.first_word);
    try t.expectEqual(second, block.array.second_word);
    try t.expectEqualSlices(u8, f.bytes[start..][0..194], &block.raw);
    @memset(&f.bytes, 0);
    try t.expectEqual(@as(u8, 129), block.raw[0]);
    try t.expectEqual(@as(u32, 3), types.definitions.count());
    try t.expectEqual(@as(u32, 1), objects.entries.count());
    try t.expectEqual(@as(usize, 0), objects.string_bytes);
}
const Bad = enum { cut, null_id, duplicate, cap, class, version };
fn reject(a: std.mem.Allocator, known: bool, bad: Bad, at: usize) !void {
    var f = fixture.make(17, known, 5, 0);
    var types = Types.init(a, .{});
    defer types.deinit();
    if (known) try fixture.seed(&types);
    var objects = Objects.init(a, .{ .max_objects = if (bad == .cap) 0 else 1 });
    defer objects.deinit();
    if (bad == .duplicate) try objects.registerOther(0);
    if (bad == .null_id) std.mem.writeInt(u32, f.bytes[f.array..][0..4], 0xffffffff, .little);
    if (bad == .class or bad == .version) {
        if (known) {
            const id = std.mem.readInt(u32, f.bytes[f.refs[at]..][0..4], .little);
            if (bad == .version) types.definitions.getPtr(id).?.version = 99 else std.mem.writeInt(u32, f.bytes[f.refs[at]..][0..4], if (id == 51) 97 else 51, .little);
        } else f.bytes[if (bad == .class) f.name_offsets[at] else f.versions[at]] ^= 1;
    }
    var r: Reader = .{ .bytes = f.bytes[0..if (bad == .cut) at else f.end], .offset = 17 };
    _ = blocks.readObserved(&r, &types, &objects) catch |err| {
        try t.expectEqual(@as(usize, 17), r.offset);
        if (err == error.OutOfMemory) return err;
        const expected: anyerror = switch (bad) {
            .cut => error.UnexpectedEnd,
            .null_id => error.UnsupportedChartObjectReference,
            .duplicate => error.DuplicateChartObjectId,
            .cap => error.LimitExceeded,
            .class => error.UnsupportedChartClass,
            .version => error.UnsupportedChartTypeVersion,
        };
        try t.expectEqual(expected, err);
        return;
    };
    return error.ExpectedPostLineRejection;
}
test "chart post line raw ownership new known types independent words budgets and OOM" {
    for ([_]bool{ false, true }) |known| for ([_][2]u16{ .{ 0, 0 }, .{ 3, 3 }, .{ 5, 0 }, .{ 65535, 65535 } }) |words| {
        for ([_]usize{ 0, 1, 17, 257 }) |start| try exercise(t.allocator, start, known, words[0], words[1]);
        try t.checkAllAllocationFailures(t.allocator, exercise, .{ @as(usize, 1), known, words[0], words[1] });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("post line leak");
        try exercise(gpa.allocator(), 1, known, words[0], words[1]);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    };
}
test "chart post line cuts all types identity limits and late error cleanup" {
    for ([_]bool{ false, true }) |known| {
        const f = fixture.make(17, known, 5, 0);
        for (17..f.end) |cut| try reject(t.allocator, known, .cut, cut);
        for ([_]Bad{ .null_id, .duplicate, .cap }) |bad| try reject(t.allocator, known, bad, 0);
        for (0..if (known) @as(usize, 4) else 3) |at| for ([_]Bad{ .class, .version }) |bad| try reject(t.allocator, known, bad, at);
        try t.checkAllAllocationFailures(t.allocator, reject, .{ known, Bad.cut, f.end - 1 });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("post line late leak");
        try reject(gpa.allocator(), known, .cut, f.end - 1);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    }
}
