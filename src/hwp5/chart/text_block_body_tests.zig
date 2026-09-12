const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const bodies = @import("text_block_body.zig");
const Kind = enum { absent, fresh, alias, empty };
const Fixture = struct {
    bytes: [512]u8 = @splat(0xa5),
    end: usize = 1,
    seen: [6]bool = @splat(false),
    names: [5]usize = undefined,
    versions: [5]usize = undefined,
    count: usize = 0,
    text: usize = 0,
    fn int(f: *Fixture, comptime T: type, value: T) void {
        std.mem.writeInt(T, f.bytes[f.end..][0..@sizeOf(T)], value, .little);
        f.end += @sizeOf(T);
    }
    fn typ(f: *Fixture, slot: usize, name: []const u8, version: u16) void {
        f.int(u32, @intCast(slot * 19 + 101));
        if (f.seen[slot]) return;
        f.seen[slot] = true;
        f.int(u16, @intCast(name.len));
        f.names[f.count] = f.end;
        @memcpy(f.bytes[f.end..][0..name.len], name);
        f.end += name.len;
        f.versions[f.count] = f.end;
        f.int(u16, version);
        f.count += 1;
    }
    fn string(f: *Fixture, id: u32, length: u16) void {
        f.int(u32, id);
        f.typ(3, "VtString\x00", 1);
        f.int(u16, length);
        f.end += length;
        f.int(u8, 173);
        f.typ(4, "VtValue\x00", 1);
        f.typ(5, "VtObject\x00", 1);
    }
};
fn fixture(kind: Kind) Fixture {
    var f: Fixture = .{};
    f.typ(1, "VtTextBlock\x00", 2);
    f.end += 12;
    f.int(u32, 0xffffffff);
    f.int(u32, 10);
    f.typ(2, "VtFont\x00", 1);
    f.string(11, 2);
    f.end += 14;
    f.typ(5, "VtObject\x00", 1);
    f.end += 24;
    f.text = f.end;
    switch (kind) {
        .absent => f.int(u32, 0xffffffff),
        .alias => f.int(u32, 11),
        .fresh => f.string(12, 3),
        .empty => f.string(12, 0),
    }
    f.end += 26;
    f.typ(5, "VtObject\x00", 1);
    return f;
}
fn exercise(a: std.mem.Allocator, kind: Kind) !void {
    var f = fixture(kind);
    var types = Types.init(a, .{});
    defer types.deinit();
    const extra: usize = if (kind == .fresh or kind == .empty) 1 else 0;
    const stored: usize = if (kind == .fresh) 5 else 2;
    const total: usize = if (kind == .alias) 4 else stored;
    var objects = Objects.init(a, .{ .max_objects = 3 + extra, .max_total_string_bytes = stored });
    defer objects.deinit();
    try objects.registerOther(0);
    var reader: Reader = .{ .bytes = f.bytes[0 .. f.end + 1], .offset = 1 };
    const value = bodies.readObservedV2(&reader, &types, &objects, .{ .max_string_bytes = if (kind == .fresh) 3 else 2, .max_total_string_bytes = total }) catch |err| {
        try t.expectEqual(@as(usize, 1), reader.offset);
        return err;
    };
    try t.expectEqual(f.end, reader.offset);
    try t.expectEqual(f.end, value.end);
    try t.expectEqual(@as(usize, 3) + extra, objects.entries.count());
    try t.expectEqual(stored, objects.string_bytes);
    try t.expectEqual(kind == .absent, value.text == null);
    try t.expectEqual(kind == .fresh or kind == .empty, value.text_introduced);
    try t.expect(value.backdrop == null);
    if (value.text) |text| {
        try t.expectEqual(@as(u32, if (kind == .alias) 11 else 12), text.object_id);
        try t.expectEqual(@as(usize, if (kind == .alias) 2 else if (kind == .fresh) 3 else 0), text.bytes.len);
        try t.expectEqual(@as(u8, 173), text.trailer);
    }
    @memset(&f.bytes, 0);
    try t.expectEqualSlices(u8, &.{ 0, 0 }, value.font.name.bytes);
    if (value.text) |text| for (text.bytes) |byte| try t.expectEqual(@as(u8, 0), byte);
    for (value.prefix ++ value.middle ++ value.suffix ++ value.font.raw) |byte| try t.expectEqual(@as(u8, 0xa5), byte);
}
fn reject(a: std.mem.Allocator, bytes: []const u8, expected: anyerror, total: usize) !void {
    var types = Types.init(a, .{});
    defer types.deinit();
    var objects = Objects.init(a, .{});
    defer objects.deinit();
    var reader: Reader = .{ .bytes = bytes, .offset = 1 };
    _ = bodies.readObservedV2(&reader, &types, &objects, .{ .max_total_string_bytes = total }) catch |err| {
        try t.expectEqual(@as(usize, 1), reader.offset);
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(expected, err);
        return;
    };
    return error.ExpectedTextBodyRejection;
}
test "chart text body null empty aliases limits ownership OOM and allocator balance" {
    for (std.enums.values(Kind)) |kind| {
        try exercise(t.allocator, kind);
        try t.checkAllAllocationFailures(t.allocator, exercise, .{kind});
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("text body leak");
        try exercise(gpa.allocator(), kind);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    }
}
test "chart text body all cuts classes versions wrong references late errors and OOM" {
    for (std.enums.values(Kind)) |kind| {
        const f = fixture(kind);
        for (1..f.end) |cut| try reject(t.allocator, f.bytes[0..cut], error.UnexpectedEnd, 100);
        try reject(t.allocator, f.bytes[0..f.end], error.LimitExceeded, if (kind == .alias) 3 else if (kind == .fresh) 4 else 1);
        for (f.names[0..f.count], f.versions[0..f.count]) |name, version| {
            var bad = f;
            bad.bytes[name] ^= 1;
            try reject(t.allocator, bad.bytes[0..bad.end], error.UnsupportedChartClass, 100);
            bad = f;
            bad.bytes[version] ^= 1;
            try reject(t.allocator, bad.bytes[0..bad.end], error.UnsupportedChartTypeVersion, 100);
        }
        var bad = f;
        std.mem.writeInt(u32, bad.bytes[bad.text..][0..4], 10, .little);
        try reject(t.allocator, bad.bytes[0..bad.end], error.UnsupportedChartObjectReference, 100);
        bad = f;
        std.mem.writeInt(u32, bad.bytes[bad.end - 4 ..][0..4], 139, .little);
        try t.checkAllAllocationFailures(t.allocator, reject, .{ bad.bytes[0..bad.end], error.UnsupportedChartClass, @as(usize, 100) });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("text body error leak");
        try reject(gpa.allocator(), bad.bytes[0..bad.end], error.UnsupportedChartClass, 100);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    }
}
