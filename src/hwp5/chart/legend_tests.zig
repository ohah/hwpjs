const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const legends = @import("legend.zig");
const Fixture = struct {
    bytes: [1024]u8 = @splat(0xa5),
    end: usize = 1,
    name_id: usize = 0,
    last_id: usize = 0,
    names: [9]usize = undefined,
    versions: [9]usize = undefined,
    count: usize = 0,
    fn int(self: *Fixture, comptime T: type, n: T) void {
        std.mem.writeInt(T, self.bytes[self.end..][0..@sizeOf(T)], n, .little);
        self.end += @sizeOf(T);
    }
    fn decl(self: *Fixture, id: u32, name: []const u8) void {
        self.int(u32, id);
        self.int(u16, @intCast(name.len));
        self.names[self.count] = self.end;
        @memcpy(self.bytes[self.end..][0..name.len], name);
        self.end += name.len;
        self.versions[self.count] = self.end;
        self.int(u16, 1);
        self.count += 1;
    }
};
fn fixture(introduced: bool) Fixture {
    var f: Fixture = .{};
    f.int(u32, 20);
    f.decl(900, "VtChartLegend\x00");
    f.int(u32, 21);
    f.decl(10, "VtFont\x00");
    f.name_id = f.end;
    f.int(u32, if (introduced) 8 else 7);
    if (introduced) {
        f.decl(11, "VtString\x00");
        f.int(u16, 2);
        f.end += 2;
        f.int(u8, 173);
        f.decl(12, "VtValue\x00");
        f.decl(13, "VtObject\x00");
    }
    f.end += 14;
    if (introduced) f.int(u32, 13) else f.decl(13, "VtObject\x00");
    f.end += 10;
    f.decl(14, "VtChartSection\x00");
    f.end += 26;
    f.int(u32, 22);
    f.decl(15, "VtBackdrop\x00");
    f.end += 50;
    f.int(u32, 23);
    f.decl(16, "VtFill\x00");
    f.end += 34;
    f.last_id = f.end;
    f.int(u32, 24);
    f.decl(17, "VtPicture\x00");
    f.end += 4;
    f.int(u32, 0xffffffff);
    f.int(u32, 13);
    f.int(u16, 0xaa55);
    f.int(u32, 13);
    f.int(u32, 13);
    f.int(u32, 13);
    return f;
}
fn exercise(a: std.mem.Allocator, introduced: bool) !void {
    var f = fixture(introduced);
    var seed = [_]u8{ 0x11, 0x22 };
    var types = Types.init(a, .{});
    defer types.deinit();
    var objects = Objects.init(a, .{ .max_objects = if (introduced) 7 else 6, .max_total_string_bytes = if (introduced) 4 else 2 });
    defer objects.deinit();
    try objects.registerString(.{ .object_id = 7, .bytes = &seed, .trailer = 99 });
    var reader: Reader = .{ .bytes = f.bytes[0 .. f.end + 1], .offset = 1 };
    const value = legends.readObservedV1(&reader, &types, &objects, 2) catch |err| {
        try t.expectEqual(@as(usize, 1), reader.offset);
        return err;
    };
    try t.expectEqual(f.end, reader.offset);
    try t.expectEqual(f.end, value.end);
    try t.expectEqual(@as(u32, 20), value.object_id);
    try t.expectEqual(@as(u32, 21), value.font.object_id);
    try t.expectEqual(introduced, value.font.name_introduced);
    try t.expectEqual(@as(u8, if (introduced) 173 else 99), value.font.name.trailer);
    try t.expectEqual(@as(usize, if (introduced) 4 else 2), objects.string_bytes);
    @memset(&f.bytes, 0);
    seed[0] = 0x33;
    try t.expectEqualSlices(u8, if (introduced) &.{ 0, 0 } else &.{ 0x33, 0x22 }, value.font.name.bytes);
    for (value.font.raw ++ value.raw ++ value.section.raw ++ value.section.backdrop.raw_backdrop ++ value.section.backdrop.raw_fill ++ value.section.backdrop.raw_picture) |byte|
        try t.expectEqual(@as(u8, 0xa5), byte);
    try t.expectEqual(@as(u16, 0xaa55), value.section.backdrop.fill_suffix);
}
fn reject(a: std.mem.Allocator, bytes: []const u8, expected: anyerror, cap: usize) !void {
    var types = Types.init(a, .{});
    defer types.deinit();
    var objects = Objects.init(a, .{});
    defer objects.deinit();
    try objects.registerString(.{ .object_id = 7, .bytes = &.{ 0x11, 0x22 }, .trailer = 99 });
    var reader: Reader = .{ .bytes = bytes, .offset = 1 };
    _ = legends.readObservedV1(&reader, &types, &objects, cap) catch |err| {
        try t.expectEqual(@as(usize, 1), reader.offset);
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(expected, err);
        return;
    };
    return error.ExpectedLegendRejection;
}
test "chart legend new and referenced names ownership exact caps and OOM" {
    for ([_]bool{ false, true }) |introduced| {
        try exercise(t.allocator, introduced);
        try t.checkAllAllocationFailures(t.allocator, exercise, .{introduced});
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("legend leak");
        try exercise(gpa.allocator(), introduced);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    }
}
test "chart legend all cuts late errors and scope rejection" {
    for ([_]bool{ false, true }) |introduced| {
        const original = fixture(introduced);
        for (1..original.end) |cut| try reject(t.allocator, original.bytes[0..cut], error.UnexpectedEnd, 2);
        try reject(t.allocator, original.bytes[0..original.end], error.LimitExceeded, 1);
        var f = original;
        std.mem.writeInt(u32, f.bytes[f.name_id..][0..4], 21, .little);
        try reject(t.allocator, f.bytes[0..f.end], error.UnsupportedChartObjectReference, 2);
        f = original;
        std.mem.writeInt(u32, f.bytes[f.last_id..][0..4], 7, .little);
        try reject(t.allocator, f.bytes[0..f.end], error.DuplicateChartObjectId, 2);
        try t.checkAllAllocationFailures(t.allocator, reject, .{ f.bytes[0..f.end], error.DuplicateChartObjectId, @as(usize, 2) });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("legend error leak");
        try reject(gpa.allocator(), f.bytes[0..f.end], error.DuplicateChartObjectId, 2);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
        for (original.names[0..original.count], original.versions[0..original.count]) |name, version| {
            f = original;
            f.bytes[name] = 'X';
            try reject(t.allocator, f.bytes[0..f.end], error.UnsupportedChartClass, 2);
            f = original;
            f.bytes[version] = 2;
            try reject(t.allocator, f.bytes[0..f.end], error.UnsupportedChartTypeVersion, 2);
        }
    }
}
