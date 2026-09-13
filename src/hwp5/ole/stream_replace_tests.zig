const std = @import("std");
const t = std.testing;
const replace = @import("stream_replace.zig");
const envelope = @import("envelope.zig");
const cfb = @import("../../cfb/reader.zig");
const writer = @import("../../cfb/writer.zig");

fn exercise(a: std.mem.Allocator, version: u16, layout: envelope.Layout) !void {
    const original = try writer.write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "Chart", .kind = 1, .parent = 0, .state = 17, .created = 77, .modified = 99 },
        .{ .name = "Contents", .parent = 1, .content = "old" },
        .{ .name = "Unknown", .parent = 1, .content = "preserve" },
    }, .{ .version = version });
    defer a.free(original);
    const input = if (layout == .raw_cfb) original else blk: {
        const wrapped = try a.alloc(u8, original.len + 4);
        std.mem.writeInt(u32, wrapped[0..4], @intCast(original.len), .little);
        @memcpy(wrapped[4..], original);
        break :blk wrapped;
    };
    defer if (layout == .observed_size_prefix) a.free(input);
    const replacement = [_]u8{0xa5} ** 4097;
    const out = try replace.replaceExact(a, input, layout, "/chart/contents", &replacement, .{ .max_output_bytes = 64 * 1024 });
    defer a.free(out);
    if (layout == .observed_size_prefix) try t.expectEqual(@as(u32, @intCast(out.len - 4)), std.mem.readInt(u32, out[0..4], .little));
    const raw = if (layout == .raw_cfb) out else out[4..];
    var file = try cfb.File.open(a, raw, .{ .strict = true });
    defer file.deinit();
    try t.expectEqual(version, file.header.major);
    try t.expectEqualSlices(u8, &replacement, file.entries[(try file.findExact("/Chart/Contents")).?].content);
    const unknown = file.entries[(try file.findExact("/Chart/Unknown")).?];
    try t.expectEqualStrings("preserve", unknown.content);
    const storage = file.entries[(try file.findExact("/Chart")).?];
    try t.expectEqual(@as(u32, 17), storage.state);
    try t.expectEqual(@as(u64, 77), storage.created);
    try t.expectEqual(@as(u64, 99), storage.modified);
}

fn exerciseMany(a: std.mem.Allocator, version: u16, layout: envelope.Layout) !void {
    const original = try writer.write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "Chart", .kind = 1, .parent = 0 },
        .{ .name = "Contents", .parent = 1, .content = "old-contents" },
        .{ .name = "Metadata", .parent = 1, .content = "old-metadata" },
        .{ .name = "Keep", .parent = 0, .content = "preserved" },
    }, .{ .version = version });
    defer a.free(original);
    const input = if (layout == .raw_cfb) original else blk: {
        const wrapped = try a.alloc(u8, original.len + 4);
        std.mem.writeInt(u32, wrapped[0..4], @intCast(original.len), .little);
        @memcpy(wrapped[4..], original);
        break :blk wrapped;
    };
    defer if (layout == .observed_size_prefix) a.free(input);
    const output = try replace.replaceManyExact(a, input, layout, &.{
        .{ .path = "/Chart/Metadata", .content = "new-metadata" },
        .{ .path = "/Chart/Contents", .content = "new-contents" },
    }, .{ .max_output_bytes = 64 * 1024 });
    defer a.free(output);
    if (layout == .observed_size_prefix) try t.expectEqual(@as(u32, @intCast(output.len - 4)), std.mem.readInt(u32, output[0..4], .little));
    const raw = if (layout == .raw_cfb) output else output[4..];
    var file = try cfb.File.open(a, raw, .{ .strict = true });
    defer file.deinit();
    try t.expectEqual(version, file.header.major);
    try t.expectEqualStrings("new-contents", file.entries[(try file.findExact("/Chart/Contents")).?].content);
    try t.expectEqualStrings("new-metadata", file.entries[(try file.findExact("/Chart/Metadata")).?].content);
    try t.expectEqualStrings("preserved", file.entries[(try file.findExact("/Keep")).?].content);
}

