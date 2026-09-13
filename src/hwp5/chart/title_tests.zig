const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const titles = @import("title.zig");
const fixture = @import("title_test_fixture.zig");
const Kind = fixture.Kind;
fn exercise(a: std.mem.Allocator, start: usize, known: bool, kind: Kind, fresh_name: bool, auxiliary: bool, body_only: bool) !void {
    var f = fixture.make(start, known, kind, fresh_name, auxiliary);
    var types = Types.init(a, .{});
    defer types.deinit();
    if (known) try fixture.seedTypes(&types);
    var objects = Objects.init(a, .{ .max_objects = f.next_id + 2 });
    defer objects.deinit();
    try fixture.seedObjects(&objects);
    var r: Reader = .{ .bytes = f.bytes[0 .. f.end + 31], .offset = start };
    const body = if (body_only) blk: {
        _ = try @import("title_header.zig").readObservedV1(&r, &types, &objects);
        try t.expectEqual(f.body_start, r.offset);
        break :blk try titles.readBodyObservedV1(&r, &types, &objects, .{});
    } else blk: {
        const title = try titles.readObservedV1(&r, &types, &objects, .{});
        try t.expectEqual(@as(u32, 0), title.header.object_id);
        try t.expectEqual(f.body_start, title.header.end);
        try t.expectEqual(f.end, title.end);
        break :blk title.body;
    };
    try t.expectEqual(f.end, r.offset);
    try t.expectEqual(f.end, body.end);
    try t.expectEqual(f.end, body.section.end);
    try t.expectEqual(f.section_start, body.block.end);
    try t.expectEqual(f.block_id, body.block.object_id);
    try t.expectEqual(f.font_name, body.block.font.name.object_id);
    try t.expectEqual(fresh_name, body.block.font.name_introduced);
    try t.expectEqual(auxiliary, body.block.backdrop != null);
    try t.expectEqual(kind == .absent, body.block.text == null);
    if (kind == .empty) try t.expectEqual(@as(usize, 0), body.block.text.?.bytes.len);
    if (kind == .font) try t.expectEqual(f.font_name, body.block.text.?.object_id);
    try t.expectEqual(f.next_id + 2, objects.entries.count());
    try t.expectEqual(@as(usize, 3) + @as(usize, if (fresh_name) 4 else 0) + @as(usize, if (kind == .fresh) 5 else 0), objects.string_bytes);
    const bd = body.section.backdrop;
    try t.expectEqualSlices(u32, &f.section_ids, &bd.object_ids);
    try t.expectEqual(f.backdrop_end, bd.end);
    try t.expectEqual(@as(u16, 0xa55a), bd.fill_suffix);
    try t.expectEqualSlices(u8, f.bytes[f.section_raw..][0..26], &body.section.raw);
    try t.expectEqualSlices(u8, f.bytes[f.raw_backdrop..][0..50], &bd.raw_backdrop);
    try t.expectEqualSlices(u8, f.bytes[f.raw_fill..][0..34], &bd.raw_fill);
    try t.expectEqualSlices(u8, f.bytes[f.raw_picture..][0..4], &bd.raw_picture);
    const saved = body.section.raw;
    @memset(&f.bytes, 0);
    try t.expectEqualSlices(u8, &saved, &body.section.raw);
}
test "chart title whole and body offsets scope raw ownership nullable aliases and OOM" {
    for ([_]bool{ false, true }) |known| for ([_]bool{ false, true }) |body_only| {
        for ([_]usize{ 0, 1, 17, 257 }) |start| for (std.enums.values(Kind)) |kind| for ([_]bool{ false, true }) |fresh_name| for ([_]bool{ false, true }) |auxiliary| try exercise(t.allocator, start, known, kind, fresh_name, auxiliary, body_only);
        try t.checkAllAllocationFailures(t.allocator, exercise, .{ @as(usize, 17), known, Kind.fresh, true, true, body_only });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("title leak");
        try exercise(gpa.allocator(), 17, known, .fresh, true, true, body_only);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    };
}

