const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const axes = @import("axis.zig");
const texts = @import("text_block.zig");
const fixture = @import("axis_test_fixture.zig");
const Kind = fixture.TitleKind;
fn seed(types: *Types, f: *const fixture.Fixture, start: usize) !void {
    for (f.names[0..f.count]) |name| {
        if (name >= start) break;
        var reader: Reader = .{ .bytes = f.bytes[0..start], .offset = name - 6 };
        _ = try types.readObserved16(&reader);
    }
}
fn exercise(a: std.mem.Allocator, kind: Kind, scale: bool, start: usize, inline_only: bool) !void {
    const f = fixture.makeTitle(scale, true, start, kind);
    const begin = if (inline_only) f.title_start else start;
    const end = if (inline_only) f.title_end else f.end;
    const stored = if (inline_only) @as(usize, 2) + (if (kind == .fresh) @as(usize, 3) else 0) else f.stored;
    const count = if (inline_only) @as(u32, 3) + @intFromBool(kind == .fresh or kind == .empty) else f.objects;
    const total = if (inline_only) @as(usize, 2) + (switch (kind) {
        .alias => @as(usize, 2),
        .fresh => 3,
        else => 0,
    }) else f.total;
    var types = Types.init(a, .{});
    defer types.deinit();
    try seed(&types, &f, begin);
    var objects = Objects.init(a, .{ .max_objects = count, .max_total_string_bytes = stored });
    defer objects.deinit();
    var reader: Reader = .{ .bytes = f.bytes[0 .. end + 1], .offset = begin };
    const title: texts.NullableBlock = if (inline_only) texts.readNullableObservedWithObjects(&reader, &types, &objects, .{ .max_string_bytes = 3, .max_total_string_bytes = total }) catch |err| {
        try t.expectEqual(begin, reader.offset);
        return err;
    } else (axes.readNullableTitleObservedV3(&reader, &types, &objects, .{ .max_string_bytes = 3, .max_total_string_bytes = total }) catch |err| {
        try t.expectEqual(begin, reader.offset);
        return err;
    }).title;
    try t.expectEqual(end, reader.offset);
    try t.expectEqual(f.title_end, title.end);
    try t.expectEqual(@as(u32, 1001), title.object_id);
    try t.expectEqual(kind != .absent, title.text != null);
    try t.expectEqual(kind == .fresh or kind == .empty, title.text_introduced);
    if (title.text) |s| {
        try t.expectEqual(if (kind == .alias) @as(u32, 1003) else 1007, s.object_id);
        try t.expectEqual(if (kind == .alias) @as(usize, 2) else if (kind == .fresh) @as(usize, 3) else 0, s.bytes.len);
        if (kind == .alias) try t.expect(s.bytes.ptr == title.font.name.bytes.ptr);
    }
    try t.expectEqual(stored, objects.string_bytes);
    try t.expectEqual(count, objects.entries.count());
}
fn reject(a: std.mem.Allocator, kind: Kind, cut: usize, total: usize, required: bool, inline_only: bool, null_name: bool, expected: anyerror) !void {
    var f = fixture.makeTitle(true, true, 1, kind);
    if (null_name) std.mem.writeInt(u32, f.bytes[f.name_start..][0..4], 0xffffffff, .little);
    const begin = if (inline_only) f.title_start else 1;
    var types = Types.init(a, .{});
    defer types.deinit();
    try seed(&types, &f, begin);
    var objects = Objects.init(a, .{});
    defer objects.deinit();
    var reader: Reader = .{ .bytes = f.bytes[0..cut], .offset = begin };
    if (inline_only) {
        if (required) {
            _ = texts.readObservedWithObjects(&reader, &types, &objects, .{ .max_string_bytes = 3, .max_total_string_bytes = total }) catch |err| {
                try check(err, expected, begin, reader.offset);
                return;
            };
        } else {
            _ = texts.readNullableObservedWithObjects(&reader, &types, &objects, .{ .max_string_bytes = 3, .max_total_string_bytes = total }) catch |err| {
                try check(err, expected, begin, reader.offset);
                return;
            };
        }
    } else {
        if (required) {
            _ = axes.readObservedV3(&reader, &types, &objects, .{ .max_string_bytes = 3, .max_total_string_bytes = total }) catch |err| {
                try check(err, expected, begin, reader.offset);
                return;
            };
        } else {
            _ = axes.readNullableTitleObservedV3(&reader, &types, &objects, .{ .max_string_bytes = 3, .max_total_string_bytes = total }) catch |err| {
                try check(err, expected, begin, reader.offset);
                return;
            };
        }
    }
    return error.ExpectedNullableTitleRejection;
}
fn check(actual: anyerror, expected: anyerror, start: usize, end: usize) !void {
    try t.expectEqual(start, end);
    if (actual == error.OutOfMemory) return actual;
    try t.expectEqual(expected, actual);
}
test "chart nullable title inline and axis null empty new alias budgets and OOM" {
    for (std.enums.values(Kind)) |kind| for ([_]bool{ false, true }) |scale| for ([_]bool{ false, true }) |inline_only| {
        for ([_]usize{ 0, 1, 17, 257 }) |start| try exercise(t.allocator, kind, scale, start, inline_only);
        try t.checkAllAllocationFailures(t.allocator, exercise, .{ kind, scale, @as(usize, 1), inline_only });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("nullable title leak");
        try exercise(gpa.allocator(), kind, scale, 1, inline_only);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    };
}
test "chart nullable title cuts required-path rejection alias caps and late cleanup" {
    for (std.enums.values(Kind)) |kind| for ([_]bool{ false, true }) |inline_only| {
        const f = fixture.makeTitle(true, true, 1, kind);
        const begin = if (inline_only) f.title_start else 1;
        const end = if (inline_only) f.title_end else f.end;
        const total = if (inline_only) @as(usize, 2) + (switch (kind) {
            .alias => @as(usize, 2),
            .fresh => 3,
            else => 0,
        }) else f.total;
        for (begin..end) |cut| try reject(t.allocator, kind, cut, total, false, inline_only, false, error.UnexpectedEnd);
        try reject(t.allocator, kind, end, total - 1, false, inline_only, false, error.LimitExceeded);
        try reject(t.allocator, kind, end, total, false, inline_only, true, error.UnsupportedChartObjectReference);
        if (kind == .absent) try reject(t.allocator, kind, end, total, true, inline_only, false, error.UnsupportedChartObjectReference);
        try t.checkAllAllocationFailures(t.allocator, reject, .{ kind, end - 1, total, false, inline_only, false, error.UnexpectedEnd });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("nullable title late leak");
        try reject(gpa.allocator(), kind, end - 1, total, false, inline_only, false, error.UnexpectedEnd);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    };
}
