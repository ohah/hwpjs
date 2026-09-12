const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const blocks = @import("value_block.zig");
const fixture = @import("value_block_test_fixture.zig");
const Kind = fixture.Kind;
fn seed(objects: *Objects, kind: Kind) !void {
    if (kind == .alias) try objects.registerString(.{ .object_id = 10, .bytes = &.{ 0xff, 0x80 }, .trailer = 173 });
    if (kind == .number_alias) try objects.registerNumber(.{ .object_id = 10, .bits = 0x7ff8000000001234, .trailer = 0xaa55 });
}
fn exercise(a: std.mem.Allocator, kind: Kind, with_format: bool, start: usize) !void {
    const f = fixture.make(kind, with_format, start);
    var types = Types.init(a, .{});
    defer types.deinit();
    var objects = Objects.init(a, .{ .max_objects = f.objects, .max_total_string_bytes = f.stored });
    defer objects.deinit();
    try seed(&objects, kind);
    var reader: Reader = .{ .bytes = f.bytes[0 .. f.end + 1], .offset = start };
    const b = blocks.readObservedV1(&reader, &types, &objects, .{ .max_string_bytes = 2, .max_total_string_bytes = f.total }) catch |err| {
        try t.expectEqual(start, reader.offset);
        return err;
    };
    try t.expectEqual(@as(u32, 65536), b.header_word);
    try t.expect(!objects.entries.contains(65536));
    try t.expectEqual(f.end, b.end);
    try t.expectEqual(f.end, reader.offset);
    try t.expectEqual(@as(u16, 0x4567), b.raw_before_label);
    try t.expectEqualSlices(u8, &.{ 0x81, 0x23, 0x45 }, &b.raw_suffix);
    try t.expectEqual(with_format, b.format != null);
    if (b.format) |v| {
        try t.expectEqual(@as(u16, 0x1234), v.raw_word);
        try t.expectEqual(kind != .string and kind != .alias, v.code_introduced);
    }
    switch (kind) {
        .absent => try t.expect(b.reference == null),
        .number, .number_alias => {
            try t.expectEqual(@as(u64, 0x7ff8000000001234), b.reference.?.value.number.bits);
            try t.expectEqual(@as(u16, 0xaa55), b.reference.?.value.number.trailer);
            try t.expectEqual(kind == .number, b.reference.?.introduced);
        },
        .string, .alias => {
            try t.expectEqualSlices(u8, &.{ 0xff, 0x80 }, b.reference.?.value.string.bytes);
            try t.expectEqual(kind == .string, b.reference.?.introduced);
        },
    }
    try t.expectEqualSlices(u8, &.{ 0xff, 0x80 }, b.label.value.bytes);
    try t.expect(b.text.font.name.bytes.ptr == b.label.value.bytes.ptr);
    try t.expect(!b.text.font.name_introduced);
    try t.expectEqual(kind != .absent, b.text.text != null);
    if (b.text.text) |s| try t.expect(s.bytes.ptr == b.label.value.bytes.ptr);
    try t.expectEqual(f.stored, objects.string_bytes);
    try t.expectEqual(f.objects, objects.entries.count());
}
fn reject(a: std.mem.Allocator, kind: Kind, bytes: []const u8, total: usize, expected: anyerror) !void {
    var types = Types.init(a, .{});
    defer types.deinit();
    var objects = Objects.init(a, .{});
    defer objects.deinit();
    try seed(&objects, kind);
    var reader: Reader = .{ .bytes = bytes, .offset = 1 };
    _ = blocks.readObservedV1(&reader, &types, &objects, .{ .max_string_bytes = 2, .max_total_string_bytes = total }) catch |err| {
        try t.expectEqual(@as(usize, 1), reader.offset);
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(expected, err);
        return;
    };
    return error.ExpectedValueBlockRejection;
}
test "chart value block composition aliases totals raw fields and OOM" {
    for (std.enums.values(Kind)) |kind| for ([_]bool{ false, true }) |with_format| {
        for ([_]usize{ 0, 1, 17, 257 }) |start| try exercise(t.allocator, kind, with_format, start);
        try t.checkAllAllocationFailures(t.allocator, exercise, .{ kind, with_format, @as(usize, 1) });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("value block leak");
        try exercise(gpa.allocator(), kind, with_format, 1);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    };
}
test "chart value block cuts classes versions total alias cap and late cleanup" {
    for (std.enums.values(Kind)) |kind| for ([_]bool{ false, true }) |with_format| {
        const f = fixture.make(kind, with_format, 1);
        for (1..f.end) |cut| try reject(t.allocator, kind, f.bytes[0..cut], f.total, error.UnexpectedEnd);
        try reject(t.allocator, kind, f.bytes[0..f.end], f.total - 1, error.LimitExceeded);
        for (f.names[0..f.declarations], f.versions[0..f.declarations]) |name, version| {
            var bad = f;
            bad.bytes[name] ^= 1;
            try reject(t.allocator, kind, bad.bytes[0..bad.end], f.total, error.UnsupportedChartClass);
            bad = f;
            bad.bytes[version] ^= 1;
            try reject(t.allocator, kind, bad.bytes[0..bad.end], f.total, error.UnsupportedChartTypeVersion);
        }
        const late = f.bytes[0 .. f.end - 1];
        try t.checkAllAllocationFailures(t.allocator, reject, .{ kind, late, f.total, error.UnexpectedEnd });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("value block late leak");
        try reject(gpa.allocator(), kind, late, f.total, error.UnexpectedEnd);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    };
}