const Mode = enum { whole, body, section, backdrop };
fn consume(r: *Reader, types: *Types, objects: *Objects, mode: Mode, options: titles.Options) !void {
    switch (mode) {
        .whole => _ = try titles.readObservedV1(r, types, objects, options),
        .body => _ = try titles.readBodyObservedV1(r, types, objects, options),
        .section => _ = try @import("chart_section.zig").readObservedWithObjects(r, types, objects),
        .backdrop => _ = try @import("backdrop.zig").readObservedEmptyPictureWithObjects(r, types, objects),
    }
}
fn prepare(r: *Reader, types: *Types, objects: *Objects, mode: Mode) !void {
    if (mode == .whole) return;
    _ = try @import("title_header.zig").readObservedV1(r, types, objects);
    if (mode == .body) return;
    _ = try types.readObserved16(r); // Fixture's ChartText type.
    _ = try @import("text_block.zig").readNullableObservedWithObjects(r, types, objects, .{});
    if (mode == .section) return;
    _ = try types.readObserved16(r); // Fixture's ChartSection type.
    _ = try r.take(26);
}
fn cut(a: std.mem.Allocator, known: bool, mode: Mode, end: usize) !void {
    const f = fixture.make(17, known, .fresh, true, true);
    var types = Types.init(a, .{});
    defer types.deinit();
    if (known) try fixture.seedTypes(&types);
    var objects = Objects.init(a, .{});
    defer objects.deinit();
    try fixture.seedObjects(&objects);
    var r: Reader = .{ .bytes = f.bytes[0..f.end], .offset = 17 };
    try prepare(&r, &types, &objects, mode);
    const start = r.offset;
    r.bytes = f.bytes[0..end];
    consume(&r, &types, &objects, mode, .{}) catch |err| {
        try t.expectEqual(start, r.offset);
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(error.UnexpectedEnd, err);
        return;
    };
    return error.ExpectedTitleRejection;
}
test "chart title section backdrop all cuts preserve each entry cursor and clean late failures" {
    for ([_]bool{ false, true }) |known| for (std.enums.values(Mode)) |mode| {
        const f = fixture.make(17, known, .fresh, true, true);
        const start = switch (mode) {
            .whole => 17,
            .body => f.body_start,
            .section => f.section_start,
            .backdrop => f.backdrop_start,
        };
        const end = if (mode == .backdrop) f.backdrop_end else f.end;
        for (start..end) |at| try cut(t.allocator, known, mode, at);
        try t.checkAllAllocationFailures(t.allocator, cut, .{ known, mode, end - 1 });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("title cut leak");
        try cut(gpa.allocator(), known, mode, end - 1);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    };
}
const Bad = enum { global_id, class, version, data, object_cap, per_string, total_string, local_second_cut, local_third_cut, global_backdrop_cut, global_section_cut };
fn reject(a: std.mem.Allocator, known: bool, bad: Bad, slot: usize) !void {
    var f = fixture.make(17, known, .fresh, true, true);
    var types = Types.init(a, .{});
    defer types.deinit();
    if (known) try fixture.seedTypes(&types);
    var objects = Objects.init(a, .{ .max_objects = if (bad == .object_cap) f.next_id + 1 else 1000000 });
    defer objects.deinit();
    try fixture.seedObjects(&objects);
    var end = f.end;
    var options: titles.Options = .{};
    var expected: anyerror = error.LimitExceeded;
    switch (bad) {
        .global_id => {
            const at = f.object_offsets[slot];
            std.mem.writeInt(u32, f.bytes[at..][0..4], 999, .little);
            expected = if (slot == f.font_name or at == f.text_at) error.UnsupportedChartObjectReference else error.DuplicateChartObjectId;
        },
        .class, .version => {
            if (known) {
                if (bad == .version) types.definitions.getPtr(@intCast(31 + 37 * slot)).?.version = 99 else std.mem.writeInt(u32, f.bytes[f.refs[slot]..][0..4], if (slot == 0) 68 else 31, .little);
            } else f.bytes[if (bad == .class) f.names_at[slot] else f.versions[slot]] ^= 1;
            expected = if (bad == .class) error.UnsupportedChartClass else error.UnsupportedChartTypeVersion;
        },
        .data => {
            std.mem.writeInt(u32, f.bytes[f.data_at..][0..4], @intCast(slot), .little);
            expected = error.UnsupportedChartPictureData;
        },
        .per_string => options.max_string_bytes = 3,
        .total_string => options.max_total_string_bytes = 8,
        .object_cap => {},
        .local_second_cut, .local_third_cut => {
            const id = f.section_ids[if (bad == .local_second_cut) 1 else 2];
            const at = f.object_offsets[id];
            std.mem.writeInt(u32, f.bytes[at..][0..4], f.section_ids[0], .little);
            end = at + 4;
            expected = error.UnsupportedChartObjectReference;
        },
        .global_backdrop_cut, .global_section_cut => {
            std.mem.writeInt(u32, f.bytes[f.backdrop_start..][0..4], 999, .little);
            end = if (bad == .global_backdrop_cut) f.backdrop_end - 1 else f.end - 1;
            expected = if (bad == .global_backdrop_cut) error.UnexpectedEnd else error.DuplicateChartObjectId;
        },
    }
    var r: Reader = .{ .bytes = f.bytes[0..end], .offset = 17 };
    _ = titles.readObservedV1(&r, &types, &objects, options) catch |err| {
        try t.expectEqual(@as(usize, 17), r.offset);
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(expected, err);
        return;
    };
    return error.ExpectedTitleRejection;
}
test "chart title global identity types limits and local versus global duplicate precedence" {
    for ([_]bool{ false, true }) |known| {
        const f = fixture.make(17, known, .fresh, true, true);
        for (0..f.next_id) |slot| try reject(t.allocator, known, .global_id, slot);
        for (0..11) |slot| for ([_]Bad{ .class, .version }) |bad| try reject(t.allocator, known, bad, slot);
        for ([_]usize{ 0, 1, 999, 0xfffffffe }) |id| try reject(t.allocator, known, .data, id);
        for ([_]Bad{ .object_cap, .per_string, .total_string, .local_second_cut, .local_third_cut, .global_backdrop_cut, .global_section_cut }) |bad| try reject(t.allocator, known, bad, 0);
        try t.checkAllAllocationFailures(t.allocator, reject, .{ known, Bad.global_section_cut, @as(usize, 0) });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("title reject leak");
        try reject(gpa.allocator(), known, .global_section_cut, 0);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    }
}

fn directDuplicate(a: std.mem.Allocator, known: bool, mode: Mode) !void {
    var f = fixture.make(17, known, .fresh, true, true);
    var types = Types.init(a, .{});
    defer types.deinit();
    if (known) try fixture.seedTypes(&types);
    var objects = Objects.init(a, .{});
    defer objects.deinit();
    try fixture.seedObjects(&objects);
    var r: Reader = .{ .bytes = f.bytes[0..f.end], .offset = 17 };
    try prepare(&r, &types, &objects, mode);
    const start = r.offset;
    std.mem.writeInt(u32, f.bytes[f.backdrop_start..][0..4], 999, .little);
    consume(&r, &types, &objects, mode, .{}) catch |err| {
        try t.expectEqual(start, r.offset);
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(error.DuplicateChartObjectId, err);
        return;
    };
    return error.ExpectedTitleRejection;
}
test "chart title component global registration failure preserves its own cursor" {
    for ([_]bool{ false, true }) |known| for (std.enums.values(Mode)) |mode| {
        try directDuplicate(t.allocator, known, mode);
        try t.checkAllAllocationFailures(t.allocator, directDuplicate, .{ known, mode });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("title registration leak");
        try directDuplicate(gpa.allocator(), known, mode);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    };
}
