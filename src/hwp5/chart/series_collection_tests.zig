const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const collections = @import("series_collection.zig");
const fixture = @import("series_collection_test_fixture.zig");
const counts = [_]usize{ 0, 1, 4 };
fn exercise(a: std.mem.Allocator, start: usize, known: bool, n: usize) !void {
    var f = fixture.make(start, known, counts[0..n]);
    var types = Types.init(a, .{});
    defer types.deinit();
    if (known) try fixture.seedTypes(&types);
    var objects = Objects.init(a, .{});
    defer objects.deinit();
    try fixture.seedObjects(&objects);
    // Caller-selected counts do not impose a global equality rule on Array.
    if (n > 0) std.mem.writeInt(u16, f.bytes[f.rows[0].second_word..][0..2], 65535, .little);
    var r: Reader = .{ .bytes = f.bytes[0 .. f.end + 17], .offset = start };
    var c = try collections.readObserved(a, &r, &types, &objects, counts[0..n], .{});
    defer c.deinit();
    try t.expectEqual(f.end, r.offset);
    try t.expectEqual(f.end, c.end);
    try t.expectEqual(f.end, c.title.end);
    try t.expectEqual(f.next_id - 1, c.title.object_id);
    try t.expectEqual(f.next_id + 1, objects.entries.count());
    try t.expectEqual(@as(usize, 2), objects.string_bytes);
    try t.expectEqual(n, c.items.len);
    for (c.items, f.rows[0..n], counts[0..n]) |s, row, count| {
        try t.expectEqual(row.end, s.end);
        try t.expectEqual(row.prefix_end, s.prefix.end);
        try t.expectEqual(row.section_end, s.section.end);
        try t.expectEqual(row.suffix_end, s.suffix.end);
        try t.expectEqual(row.picture_end, s.picture.end);
        try t.expectEqualSlices(u8, f.bytes[row.picture_end..row.end], &s.trailer);
        try t.expectEqual(count, s.section.points.len);
        try t.expectEqual(@as(u32, 999), s.section.text.value.object_id);
        try t.expect(!s.section.text.introduced);
        try t.expectEqualSlices(u8, &.{ 0xff, 0x80 }, s.section.label.body.text.?.bytes);
        for (s.section.points) |p| try t.expect(p.label.body.text == null);
        try t.expectEqual(@as(u16, 65535), s.suffix.raw_word);
        try t.expect(s.suffix.formats[0].code == null);
        try t.expectEqual(@as(u32, 999), s.suffix.formats[1].code.?.object_id);
    }
    if (n > 0) {
        const raw = c.items[0].trailer;
        @memset(&f.bytes, 0);
        try t.expectEqualSlices(u8, &raw, &c.items[0].trailer);
    }
}
test "chart series collection offsets state ownership null aliases explicit counts OOM" {
    for ([_]bool{ false, true }) |known| {
        for ([_]usize{ 0, 1, 17, 257 }) |start| for (0..4) |n| try exercise(t.allocator, start, known, n);
        try t.checkAllAllocationFailures(t.allocator, exercise, .{ @as(usize, 17), known, @as(usize, 3) });
    }
}
fn cut(a: std.mem.Allocator, known: bool, end: usize) !void {
    const f = fixture.make(17, known, &counts);
    var types = Types.init(a, .{});
    defer types.deinit();
    if (known) try fixture.seedTypes(&types);
    var objects = Objects.init(a, .{});
    defer objects.deinit();
    try fixture.seedObjects(&objects);
    var r: Reader = .{ .bytes = f.bytes[0..end], .offset = 17 };
    var c = collections.readObserved(a, &r, &types, &objects, &counts, .{}) catch |err| {
        try t.expectEqual(@as(usize, 17), r.offset);
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(error.UnexpectedEnd, err);
        return;
    };
    c.deinit();
    return error.ExpectedCollectionRejection;
}
test "chart series collection every cut rollback and partial result cleanup" {
    for ([_]bool{ false, true }) |known| {
        const f = fixture.make(17, known, &counts);
        for (17..f.end) |end| try cut(t.allocator, known, end);
        try t.checkAllAllocationFailures(t.allocator, cut, .{ known, f.end - 1 });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("series collection leak");
        try exercise(gpa.allocator(), 17, known, 3);
        try cut(gpa.allocator(), known, f.end - 1);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    }
}

