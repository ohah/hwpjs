const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const tails = @import("tail.zig");
const lists = @import("list_header.zig");
const windows = @import("window_type_body.zig");
const collections = @import("collection_header.zig");
const a = std.testing.allocator;
const bytes = "\x00\x00\x00\x00" ++
    "\x11\x00\x00\x00\x07\x00VtList\x00\x01\x00" ++
    "\x2b\x00\x00\x00\x0d\x00VtCollection\x00\x01\x00\x5a\xa5" ++
    "\x45\x00\x00\x00\x09\x00VtObject\x00\x01\x00" ++
    "abcdefghijklmnopqrstuvwxyz" ++
    "\xff\xff\xff\xff\x09\x00VtWindow\x00\x02\x00" ++
    "\x45\x00\x00\x00\xff\xff";
const list_end = 59;
const window_start = list_end + 26;

test "tail known types preserve arbitrary words and do not register opaque identity candidates" {
    const known = "\x00\x00\x00\x00\x11\x00\x00\x00\x2b\x00\x00\x00\x00\x00\x45\x00\x00\x00" ++
        "abcdefghijklmnopqrstuvwxyz" ++
        "\xff\xff\xff\xff\x45\x00\x00\x00\x00\x00";
    for ([_]u16{ 0, 1, 2, 65535 }) |word| {
        var types = Types.init(a, .{});
        defer types.deinit();
        {
            var prior = Objects.init(a, .{});
            defer prior.deinit();
            var reader: Reader = .{ .bytes = bytes };
            _ = try tails.readObservedNoItems(&reader, &types, &prior);
        }
        var input = known.*;
        std.mem.writeInt(u16, input[12..14], word, .little);
        std.mem.writeInt(u16, input[input.len - 2 ..][0..2], word, .little);
        var objects = Objects.init(a, .{});
        defer objects.deinit();
        var reader: Reader = .{ .bytes = &input };
        const result = try tails.readObservedNoItems(&reader, &types, &objects);
        try std.testing.expectEqual(known.len, result.end);
        try std.testing.expectEqual(word, result.list.collection.raw_word);
        try std.testing.expectEqual(word, result.window.raw_word);
        try std.testing.expectEqual(@as(u32, 1), objects.entries.count());
        try std.testing.expectEqual(@as(u32, 4), types.definitions.count());
        types.definitions.getPtr(0xffffffff).?.version = 1;
        var other = Objects.init(a, .{});
        defer other.deinit();
        reader.offset = 0;
        try std.testing.expectError(error.UnsupportedChartTypeVersion, tails.readObservedNoItems(&reader, &types, &other));
        try std.testing.expectEqual(@as(usize, 0), reader.offset);
    }
}

test "tail rejects each declaration class version null duplicate and limits" {
    for ([_]usize{ 10, 25, 48, window_start + 6 }) |at| {
        var bad = bytes.*;
        bad[at] ^= 1;
        try rejected(&bad, error.UnsupportedChartClass, false, .{}, .{});
    }
    for ([_]usize{ 17, 38, 57, window_start + 15 }) |at| {
        var bad = bytes.*;
        bad[at] ^= 1;
        try rejected(&bad, error.UnsupportedChartTypeVersion, false, .{}, .{});
    }
    var bad = bytes.*;
    @memset(bad[0..4], 255);
    try rejected(&bad, error.UnsupportedChartObjectReference, false, .{}, .{});
    try rejected(bytes, error.DuplicateChartObjectId, true, .{}, .{});
    try rejected(bytes, error.LimitExceeded, false, .{}, .{ .max_objects = 0 });
    try rejected(bytes, error.LimitExceeded, false, .{ .max_types = 3 }, .{});
    try rejected(bytes, error.LimitExceeded, false, .{ .max_name_bytes = 12 }, .{});
}

fn rejected(input: []const u8, expected: anyerror, duplicate: bool, type_options: @import("type_table.zig").Options, object_options: @import("object_table.zig").Options) !void {
    var gpa: std.heap.DebugAllocator(.{ .safety = true }) = .init;
    {
        var types = Types.init(gpa.allocator(), type_options);
        defer types.deinit();
        var objects = Objects.init(gpa.allocator(), object_options);
        defer objects.deinit();
        if (duplicate) try objects.registerOther(0);
        var reader: Reader = .{ .bytes = input };
        try std.testing.expectError(expected, tails.readObservedNoItems(&reader, &types, &objects));
        try std.testing.expectEqual(@as(usize, 0), reader.offset);
    }
    try std.testing.expectEqual(.ok, gpa.deinit());
}

