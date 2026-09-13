const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const pictures = @import("picture.zig");
const series = @import("series_picture.zig");
const fixture = @import("picture_test_fixture.zig");
const Mode = enum { series, picture, body };
fn exercise(a: std.mem.Allocator, start: usize, known: bool, mode: Mode) !void {
    var f = fixture.make(start, known);
    var types = Types.init(a, .{});
    defer types.deinit();
    if (known) try fixture.seed(&types);
    var objects = Objects.init(a, .{ .max_objects = 1, .max_total_string_bytes = 0 });
    defer objects.deinit();
    if (mode == .body) try objects.registerOther(0);
    const offset = switch (mode) {
        .series => start,
        .picture => f.picture,
        .body => f.body,
    };
    var r: Reader = .{ .bytes = f.bytes[0..f.end], .offset = offset };
    const body = (switch (mode) {
        .series => blk: {
            const p = try series.readObserved(&r, &types, &objects);
            try t.expectEqualSlices(u8, f.bytes[start..][0..40], &p.raw);
            try t.expectEqual(@as(u32, 0), p.picture.object_id);
            try t.expectEqual(f.end, p.end);
            break :blk p.picture.body;
        },
        .picture => (try pictures.readEmptyObservedV1(&r, &types, &objects)).body,
        .body => try pictures.readEmptyBodyObservedV1(&r, &types),
    });
    try t.expectEqual(f.end, r.offset);
    try t.expectEqual(f.end, body.end);
    try t.expectEqualSlices(u8, f.bytes[f.raw..][0..4], &body.raw);
    try t.expectEqual(@as(u32, 1), objects.entries.count());
    try t.expectEqual(@as(usize, 0), objects.string_bytes);
    try t.expectEqual(@as(u32, 2), types.definitions.count());
    @memset(&f.bytes, 0);
    try t.expectEqualSlices(u8, &.{ 0x45, 0x23, 0xff, 0x80 }, &body.raw);
}
const Bad = enum { cut, null_id, duplicate, cap, data, class, version };
fn reject(a: std.mem.Allocator, known: bool, bad: Bad, at: usize) !void {
    var f = fixture.make(17, known);
    var types = Types.init(a, .{});
    defer types.deinit();
    if (known) try fixture.seed(&types);
    var objects = Objects.init(a, .{ .max_objects = if (bad == .cap) 0 else 2 });
    defer objects.deinit();
    if (bad == .duplicate) try objects.registerOther(0);
    if (bad == .null_id) std.mem.writeInt(u32, f.bytes[f.picture..][0..4], 0xffffffff, .little);
    if (bad == .data) std.mem.writeInt(u32, f.bytes[f.data..][0..4], @intCast(at), .little);
    if (bad == .class or bad == .version) {
        if (known) {
            if (bad == .version) types.definitions.getPtr(@intCast(51 + 46 * at)).?.version = 99 else std.mem.writeInt(u32, f.bytes[f.refs[at]..][0..4], if (at == 0) 97 else 51, .little);
        } else f.bytes[if (bad == .class) f.name_offsets[at] else f.versions[at]] ^= 1;
    }
    var r: Reader = .{ .bytes = f.bytes[0..if (bad == .cut) at else f.end], .offset = 17 };
    _ = series.readObserved(&r, &types, &objects) catch |err| {
        try t.expectEqual(@as(usize, 17), r.offset);
        if (err == error.OutOfMemory) return err;
        const expected: anyerror = switch (bad) {
            .cut => error.UnexpectedEnd,
            .null_id => error.UnsupportedChartObjectReference,
            .duplicate => error.DuplicateChartObjectId,
            .cap => error.LimitExceeded,
            .data => error.UnsupportedChartPictureData,
            .class => error.UnsupportedChartClass,
            .version => error.UnsupportedChartTypeVersion,
        };
        try t.expectEqual(expected, err);
        return;
    };
    return error.ExpectedPictureRejection;
}
test "chart picture shared body standalone series offsets ownership and OOM" {
    for ([_]bool{ false, true }) |known| for (std.enums.values(Mode)) |mode| {
        for ([_]usize{ 0, 1, 17, 257 }) |start| try exercise(t.allocator, start, known, mode);
        try t.checkAllAllocationFailures(t.allocator, exercise, .{ @as(usize, 1), known, mode });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("picture leak");
        try exercise(gpa.allocator(), 1, known, mode);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    };
}
test "chart picture all cuts IDs classes versions nonempty references limits late cleanup" {
    for ([_]bool{ false, true }) |known| {
        const f = fixture.make(17, known);
        for (17..f.end) |cut| try reject(t.allocator, known, .cut, cut);
        for ([_]Bad{ .null_id, .duplicate, .cap }) |bad| try reject(t.allocator, known, bad, 0);
        for ([_]usize{ 0, 1, 999, 0xfffffffe }) |id| try reject(t.allocator, known, .data, id);
        for (0..2) |slot| for ([_]Bad{ .class, .version }) |bad| try reject(t.allocator, known, bad, slot);
        try t.checkAllAllocationFailures(t.allocator, reject, .{ known, Bad.cut, f.end - 1 });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("picture late leak");
        try reject(gpa.allocator(), known, .cut, f.end - 1);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    }
}

fn directFailure(a: std.mem.Allocator, known: bool, standalone: bool, cut: usize) !void {
    const f = fixture.make(17, known);
    var types = Types.init(a, .{});
    defer types.deinit();
    if (known) try fixture.seed(&types);
    var objects = Objects.init(a, .{});
    defer objects.deinit();
    const offset = if (standalone) f.picture else f.body;
    var r: Reader = .{ .bytes = f.bytes[0..cut], .offset = offset };
    const err = if (standalone) blk: {
        _ = pictures.readEmptyObservedV1(&r, &types, &objects) catch |err| break :blk err;
        break :blk error.ExpectedPictureRejection;
    } else blk: {
        _ = pictures.readEmptyBodyObservedV1(&r, &types) catch |err| break :blk err;
        break :blk error.ExpectedPictureRejection;
    };
    try t.expectEqual(offset, r.offset);
    if (err == error.OutOfMemory) return err;
    try t.expectEqual(error.UnexpectedEnd, err);
}
test "chart picture standalone and body failures preserve their own cursor" {
    for ([_]bool{ false, true }) |known| for ([_]bool{ false, true }) |standalone| {
        const f = fixture.make(17, known);
        for (if (standalone) f.picture else f.body..f.end) |cut| try directFailure(t.allocator, known, standalone, cut);
        try t.checkAllAllocationFailures(t.allocator, directFailure, .{ known, standalone, f.end - 1 });
    };
}
