const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const lights = @import("light.zig");
const arrays = @import("array_header.zig");
const sources = @import("light_source.zig");
const Fixture = struct {
    bytes: [4096]u8 = @splat(0xa5),
    end: usize = 1,
    array_start: usize = 0,
    array_end: usize = 0,
    first: usize = 0,
    second: usize = 0,
    source_start: usize = 0,
    source_end: usize = 0,
    names: [5]usize = undefined,
    versions: [5]usize = undefined,
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
fn fixture(count: u16) Fixture {
    var f: Fixture = .{};
    f.int(u32, 0);
    f.decl(0xffffffff, "VtLight3\x00");
    f.array_start = f.end;
    f.int(u32, 20);
    f.decl(77, "VtArray\x00");
    f.first = f.end;
    f.int(u16, count);
    f.decl(31, "VtCollection\x00");
    f.second = f.end;
    f.int(u16, count);
    f.decl(32, "VtObject\x00");
    f.array_end = f.end;
    for (0..count) |i| {
        if (i == 0) f.source_start = f.end;
        f.int(u32, @intCast(100 + i));
        if (i == 0) f.decl(3, "VtInfLight3\x00") else f.int(u32, 3);
        @memset(f.bytes[f.end..][0..16], @intCast(i));
        f.end += 16;
        f.int(u32, 32);
        if (i == 0) f.source_end = f.end;
    }
    f.end += 10;
    f.int(u32, 32);
    return f;
}
fn exercise(a: std.mem.Allocator, count: u16) !void {
    var f = fixture(count);
    var types = Types.init(a, .{});
    defer types.deinit();
    var objects = Objects.init(a, .{ .max_objects = 2 + @as(usize, count) });
    defer objects.deinit();
    var reader: Reader = .{ .bytes = f.bytes[0 .. f.end + 1], .offset = 1 };
    var value = lights.readObservedV1(a, &reader, &types, &objects, .{ .max_sources = count }) catch |err| {
        try t.expectEqual(@as(usize, 1), reader.offset);
        return err;
    };
    defer value.deinit();
    try t.expectEqual(f.end, reader.offset);
    try t.expectEqual(f.end, value.end);
    try t.expectEqual(@as(u32, 0), value.object_id);
    try t.expectEqual(@as(u32, 20), value.array.object_id);
    try t.expectEqual(f.array_end, value.array.end);
    try t.expectEqual(count, value.array.first_word);
    try t.expectEqual(count, value.array.second_word);
    try t.expectEqual(count, value.sources.len);
    @memset(&f.bytes, 0xff);
    for (value.raw) |b| try t.expectEqual(@as(u8, 0xa5), b);
    for (value.sources, 0..) |s, i| {
        try t.expectEqual(@as(u32, @intCast(100 + i)), s.object_id);
        for (s.raw) |b| try t.expectEqual(@as(u8, @intCast(i)), b);
        if (i == 0) {
            try t.expectEqual(f.source_start, s.start);
            try t.expectEqual(f.source_end, s.end);
        }
    }
}
fn reject(a: std.mem.Allocator, bytes: []const u8, expected: anyerror, cap: usize, object_cap: usize) !void {
    var types = Types.init(a, .{});
    defer types.deinit();
    var objects = Objects.init(a, .{ .max_objects = object_cap });
    defer objects.deinit();
    var reader: Reader = .{ .bytes = bytes, .offset = 1 };
    var value = lights.readObservedV1(a, &reader, &types, &objects, .{ .max_sources = cap }) catch |err| {
        try t.expectEqual(@as(usize, 1), reader.offset);
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(expected, err);
        return;
    };
    value.deinit();
    return error.ExpectedLightRejection;
}
test "chart light ownership exact limits zero and multiple sources OOM" {
    for ([_]u16{ 0, 1, 2, 3, 16 }) |count| {
        try exercise(t.allocator, count);
        try t.checkAllAllocationFailures(t.allocator, exercise, .{count});
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("light leak");
        try exercise(gpa.allocator(), count);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    }
}
test "chart light cuts class version count scope and late error cleanup" {
    const original = fixture(3);
    for (1..original.end) |cut| try reject(t.allocator, original.bytes[0..cut], error.UnexpectedEnd, 3, 5);
    try reject(t.allocator, original.bytes[0..original.end], error.LimitExceeded, 2, 5);
    try reject(t.allocator, original.bytes[0..original.end], error.LimitExceeded, 3, 4);
    for (original.names, original.versions) |name, version| {
        var f = original;
        f.bytes[name] = 'X';
        try reject(t.allocator, f.bytes[0..f.end], error.UnsupportedChartClass, 3, 5);
        f = original;
        f.bytes[version] = 2;
        try reject(t.allocator, f.bytes[0..f.end], error.UnsupportedChartTypeVersion, 3, 5);
    }
    for ([_]usize{ original.first, original.second }) |at| {
        var f = original;
        std.mem.writeInt(u16, f.bytes[at..][0..2], 65535, .little);
        try reject(t.allocator, f.bytes[0..f.end], error.UnsupportedChartArrayLayout, 3, 5);
    }
    for ([_]usize{ original.array_start, original.source_start, original.source_end }) |at| for ([_]u32{ 0, 0xffffffff }) |id| {
        var f = original;
        std.mem.writeInt(u32, f.bytes[at..][0..4], id, .little);
        try reject(t.allocator, f.bytes[0..f.end], if (id == 0) error.DuplicateChartObjectId else error.UnsupportedChartObjectReference, 3, 5);
    };
    var f = original;
    std.mem.writeInt(u32, f.bytes[f.end - 4 ..][0..4], 77, .little);
    try t.checkAllAllocationFailures(t.allocator, reject, .{ f.bytes[0..f.end], error.UnsupportedChartClass, @as(usize, 3), @as(usize, 5) });
    var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer t.expect(gpa.deinit() == .ok) catch @panic("light error leak");
    try reject(gpa.allocator(), f.bytes[0..f.end], error.UnsupportedChartClass, 3, 5);
    try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
}
test "chart light array header preserves unequal words and max u16" {
    var f = fixture(0);
    std.mem.writeInt(u16, f.bytes[f.first..][0..2], 65535, .little);
    var types = Types.init(t.allocator, .{});
    defer types.deinit();
    var objects = Objects.init(t.allocator, .{});
    defer objects.deinit();
    var reader: Reader = .{ .bytes = f.bytes[0..f.end], .offset = f.array_start };
    var value = try arrays.readObservedV1(&reader, &types, &objects);
    try t.expectEqual(@as(u16, 65535), value.first_word);
    try t.expectEqual(@as(u16, 0), value.second_word);
    try t.expectEqual(f.array_end, reader.offset);
    try t.expectError(error.UnsupportedChartArrayLayout, value.observedEqualCount(65535));
    value.second_word = 65535;
    try t.expectEqual(@as(usize, 65535), try value.observedEqualCount(65535));
    try t.expectError(error.LimitExceeded, value.observedEqualCount(65534));
}
test "chart light header and source local readers roll back every truncation" {
    const f = fixture(1);
    for (f.array_start..f.array_end) |cut| {
        var types = Types.init(t.allocator, .{});
        defer types.deinit();
        var objects = Objects.init(t.allocator, .{});
        defer objects.deinit();
        var reader: Reader = .{ .bytes = f.bytes[0..cut], .offset = f.array_start };
        try t.expectError(error.UnexpectedEnd, arrays.readObservedV1(&reader, &types, &objects));
        try t.expectEqual(f.array_start, reader.offset);
    }
    for (f.source_start..f.source_end) |cut| {
        var types = Types.init(t.allocator, .{});
        defer types.deinit();
        var objects = Objects.init(t.allocator, .{});
        defer objects.deinit();
        var reader: Reader = .{ .bytes = f.bytes[0..cut], .offset = f.array_start };
        _ = try arrays.readObservedV1(&reader, &types, &objects);
        try t.expectError(error.UnexpectedEnd, sources.readObservedV1(&reader, &types, &objects));
        try t.expectEqual(f.source_start, reader.offset);
    }
}

test "chart light final owned slice allocation failure preserves cursor and frees list" {
    const f = fixture(1);
    var types = Types.init(t.allocator, .{});
    defer types.deinit();
    var objects = Objects.init(t.allocator, .{});
    defer objects.deinit();
    // Keep table allocations separate: first list allocation succeeds, remap
    // is disabled, and the final toOwnedSlice fallback allocation must fail.
    var failing = t.FailingAllocator.init(t.allocator, .{ .fail_index = 1, .resize_fail_index = 0 });
    var reader: Reader = .{ .bytes = f.bytes[0..f.end], .offset = 1 };
    try t.expectError(error.OutOfMemory, lights.readObservedV1(failing.allocator(), &reader, &types, &objects, .{}));
    try t.expect(failing.has_induced_failure);
    try t.expectEqual(@as(usize, 1), failing.alloc_index);
    try t.expectEqual(@as(usize, 1), reader.offset);
    try t.expectEqual(failing.allocated_bytes, failing.freed_bytes);
    try t.expectEqual(@as(u32, 3), objects.entries.count());
}
