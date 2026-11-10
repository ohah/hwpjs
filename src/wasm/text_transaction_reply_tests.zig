const std = @import("std");
const reply = @import("text_transaction_reply.zig");
const a = std.testing.allocator;
const Row = struct { owner: struct { section: usize, paragraph: usize }, ref: []const u8, before_units: u32, ignored: u8 = 9 };
const coverage: @import("../model/text_transaction.zig").Coverage = .{ .sections = &.{ .{ .section = 0, .paragraphs = 3 }, .{ .section = 1, .paragraphs = 4 } }, .paragraphs = 7, .created_cell_paragraphs = 2 };
const binding: @import("../model/formatting_patch.zig").Binding = .{ .session = "s1", .revision = 7 };
const rows = [_]Row{ .{ .owner = .{ .section = 1, .paragraph = 2 }, .ref = "t1-p1:1:2:r7:k0:b0", .before_units = 3 }, .{ .owner = .{ .section = 0, .paragraph = 1 }, .ref = "t1-p1:0:1:r7:k0:b0", .before_units = 9 } };
test "text transaction reply exact shared DTO ordering and coverage subset" {
    const bytes = try reply.query(a, binding, coverage, &rows);
    defer a.free(bytes);
    var parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
    defer parsed.deinit();
    const root = parsed.value.object;
    try std.testing.expectEqual(@as(i64, 1), root.get("schemaVersion").?.integer);
    const c = root.get("coverage").?.object;
    try std.testing.expectEqual(@as(i64, 7), c.get("totalParagraphs").?.integer);
    try std.testing.expectEqual(@as(i64, 2), c.get("createdCellParagraphs").?.integer);
    try std.testing.expectEqual(@as(i64, 4), c.get("sections").?.array.items[1].object.get("paragraphCount").?.integer);
    const targets = root.get("targets").?.array.items;
    try std.testing.expectEqual(@as(usize, 2), targets.len);
    try std.testing.expectEqualStrings(rows[0].ref, targets[0].object.get("ref").?.string);
    try std.testing.expectEqual(@as(i64, 1), targets[0].object.get("section").?.integer);
    try std.testing.expect(!targets[0].object.contains("ignored"));
    try std.testing.expect(!targets[0].object.contains("owner"));
    try std.testing.expect(!c.contains("created_cell_paragraphs"));
}
test "text transaction reply tiny capabilities allocate exact dynamic bytes" {
    var measured = std.testing.FailingAllocator.init(a, .{});
    const bytes = try reply.capabilities(measured.allocator(), .hwp5, binding);
    defer measured.allocator().free(bytes);
    try std.testing.expectEqual(@as(usize, 1), measured.alloc_index);
    try std.testing.expectEqual(bytes.len, measured.allocated_bytes);
    try std.testing.expect(bytes.len < 1024);
    var parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
    defer parsed.deinit();
    const root = parsed.value.object;
    try std.testing.expectEqualStrings("hwp5", root.get("format").?.string);
    try std.testing.expect(root.get("atomic").?.bool);
    try std.testing.expect(root.get("ordinaryOnly").?.bool);
    try std.testing.expect(!root.get("supportsRichInsertion").?.bool);
    try std.testing.expect(!root.get("supportsNewlines").?.bool);
    try std.testing.expectEqual(@as(i64, 2), root.get("requiresHistoryProtocol").?.integer);
    try std.testing.expectEqual(@as(i64, reply.reply_bytes), root.get("limits").?.object.get("replyBytes").?.integer);
    try std.testing.expectEqual(@as(i64, 16 * 1024 * 1024), root.get("limits").?.object.get("requestBytes").?.integer);
}
test "text transaction reply empty selectors and standard string escaping" {
    const empty = try reply.query(a, binding, coverage, @as([]const Row, &.{}));
    defer a.free(empty);
    try std.testing.expect(std.mem.endsWith(u8, empty, "\"targets\":[]}"));
    var escaped = rows;
    escaped[0].ref = "quote\"slash\\newline\n한😀";
    const bytes = try reply.query(a, binding, coverage, &escaped);
    defer a.free(bytes);
    var parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
    defer parsed.deinit();
    try std.testing.expectEqualStrings(escaped[0].ref, parsed.value.object.get("targets").?.array.items[0].object.get("ref").?.string);
    // Same fields, with a different adapter's row type; no H5 dependency needed.
    const hx = [_]struct { owner: @TypeOf(rows[0].owner), ref: []const u8, before_units: u32 }{.{ .owner = rows[0].owner, .ref = rows[0].ref, .before_units = 3 }};
    const hx_bytes = try reply.query(a, binding, coverage, &hx);
    defer a.free(hx_bytes);
}
test "text transaction reply hard bound counts escaped bytes before allocation and cleans OOM" {
    const huge = try a.alloc(u8, reply.reply_bytes / 6 + 1);
    defer a.free(huge);
    @memset(huge, 1);
    var large = rows;
    large[0].ref = huge;
    var fail = std.testing.FailingAllocator.init(a, .{ .fail_index = 0 });
    try std.testing.expectError(error.LimitExceeded, reply.query(fail.allocator(), binding, coverage, &large));
    try std.testing.expectEqual(@as(usize, 0), fail.alloc_index);
    try std.testing.expectError(error.OutOfMemory, reply.query(fail.allocator(), binding, coverage, &rows));
    try std.testing.expectError(error.OutOfMemory, reply.capabilities(fail.allocator(), .hwp5, binding));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            const bytes = try reply.query(allocator, binding, coverage, &rows);
            defer allocator.free(bytes);
        }
    }.run, .{});
}
