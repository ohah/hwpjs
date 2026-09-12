const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const axes = @import("axis.zig");
const fixture = @import("axis_test_fixture.zig");
const tails = @import("axis_tail.zig");
const scales = @import("axis_scale.zig");
fn exercise(a: std.mem.Allocator, scale: bool, long: bool, start: usize) !void {
    const f = fixture.make(scale, long, start);
    var types = Types.init(a, .{});
    defer types.deinit();
    var objects = Objects.init(a, .{ .max_objects = f.objects, .max_total_string_bytes = f.stored });
    defer objects.deinit();
    var reader: Reader = .{ .bytes = f.bytes[0 .. f.end + 1], .offset = start };
    const axis = axes.readObservedV3(&reader, &types, &objects, .{ .max_string_bytes = 2, .max_total_string_bytes = f.total }) catch |err| {
        try t.expectEqual(start, reader.offset);
        return err;
    };
    try t.expectEqual(@as(u32, 1000), axis.object_id);
    try t.expectEqual(f.end, axis.end);
    try t.expectEqual(f.end, reader.offset);
    try t.expectEqualSlices(u8, f.bytes[f.raw..][0..82], &axis.raw);
    try t.expectEqual(scale, axis.scale != null);
    try t.expectEqual(long, axis.tail.extra != null);
    try t.expectEqualSlices(u8, &@as([36]u8, @splat(0xa5)), &axis.tail.prefix);
    if (axis.tail.extra) |raw| try t.expectEqualSlices(u8, &@as([24]u8, @splat(0xa5)), &raw);
    try t.expectEqualSlices(u8, &@as([14]u8, @splat(0xa5)), &axis.tail.suffix);
    try t.expect(axis.title.font.name.bytes.ptr == axis.title.text.bytes.ptr);
    try t.expectEqualSlices(u8, &.{ 0xff, 0x80 }, axis.title.text.bytes);
    if (axis.scale) |s| {
        try t.expectEqual(@as(u32, 1005), s.object_id);
        try t.expectEqual(@as(u16, 5), s.array.first_word);
        try t.expectEqual(@as(u16, 0), s.array.second_word);
        try t.expectEqual(@as(u32, 65536), s.value.header_word);
        try t.expectEqual(@as(u64, 0x7ff8000000001234), s.value.reference.?.value.number.bits);
    }
    try t.expectEqual(f.stored, objects.string_bytes);
    try t.expectEqual(f.objects, objects.entries.count());
}
fn reject(a: std.mem.Allocator, bytes: []const u8, total: usize, expected: anyerror) !void {
    var types = Types.init(a, .{});
    defer types.deinit();
    var objects = Objects.init(a, .{});
    defer objects.deinit();
    var reader: Reader = .{ .bytes = bytes, .offset = 1 };
    _ = axes.readObservedV3(&reader, &types, &objects, .{ .max_string_bytes = 2, .max_total_string_bytes = total }) catch |err| {
        try t.expectEqual(@as(usize, 1), reader.offset);
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(expected, err);
        return;
    };
    return error.ExpectedAxisRejection;
}
test "chart axis composition offsets scale tail ownership and OOM" {
    for ([_]bool{ false, true }) |scale| for ([_]bool{ false, true }) |long| {
        for ([_]usize{ 0, 1, 17, 257 }) |start| try exercise(t.allocator, scale, long, start);
        try t.checkAllAllocationFailures(t.allocator, exercise, .{ scale, long, @as(usize, 1) });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("axis leak");
        try exercise(gpa.allocator(), scale, long, 1);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    };
}
test "chart axis cuts unsupported layouts versions total budget late errors" {
    for ([_]bool{ false, true }) |scale| for ([_]bool{ false, true }) |long| {
        const f = fixture.make(scale, long, 1);
        for (1..f.end) |cut| try reject(t.allocator, f.bytes[0..cut], f.total, error.UnexpectedEnd);
        try reject(t.allocator, f.bytes[0..f.end], f.total - 1, error.LimitExceeded);
        var wrong_outer = f;
        wrong_outer.bytes[f.outer_first] = 2;
        wrong_outer.bytes[f.outer_second] = 2;
        try reject(t.allocator, wrong_outer.bytes[0..wrong_outer.end], f.total, error.UnsupportedChartAxisScaleLayout);
        var bad = f;
        bad.bytes[f.raw + 6] = 2;
        try reject(t.allocator, bad.bytes[0..bad.end], f.total, error.UnsupportedChartAxisTailLayout);
        bad = f;
        bad.bytes[f.array_first] ^= 2;
        try reject(t.allocator, bad.bytes[0..bad.end], f.total, error.UnsupportedChartAxisScaleLayout);
        bad = f;
        bad.bytes[f.array_second] ^= 2;
        try reject(t.allocator, bad.bytes[0..bad.end], f.total, error.UnsupportedChartAxisScaleLayout);
        if (scale) for (0..5) |i| {
            bad = f;
            bad.bytes[f.slots + i * 4] = 0;
            try reject(t.allocator, bad.bytes[0..bad.end], f.total, error.UnsupportedChartAxisScaleLayout);
        };
        for (f.names[0..f.count], f.versions[0..f.count]) |name, version| {
            bad = f;
            bad.bytes[name] ^= 1;
            try reject(t.allocator, bad.bytes[0..bad.end], f.total, error.UnsupportedChartClass);
            bad = f;
            bad.bytes[version] ^= 1;
            try reject(t.allocator, bad.bytes[0..bad.end], f.total, error.UnsupportedChartTypeVersion);
        }
        const late = f.bytes[0 .. f.end - 1];
        try t.checkAllAllocationFailures(t.allocator, reject, .{ late, f.total, error.UnexpectedEnd });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("axis late leak");
        try reject(gpa.allocator(), late, f.total, error.UnexpectedEnd);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    };
}

