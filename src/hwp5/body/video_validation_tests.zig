const std = @import("std");
const t = std.testing;
const fixture = @import("../document/test_fixture.zig");
const Tree = @import("tree.zig").Tree;
const v = @import("video_validation.zig");

test "video inspection counts all depths without guessing ownership or references" {
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(t.allocator);
    try fixture.frame(t.allocator, &bytes, 999, 0, &.{});
    try fixture.frame(t.allocator, &bytes, 98, 1, &.{ 0, 0, 0, 0, 0, 0, 255, 255, 7 });
    try fixture.frame(t.allocator, &bytes, 98, 2, &.{ 1, 0, 0, 0, 0, 216, 0, 0 });
    try fixture.frame(t.allocator, &bytes, 98, 0, &.{ 0, 0, 0, 0, 255, 255, 0, 0 });
    var tree = try Tree.parse(t.allocator, bytes.items, .{ .raw = 0x05000107 }, .{});
    defer tree.deinit(t.allocator);
    try t.expectEqualDeep(v.Report{ .records = 3, .unselected = 3, .unselected_bytes = 25, .pending_owners = 3 }, try v.inspect(tree, null));
    try t.expectEqualDeep(v.Report{ .records = 3, .parsed = 3, .local = 2, .web = 1, .pending_owners = 3, .pending_references = 5, .extra_bytes = 1 }, try v.inspect(tree, .specified_remainder));
}

fn documentCheck(a: std.mem.Allocator, malformed: bool) !void {
    const document = @import("../document/validation.zig");
    const header = fixture.header();
    const info = try fixture.docInfo(a, 1);
    defer a.free(info);
    const base = try fixture.section(a);
    defer a.free(base);
    var section: std.ArrayList(u8) = .empty;
    defer section.deinit(a);
    try section.appendSlice(a, base);
    const payload = [_]u8{ 0, 0, 0, 0, 255, 255, 0, 0 };
    try fixture.frame(a, &section, 98, 0, payload[0..if (malformed) 7 else 8]);
    const sections = [_]document.types.Section{.{ .index = 0, .bytes = section.items }};
    const input: document.Input = .{ .header = &header, .doc_info = info, .sections = &sections };
    var options: document.Options = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } };
    var raw = try document.inspectDecoded(a, input, options);
    defer raw.deinit(a);
    try t.expectEqual(@as(usize, 1), raw.sections[0].videos.unselected);
    try t.expectEqual(@as(usize, 0), raw.sections[0].videos.parsed);
    options.video_layout = .specified_remainder;
    const result = document.inspectDecoded(a, input, options);
    if (result) |_| {} else |err| {
        if (err == error.OutOfMemory) return err;
    }
    if (malformed) {
        try t.expectError(error.UnexpectedEnd, result);
    } else {
        var report = try result;
        defer report.deinit(a);
        try t.expectEqualDeep(v.Report{ .records = 1, .parsed = 1, .local = 1, .pending_owners = 1, .pending_references = 2 }, report.sections[0].videos);
        try t.expectEqual(raw.total_records, report.total_records);
        try t.expectEqual(raw.total_bytes, report.total_bytes);
    }
}

test "video selection reaches decoded document and preserves cleanup on failure" {
    for ([_]bool{ false, true }) |malformed| {
        try documentCheck(t.allocator, malformed);
        var debug: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(debug.deinit() == .ok) catch @panic("VideoInspectionLeak");
        try documentCheck(debug.allocator(), malformed);
        try t.expectEqual(@as(usize, 0), debug.total_requested_bytes);
        try t.checkAllAllocationFailures(t.allocator, documentCheck, .{malformed});
    }
}

test "video selected layouts reject truncation unknown kinds and impossible lengths" {
    const local = [_]u8{ 0, 0, 0, 0, 255, 255, 0, 0 };
    const web = [_]u8{ 1, 0, 0, 0, 0, 216, 255, 255 };
    for ([_][]const u8{ &local, &web }) |payload| {
        for (0..payload.len) |cut| {
            var bytes: std.ArrayList(u8) = .empty;
            defer bytes.deinit(t.allocator);
            try fixture.frame(t.allocator, &bytes, 98, 0, payload[0..cut]);
            var tree = try Tree.parse(t.allocator, bytes.items, .{ .raw = 0x05000107 }, .{});
            defer tree.deinit(t.allocator);
            const preserved = try v.inspect(tree, null);
            try t.expectEqual(cut, preserved.unselected_bytes);
            try t.expectError(error.UnexpectedEnd, v.inspect(tree, .{ .explicit_units = 1 }));
        }
    }
    for ([_]i32{ -1, 2, std.math.minInt(i32), std.math.maxInt(i32) }) |kind| {
        var bytes = [_]u8{0} ** 8;
        fixture.put(&bytes, 0, u32, 98 | (4 << 20));
        fixture.put(&bytes, 4, i32, kind);
        var tree = try Tree.parse(t.allocator, &bytes, .{ .raw = 0x05000107 }, .{});
        defer tree.deinit(t.allocator);
        try t.expectEqual(@as(usize, 1), (try v.inspect(tree, null)).unselected);
        try t.expectError(error.UnsupportedVideoType, v.inspect(tree, .specified_remainder));
    }
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(t.allocator);
    try fixture.frame(t.allocator, &bytes, 98, 0, &web);
    var tree = try Tree.parse(t.allocator, bytes.items, .{ .raw = 0x05000107 }, .{});
    defer tree.deinit(t.allocator);
    try t.expectError(error.UnexpectedEnd, v.inspect(tree, .{ .explicit_units = std.math.maxInt(usize) }));
}