const Bad = enum { duplicate_series, null_title, duplicate_title, title_class, title_version, object_cap, series_cap, point_cap, code_cap, string_cap, body_total, suffix_total };
fn reject(a: std.mem.Allocator, known: bool, bad: Bad) !void {
    var f = fixture.make(17, known, &counts);
    var types = Types.init(a, .{});
    defer types.deinit();
    if (known) try fixture.seedTypes(&types);
    var objects = Objects.init(a, .{ .max_objects = if (bad == .object_cap) f.next_id else 1000000 });
    defer objects.deinit();
    try fixture.seedObjects(&objects);
    var options: collections.Options = .{};
    const expected: anyerror = switch (bad) {
        .duplicate_series, .duplicate_title => error.DuplicateChartObjectId,
        .null_title => error.UnsupportedChartObjectReference,
        .title_class => error.UnsupportedChartClass,
        .title_version => error.UnsupportedChartTypeVersion,
        else => error.LimitExceeded,
    };
    switch (bad) {
        .duplicate_series => std.mem.writeInt(u32, f.bytes[f.rows[1].start..][0..4], 0, .little),
        .duplicate_title => std.mem.writeInt(u32, f.bytes[f.title..][0..4], 0, .little),
        .null_title => std.mem.writeInt(u32, f.bytes[f.title..][0..4], 0xffffffff, .little),
        .title_class => if (known) {
            std.mem.writeInt(u32, f.bytes[f.title + 4 ..][0..4], 51, .little);
        } else {
            f.bytes[f.name_offsets[12]] ^= 1;
        },
        .title_version => if (known) {
            types.definitions.getPtr(279).?.version = 99;
        } else {
            f.bytes[f.versions[12]] ^= 1;
        },
        .series_cap => options.max_series = 2,
        .point_cap => options.series.section.max_points = 3,
        .code_cap => options.series.max_code_bytes = 1,
        .string_cap => options.series.section.text.max_string_bytes = 1,
        .body_total => options.series.section.text.max_total_string_bytes = 3,
        .suffix_total => {
            // Main Label fits (2+2); only suffix TextBlock exceeds (2+3).
            try objects.registerString(.{ .object_id = 1000, .bytes = &.{ 0x80, 0xff, 0 }, .trailer = 173 });
            std.mem.writeInt(u32, f.bytes[f.rows[0].suffix_text..][0..4], 1000, .little);
            options.series.section.text.max_total_string_bytes = 4;
        },
        .object_cap => {},
    }
    var r: Reader = .{ .bytes = f.bytes[0..f.end], .offset = 17 };
    var c = collections.readObserved(a, &r, &types, &objects, &counts, options) catch |err| {
        try t.expectEqual(@as(usize, 17), r.offset);
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(expected, err);
        return;
    };
    c.deinit();
    return error.ExpectedCollectionRejection;
}
test "chart series collection global IDs title types and independent limits" {
    for ([_]bool{ false, true }) |known| {
        for (std.enums.values(Bad)) |bad| try reject(t.allocator, known, bad);
        for ([_]Bad{ .title_version, .body_total, .suffix_total }) |bad| try t.checkAllAllocationFailures(t.allocator, reject, .{ known, bad });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("series collection rejection leak");
        for (std.enums.values(Bad)) |bad| try reject(gpa.allocator(), known, bad);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    }
}

const Direct = enum { series, section, suffix, title };
fn consume(a: std.mem.Allocator, r: *Reader, types: *Types, objects: *Objects, mode: Direct) !void {
    switch (mode) {
        .series => {
            var s = try @import("series.zig").readObservedV2(a, r, types, objects, 1, .{});
            s.deinit();
        },
        .section => {
            var s = try @import("series_label_section.zig").readObserved(a, r, types, objects, 1, .{});
            s.deinit();
        },
        .suffix => _ = try @import("series_suffix.zig").readObserved(r, types, objects, .{}),
        .title => _ = try @import("title_header.zig").readObservedV1(r, types, objects),
    }
}
fn directFailure(a: std.mem.Allocator, known: bool, mode: Direct) !void {
    const f = fixture.make(17, known, &.{1});
    var types = Types.init(a, .{});
    defer types.deinit();
    if (known) try fixture.seedTypes(&types);
    var objects = Objects.init(a, .{});
    defer objects.deinit();
    try fixture.seedObjects(&objects);
    var r: Reader = .{ .bytes = f.bytes[0..f.end], .offset = 17 };
    const end = switch (mode) {
        .series => f.rows[0].end,
        .section, .suffix => blk: {
            _ = try @import("series_prefix.zig").readObservedV2(&r, &types, &objects);
            if (mode == .suffix) try consume(a, &r, &types, &objects, .section);
            break :blk if (mode == .section) f.rows[0].section_end else f.rows[0].suffix_end;
        },
        .title => blk: {
            try consume(a, &r, &types, &objects, .series);
            break :blk f.end;
        },
    };
    const start = r.offset;
    r.bytes = f.bytes[0 .. end - 1];
    consume(a, &r, &types, &objects, mode) catch |err| {
        try t.expectEqual(start, r.offset);
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(error.UnexpectedEnd, err);
        return;
    };
    return error.ExpectedCollectionRejection;
}
test "chart series collection components preserve their own failure cursor" {
    for ([_]bool{ false, true }) |known| for (std.enums.values(Direct)) |mode| {
        try directFailure(t.allocator, known, mode);
        try t.checkAllAllocationFailures(t.allocator, directFailure, .{ known, mode });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("series component leak");
        try directFailure(gpa.allocator(), known, mode);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    };
}