test "chart axis tail direct cursor boundaries and copied raw fields" {
    var types = Types.init(t.allocator, .{});
    defer types.deinit();
    const declaration = [_]u8{ 11, 0, 0, 0, 9, 0 } ++ "VtObject\x00".* ++ [_]u8{ 1, 0 };
    var seed_reader: Reader = .{ .bytes = &declaration };
    _ = try types.readObserved16(&seed_reader);
    for ([_]usize{ 0, 1, 17, 257 }) |start| for ([_]u16{ 0, 1 }) |selector| {
        var bytes: [512]u8 = @splat(0x81);
        const end = start + 54 + @as(usize, selector) * 24;
        std.mem.writeInt(u32, bytes[end - 4 ..][0..4], 11, .little);
        for (start..end) |cut| {
            var reader: Reader = .{ .bytes = bytes[0..cut], .offset = start };
            try t.expectError(error.UnexpectedEnd, tails.readObserved(&reader, &types, selector));
            try t.expectEqual(start, reader.offset);
        }
        var reader: Reader = .{ .bytes = bytes[0 .. end + 1], .offset = start };
        try t.expectError(error.UnsupportedChartAxisTailLayout, tails.readObserved(&reader, &types, 2));
        try t.expectEqual(start, reader.offset);
        const tail = try tails.readObserved(&reader, &types, selector);
        try t.expectEqual(end, tail.end);
        try t.expectEqual(end, reader.offset);
        @memset(&bytes, 0);
        try t.expectEqualSlices(u8, &@as([36]u8, @splat(0x81)), &tail.prefix);
        try t.expectEqualSlices(u8, &@as([14]u8, @splat(0x81)), &tail.suffix);
        if (tail.extra) |raw| try t.expectEqualSlices(u8, &@as([24]u8, @splat(0x81)), &raw);
    };
}

fn scaleBoundary(a: std.mem.Allocator, cut: usize) !void {
    const f = fixture.make(true, true, 1);
    var types = Types.init(a, .{});
    defer types.deinit();
    var objects = Objects.init(a, .{});
    defer objects.deinit();
    // Seed only declarations BEFORE the scale. Neither its new declaration
    // nor embedded ValueBlock declarations may be pre-consumed.
    for (f.names[0..f.count]) |name| {
        if (name >= f.scale_start) break;
        var declaration: Reader = .{ .bytes = f.bytes[0..f.scale_start], .offset = name - 6 };
        _ = try types.readObserved16(&declaration);
    }
    var reader: Reader = .{ .bytes = f.bytes[0..cut], .offset = f.scale_start };
    const scale = scales.readObservedV1(&reader, &types, &objects, .{}) catch |err| {
        try t.expectEqual(f.scale_start, reader.offset);
        if (err == error.OutOfMemory) return err;
        try t.expect(cut < f.scale_end);
        try t.expectEqual(error.UnexpectedEnd, err);
        return;
    };
    try t.expectEqual(f.scale_end, cut);
    try t.expectEqual(f.scale_end, reader.offset);
    try t.expectEqual(f.scale_end, scale.end);
}

test "chart axis scale direct cursor cuts and late OOM" {
    const f = fixture.make(true, true, 1);
    for (f.scale_start..f.scale_end + 1) |cut| try scaleBoundary(t.allocator, cut);
    try t.checkAllAllocationFailures(t.allocator, scaleBoundary, .{f.scale_end});
    try t.checkAllAllocationFailures(t.allocator, scaleBoundary, .{f.scale_end - 1});
}
