const std = @import("std");
const t = std.testing;
const preview = @import("preview_image.zig");
const cfb = @import("../../cfb/reader.zig");
const writer = @import("../../cfb/writer.zig");
const fixture = @import("../document/test_fixture.zig");
const options: preview.Options = .{ .images = .{ .gif = .{} }, .empty = .preserve, .unhandled = .preserve };

fn make(a: std.mem.Allocator, raw: []const u8, name: []const u8, parent: u32, kind: u8, compressed: bool) ![]u8 {
    var header = fixture.header();
    header[36] = @intFromBool(compressed);
    const doc = try fixture.docInfo(a, 0);
    defer a.free(doc);
    const stored = try a.alloc(u8, 5 + doc.len);
    defer a.free(stored);
    stored[0] = 1; // One final raw-DEFLATE stored block for the small DocInfo fixture.
    const len: u16 = @intCast(doc.len);
    fixture.put(stored, 1, u16, len);
    fixture.put(stored, 3, u16, ~len);
    @memcpy(stored[5..], doc);
    return writer.write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = &header },
        .{ .name = "DocInfo", .parent = 0, .content = if (compressed) stored else doc },
        .{ .name = "BodyText", .parent = 0, .kind = 1 },
        .{ .name = "Nested", .parent = 0, .kind = 1 },
        .{ .name = name, .parent = parent, .kind = kind, .content = raw },
    }, .{});
}
test "PrvImage root lookup follows CFB name comparison without nested fallback" {
    for (0..4) |which| {
        const raw = try make(t.allocator, "", if (which == 2) "prvimage" else "PrvImage", if (which == 1) 4 else 0, if (which == 3) 1 else 2, false);
        defer t.allocator.free(raw);
        var file = try cfb.File.open(t.allocator, raw, .{ .strict = true });
        defer file.deinit();
        const used = try t.allocator.alloc(bool, file.entries.len);
        defer t.allocator.free(used);
        @memset(used, false);
        var remaining: usize = 100;
        if (which == 3) {
            try t.expectError(error.InvalidHwpEntryKind, preview.inspect(t.allocator, &file, used, &remaining, options));
        } else {
            const result = try preview.inspect(t.allocator, &file, used, &remaining, options);
            try t.expectEqual(if (which != 1) preview.State.empty else preview.State.absent, result.state);
            try t.expectEqual(@as(usize, @intFromBool(which != 1)), std.mem.count(bool, used, &.{true}));
        }
        try t.expectEqual(@as(usize, 100), remaining);
    }
}
test "PrvImage rejecting empty or unhandled bytes leaves consumption unchanged" {
    for ([_][]const u8{ "", "unknown" }) |payload| {
        const raw = try make(t.allocator, payload, "PrvImage", 0, 2, false);
        defer t.allocator.free(raw);
        var file = try cfb.File.open(t.allocator, raw, .{ .strict = true });
        defer file.deinit();
        const used = try t.allocator.alloc(bool, file.entries.len);
        defer t.allocator.free(used);
        @memset(used, false);
        var remaining: usize = 100;
        var selected = options;
        selected.empty = .reject;
        selected.unhandled = .reject;
        try t.expectError(if (payload.len == 0) error.EmptyPreviewImage else error.UnsupportedPreviewImage, preview.inspect(t.allocator, &file, used, &remaining, selected));
        try t.expectEqual(@as(usize, 100), remaining);
        try t.expectEqual(@as(usize, 0), std.mem.count(bool, used, &.{true}));
        const result = try preview.inspect(t.allocator, &file, used, &remaining, options);
        try t.expectEqual(if (payload.len == 0) preview.State.empty else preview.State.unhandled, result.state);
        try t.expectEqual(100 - payload.len, remaining);
        try t.expectEqual(@as(usize, 1), std.mem.count(bool, used, &.{true}));
    }
}
fn document(a: std.mem.Allocator) !void {
    const gif = try @import("../../image/gif/fixtures.zig").literals(a, 1, 1, false);
    defer a.free(gif);
    for ([_]bool{ false, true }) |compressed| {
        var report = blk: {
            const raw = try make(a, gif, "PrvImage", 0, 2, compressed);
            defer a.free(raw);
            break :blk try @import("validation.zig").inspect(a, raw, .{ .preview_image = options, .document = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } } });
        };
        defer report.deinit(a);
        try t.expect(report.preview_image != null);
        try t.expectEqual(preview.State.inspected, report.preview_image.?.state);
        try t.expectEqual(@as(usize, 1), report.preview_image.?.images.gif.index_bytes);
        try t.expectEqual(@as(usize, 0), report.uninspected_streams);
        try t.expectEqual(256 + 95 + gif.len, report.total_decoded_bytes);
    }
}
test "PrvImage raw GIF survives compressed document flag and detached report ownership" {
    try document(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, document, .{});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try document(checked.allocator());
    try t.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}
test "PrvImage stream and remaining caps plus corrupt codec input are atomic" {
    const gif = try @import("../../image/gif/fixtures.zig").literals(t.allocator, 1, 1, false);
    defer t.allocator.free(gif);
    const raw = try make(t.allocator, gif, "PrvImage", 0, 2, false);
    defer t.allocator.free(raw);
    var file = try cfb.File.open(t.allocator, raw, .{ .strict = true });
    defer file.deinit();
    const used = try t.allocator.alloc(bool, file.entries.len);
    defer t.allocator.free(used);
    for (0..3) |which| {
        @memset(used, false);
        var remaining = if (which == 1) gif.len - 1 else gif.len;
        const before = remaining;
        var selected = options;
        if (which == 0) selected.max_bytes = gif.len - 1;
        if (which == 2) selected.images.gif.?.max_total_codes = 2;
        try t.expectError(error.LimitExceeded, preview.inspect(t.allocator, &file, used, &remaining, selected));
        try t.expectEqual(before, remaining);
        try t.expectEqual(@as(usize, 0), std.mem.count(bool, used, &.{true}));
    }
    const index = (try file.findExact("/PrvImage")).?;
    const saved = file.entries[index].content;
    file.entries[index].content = "GIF88a";
    var remaining = gif.len;
    try t.expectError(error.UnsupportedGifVersion, preview.inspect(t.allocator, &file, used, &remaining, options));
    try t.expectEqual(gif.len, remaining);
    try t.expectEqual(@as(usize, 0), std.mem.count(bool, used, &.{true}));
    file.entries[index].content = saved;
    _ = try preview.inspect(t.allocator, &file, used, &remaining, options);
    try t.expectEqual(@as(usize, 0), remaining);
}
