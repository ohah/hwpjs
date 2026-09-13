const std = @import("std");
const t = std.testing;
const cfb = @import("reader.zig");
const replace = @import("stream_replace.zig");

fn make(a: std.mem.Allocator, version: u16) ![]u8 {
    return cfb.writer.write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "Folder", .kind = 1, .parent = 0, .state = 41, .created = 42, .modified = 43 },
        .{ .name = "First", .parent = 1, .content = "old-first" },
        .{ .name = "Second", .parent = 1, .content = "old-second" },
        .{ .name = "Keep", .parent = 0, .content = "preserved" },
    }, .{ .version = version });
}

fn exercise(a: std.mem.Allocator, version: u16) !void {
    const input = try make(a, version);
    defer a.free(input);
    var file = try cfb.File.open(a, input, .{ .strict = true });
    defer file.deinit();
    const output = try replace.rebuildManyExact(a, &file, &.{
        .{ .path = "/Folder/Second", .content = "new-second" },
        .{ .path = "/Folder/First", .content = "new-first" },
    }, .{ .max_output_bytes = 64 * 1024 });
    defer a.free(output);
    var reopened = try cfb.File.open(a, output, .{ .strict = true });
    defer reopened.deinit();
    try t.expectEqual(version, reopened.header.major);
    try t.expectEqualStrings("new-first", reopened.entries[(try reopened.findExact("/Folder/First")).?].content);
    try t.expectEqualStrings("new-second", reopened.entries[(try reopened.findExact("/Folder/Second")).?].content);
    try t.expectEqualStrings("preserved", reopened.entries[(try reopened.findExact("/Keep")).?].content);
    const folder = reopened.entries[(try reopened.findExact("/Folder")).?];
    try t.expectEqual(@as(u32, 41), folder.state);
    try t.expectEqual(@as(u64, 42), folder.created);
    try t.expectEqual(@as(u64, 43), folder.modified);
}

test "CFB exact batch replacement writes both versions once and preserves siblings" {
    for ([_]u16{ 3, 4 }) |version| {
        try exercise(t.allocator, version);
        try t.checkAllAllocationFailures(t.allocator, exercise, .{version});
    }
}

test "CFB exact batch replacement validates the complete set atomically" {
    const input = try make(t.allocator, 3);
    defer t.allocator.free(input);
    var file = try cfb.File.open(t.allocator, input, .{ .strict = true });
    defer file.deinit();
    try t.expectError(error.EmptyReplacementSet, replace.rebuildManyExact(t.allocator, &file, &.{}, .{}));
    try t.expectError(error.StreamNotFound, replace.rebuildManyExact(t.allocator, &file, &.{ .{ .path = "/Folder/First", .content = "changed" }, .{ .path = "/Missing", .content = "x" } }, .{}));
    try t.expectError(error.NotAStream, replace.rebuildManyExact(t.allocator, &file, &.{.{ .path = "/Folder", .content = "x" }}, .{}));
    try t.expectError(error.DuplicateStreamReplacement, replace.rebuildManyExact(t.allocator, &file, &.{ .{ .path = "/Folder/First", .content = "a" }, .{ .path = "/Folder/First", .content = "b" } }, .{}));
    try t.expectError(error.DuplicateStreamReplacement, replace.rebuildManyExact(t.allocator, &file, &.{ .{ .path = "/Folder/First", .content = "a" }, .{ .path = "/folder/first", .content = "b" } }, .{}));
    try t.expectError(error.LimitExceeded, replace.rebuildManyExact(t.allocator, &file, &.{.{ .path = "/Folder/First", .content = "x" }}, .{ .max_output_bytes = input.len - 1 }));
    try t.expectEqualStrings("old-first", file.entries[(try file.findExact("/Folder/First")).?].content);
    try t.expectEqualStrings("old-second", file.entries[(try file.findExact("/Folder/Second")).?].content);
}

test "CFB exact batch replacement uses compact nodes after inactive entries" {
    const input = try make(t.allocator, 4);
    defer t.allocator.free(input);
    var file = try cfb.File.open(t.allocator, input, .{ .strict = true });
    defer file.deinit();
    const first = (try file.findExact("/Folder/First")).?;
    file.entries[first].kind = 0;
    const output = try replace.rebuildManyExact(t.allocator, &file, &.{.{ .path = "/Folder/Second", .content = "compact-second" }}, .{});
    defer t.allocator.free(output);
    var reopened = try cfb.File.open(t.allocator, output, .{ .strict = true });
    defer reopened.deinit();
    try t.expectEqualStrings("compact-second", reopened.entries[(try reopened.findExact("/Folder/Second")).?].content);
    try t.expectEqual(null, try reopened.findExact("/Folder/First"));
    try t.expectEqualStrings("preserved", reopened.entries[(try reopened.findExact("/Keep")).?].content);
}