test "OLE stream replacement preserves envelope version siblings and metadata" {
    for ([_]u16{ 3, 4 }) |version| for ([_]envelope.Layout{ .raw_cfb, .observed_size_prefix }) |layout| {
        try exercise(t.allocator, version, layout);
        try t.checkAllAllocationFailures(t.allocator, exercise, .{ version, layout });
    };
}

test "OLE stream replacement rejects selection and output boundaries atomically" {
    var input = try writer.write(t.allocator, &.{ .{ .name = "Root Entry", .kind = 5 }, .{ .name = "Folder", .kind = 1, .parent = 0 }, .{ .name = "Contents", .parent = 1, .content = "old" } }, .{});
    defer t.allocator.free(input);
    var file = try cfb.File.open(t.allocator, input, .{ .strict = true });
    defer file.deinit();
    const entry_index = (try file.findExact("/Folder/Contents")).?;
    try t.expectEqual(@as(usize, 2), try file.nodeIndex(entry_index));
    file.entries[1].kind = 0;
    try t.expectEqual(@as(usize, 1), try file.nodeIndex(entry_index));
    try t.expectError(error.InvalidDirectoryReference, file.nodeIndex(1));
    try t.expectError(error.InvalidDirectoryReference, file.nodeIndex(file.entries.len));
    try t.expectError(error.StreamNotFound, replace.replaceExact(t.allocator, input, .raw_cfb, "/Missing", "x", .{}));
    try t.expectError(error.NotAStream, replace.replaceExact(t.allocator, input, .raw_cfb, "/Folder", "x", .{}));
    try t.expectError(error.LimitExceeded, replace.replaceExact(t.allocator, input, .raw_cfb, "/Folder/Contents", "x", .{ .max_output_bytes = input.len - 1 }));
    try t.expectError(error.LimitExceeded, replace.replaceExact(t.allocator, input, .raw_cfb, "/Folder/Contents", "xx", .{ .limits = .{ .max_stream_bytes = 1 } }));
    input[8] = 1;
    try t.expectError(error.InvalidHeader, replace.replaceExact(t.allocator, input, .raw_cfb, "/Folder/Contents", "x", .{}));
}

test "OLE batch replacement preserves envelope and replaces every inner stream once" {
    for ([_]u16{ 3, 4 }) |version| for ([_]envelope.Layout{ .raw_cfb, .observed_size_prefix }) |layout| {
        try exerciseMany(t.allocator, version, layout);
        try t.checkAllAllocationFailures(t.allocator, exerciseMany, .{ version, layout });
    };
}

test "OLE batch replacement rejects the complete command set before output" {
    const input = try writer.write(t.allocator, &.{ .{ .name = "Root Entry", .kind = 5 }, .{ .name = "Folder", .kind = 1, .parent = 0 }, .{ .name = "First", .parent = 1, .content = "old-first" }, .{ .name = "Second", .parent = 1, .content = "old-second" } }, .{});
    defer t.allocator.free(input);
    try t.expectError(error.EmptyReplacementSet, replace.replaceManyExact(t.allocator, input, .raw_cfb, &.{}, .{}));
    try t.expectError(error.StreamNotFound, replace.replaceManyExact(t.allocator, input, .raw_cfb, &.{ .{ .path = "/Folder/First", .content = "new" }, .{ .path = "/Missing", .content = "x" } }, .{}));
    try t.expectError(error.DuplicateStreamReplacement, replace.replaceManyExact(t.allocator, input, .raw_cfb, &.{ .{ .path = "/Folder/First", .content = "a" }, .{ .path = "/folder/first", .content = "b" } }, .{}));
    try t.expectError(error.NotAStream, replace.replaceManyExact(t.allocator, input, .raw_cfb, &.{.{ .path = "/Folder", .content = "x" }}, .{}));
    try t.expectError(error.LimitExceeded, replace.replaceManyExact(t.allocator, input, .raw_cfb, &.{.{ .path = "/Folder/First", .content = "x" }}, .{ .max_output_bytes = input.len - 1 }));
    var file = try cfb.File.open(t.allocator, input, .{ .strict = true });
    defer file.deinit();
    try t.expectEqualStrings("old-first", file.entries[(try file.findExact("/Folder/First")).?].content);
    try t.expectEqualStrings("old-second", file.entries[(try file.findExact("/Folder/Second")).?].content);
}