fn parse(allocator: std.mem.Allocator) !void {
    var types = Types.init(allocator, .{});
    defer types.deinit();
    var objects = Objects.init(allocator, .{});
    defer objects.deinit();
    var reader: Reader = .{ .bytes = bytes };
    const result = try tails.readObservedNoItems(&reader, &types, &objects);
    try std.testing.expectEqual(bytes.len, result.end);
    try std.testing.expectEqual(list_end, result.list.end);
    try std.testing.expectEqual(@as(u16, 0xa55a), result.list.collection.raw_word);
    try std.testing.expectEqual(@as(u16, 65535), result.window.raw_word);
    try std.testing.expectEqualSlices(u8, "abcdefghijklmnopqrstuvwxyz", &result.raw);
    try std.testing.expectEqual(@as(u32, 1), objects.entries.count());
    try std.testing.expect(objects.entries.contains(0));
    try std.testing.expectEqual(@as(u32, 4), types.definitions.count());
}

test "selected tail preserves words raw bytes identity zero and full-width type ID" {
    try parse(a);
    try std.testing.checkAllAllocationFailures(a, parse, .{});
}

test "tail all cuts at varied offsets preserve reader and clean failure allocations" {
    for ([_]usize{ 0, 1, 17, 257 }) |offset| {
        var input: [512]u8 = @splat(255);
        @memcpy(input[offset..][0..bytes.len], bytes);
        for (0..bytes.len) |cut| {
            var gpa: std.heap.DebugAllocator(.{ .safety = true }) = .init;
            {
                var types = Types.init(gpa.allocator(), .{});
                defer types.deinit();
                var objects = Objects.init(gpa.allocator(), .{});
                defer objects.deinit();
                var reader: Reader = .{ .bytes = input[0 .. offset + cut], .offset = offset };
                try std.testing.expectError(error.UnexpectedEnd, tails.readObservedNoItems(&reader, &types, &objects));
                try std.testing.expectEqual(offset, reader.offset);
            }
            try std.testing.expectEqual(.ok, gpa.deinit());
        }
        var types = Types.init(a, .{});
        defer types.deinit();
        var objects = Objects.init(a, .{});
        defer objects.deinit();
        var reader: Reader = .{ .bytes = &input, .offset = offset };
        const result = try tails.readObservedNoItems(&reader, &types, &objects);
        try std.testing.expectEqual(offset + bytes.len, reader.offset);
        @memset(&input, 0);
        try std.testing.expectEqualSlices(u8, "abcdefghijklmnopqrstuvwxyz", &result.raw);
    }
}

test "standalone List Collection Window have their own transactional reader boundaries" {
    for (0..bytes.len) |cut| {
        var types = Types.init(a, .{});
        defer types.deinit();
        var objects = Objects.init(a, .{});
        defer objects.deinit();
        var reader: Reader = .{ .bytes = bytes[0..cut] };
        if (cut < list_end) {
            try std.testing.expectError(error.UnexpectedEnd, lists.readObservedV1(&reader, &types, &objects));
            try std.testing.expectEqual(@as(usize, 0), reader.offset);
        } else {
            _ = try lists.readObservedV1(&reader, &types, &objects);
            if (cut >= window_start) {
                reader.offset = window_start;
                try std.testing.expectError(error.UnexpectedEnd, windows.readObservedV2(&reader, &types));
                try std.testing.expectEqual(window_start, reader.offset);
            }
        }
    }
    for (19..list_end) |cut| {
        var types = Types.init(a, .{});
        defer types.deinit();
        var reader: Reader = .{ .bytes = bytes[0..cut], .offset = 19 };
        try std.testing.expectError(error.UnexpectedEnd, collections.readObservedV1(&reader, &types));
        try std.testing.expectEqual(@as(usize, 19), reader.offset);
    }
}
