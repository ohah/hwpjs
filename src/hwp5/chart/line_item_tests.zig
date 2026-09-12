const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const items = @import("line_item.zig");
const Fixture = struct {
    bytes: [512]u8 = @splat(0xa5),
    end: usize,
    raw: usize = 0,
    base: usize = 0,
    fn int(f: *Fixture, comptime T: type, n: T) void {
        std.mem.writeInt(T, f.bytes[f.end..][0..@sizeOf(T)], n, .little);
        f.end += @sizeOf(T);
    }
    fn typ(f: *Fixture, id: u32, name: []const u8, known: bool) void {
        f.int(u32, id);
        if (!known) {
            f.int(u16, @intCast(name.len));
            @memcpy(f.bytes[f.end..][0..name.len], name);
            f.end += name.len;
            f.int(u16, 1);
        }
    }
};
fn make(start: usize, known: bool, id: u32) Fixture {
    var f: Fixture = .{ .end = start };
    f.int(u32, id);
    f.typ(51, "VtCLineItem\x00", known);
    f.raw = f.end;
    for (0..52) |i| f.int(u8, @truncate(i * 19 + 129));
    f.base = f.end;
    f.typ(70, "VtObject\x00", known);
    return f;
}
fn seed(types: *Types) !void {
    const f = make(0, false, 0);
    var r: Reader = .{ .bytes = f.bytes[0..f.end], .offset = 4 };
    _ = try types.readObserved16(&r);
    r.offset = f.base;
    _ = try types.readObserved16(&r);
}
fn exercise(a: std.mem.Allocator, start: usize, known: bool) !void {
    var f = make(start, known, 0);
    var types = Types.init(a, .{});
    defer types.deinit();
    if (known) try seed(&types);
    var objects = Objects.init(a, .{ .max_objects = 2, .max_string_bytes = 0, .max_total_string_bytes = 0 });
    defer objects.deinit();
    var r: Reader = .{ .bytes = f.bytes[0 .. f.end + 1], .offset = start };
    const item = items.readObservedV1(&r, &types, &objects) catch |err| {
        try t.expectEqual(start, r.offset);
        return err;
    };
    try t.expectEqual(f.end, r.offset);
    try t.expectEqual(r.offset, item.end);
    try t.expectEqual(@as(u32, 0), item.object_id);
    try t.expectEqualSlices(u8, f.bytes[f.raw..][0..52], &item.raw);
    @memset(&f.bytes, 0);
    try t.expectEqual(@as(u8, 129), item.raw[0]);
    const second = make(1, true, 9);
    r = .{ .bytes = second.bytes[0..second.end], .offset = 1 };
    const next = items.readObservedV1(&r, &types, &objects) catch |err| {
        try t.expectEqual(@as(usize, 1), r.offset);
        return err;
    };
    try t.expectEqual(second.end, next.end);
    try t.expectEqual(@as(u32, 9), next.object_id);
    try t.expectEqual(@as(u32, 2), objects.entries.count());
    try t.expectEqual(@as(u32, 2), types.definitions.count());
    try t.expectEqual(@as(usize, 0), objects.string_bytes);
}
const Bad = enum { cut, duplicate, null_id, cap, class, version, base_class, base_version };
fn reject(a: std.mem.Allocator, known: bool, bad: Bad, cut: usize) !void {
    var f = make(17, known, 7);
    var types = Types.init(a, .{});
    defer types.deinit();
    if (known) try seed(&types);
    var objects = Objects.init(a, .{ .max_objects = if (bad == .cap) 0 else 10 });
    defer objects.deinit();
    if (bad == .duplicate) try objects.registerOther(7);
    if (bad == .null_id) std.mem.writeInt(u32, f.bytes[17..][0..4], 0xffffffff, .little);
    if (bad == .class or bad == .base_class) {
        if (known) std.mem.writeInt(u32, f.bytes[if (bad == .class) 21 else f.base..][0..4], if (bad == .class) 70 else 51, .little) else f.bytes[if (bad == .class) 27 else f.base + 6] ^= 1;
    }
    if (bad == .version or bad == .base_version) {
        if (known) types.definitions.getPtr(if (bad == .version) 51 else 70).?.version = 99 else f.bytes[if (bad == .version) f.raw - 2 else f.end - 2] ^= 1;
    }
    var r: Reader = .{ .bytes = f.bytes[0..if (bad == .cut) cut else f.end], .offset = 17 };
    _ = items.readObservedV1(&r, &types, &objects) catch |err| {
        try t.expectEqual(@as(usize, 17), r.offset);
        if (err == error.OutOfMemory) return err;
        const expected: anyerror = switch (bad) {
            .cut => error.UnexpectedEnd,
            .duplicate => error.DuplicateChartObjectId,
            .null_id => error.UnsupportedChartObjectReference,
            .cap => error.LimitExceeded,
            .class, .base_class => error.UnsupportedChartClass,
            .version, .base_version => error.UnsupportedChartTypeVersion,
        };
        try t.expectEqual(expected, err);
        return;
    };
    return error.ExpectedLineItemRejection;
}
test "chart line item raw copy identities offsets exact budgets and OOM" {
    for ([_]bool{ false, true }) |known| {
        for ([_]usize{ 0, 1, 17, 257 }) |start| try exercise(t.allocator, start, known);
        try t.checkAllAllocationFailures(t.allocator, exercise, .{ @as(usize, 1), known });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("line item leak");
        try exercise(gpa.allocator(), 1, known);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    }
}
test "chart line item all cuts types limits duplicates and late cleanup" {
    for ([_]bool{ false, true }) |known| {
        const f = make(17, known, 7);
        for (17..f.end) |cut| try reject(t.allocator, known, .cut, cut);
        for (std.enums.values(Bad)) |bad| try reject(t.allocator, known, bad, f.end - 1);
        try t.checkAllAllocationFailures(t.allocator, reject, .{ known, Bad.cut, f.end - 1 });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("line item late leak");
        try reject(gpa.allocator(), known, .cut, f.end - 1);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    }
}
