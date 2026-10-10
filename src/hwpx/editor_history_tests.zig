const std = @import("std");
const editor = @import("editor_session.zig");
const history = @import("editor_history.zig");

fn synthetic(a: std.mem.Allocator) !editor.Session {
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A</p:t><p:pic/><p:t>B</p:t></p:run></p:p></s:sec>";
    return @import("editor_history_test_fixture.zig").open(a, xml, 1);
}

test "HWPX native history every allocation failure retains current model and stack counts" {
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            var session = try synthetic(a);
            defer session.deinit();
            var h = try history.History.init(&session, 2, 10000);
            defer h.deinit();
            _ = h.apply(&session, .{ .kind = .anchored, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "검증😀" }) catch |err| {
                try std.testing.expectEqual(@as(u32, 0), h.stack.revision);
                try std.testing.expectEqual(@as(u32, 1), h.stack.next_revision);
                try std.testing.expectEqualStrings("A", session.sections[0].sites.items[0].text);
                try std.testing.expectEqual(@as(usize, 0), h.stack.undo.items.len);
                try std.testing.expectEqual(@as(usize, 0), h.stack.redo.items.len);
                return err;
            };
            _ = h.undo(&session) catch |err| {
                try std.testing.expectEqual(@as(u32, 1), h.stack.revision);
                try std.testing.expectEqual(@as(u32, 2), h.stack.next_revision);
                try std.testing.expectEqualStrings("검증😀A", session.sections[0].sites.items[0].text);
                try std.testing.expectEqual(@as(usize, 1), h.stack.undo.items.len);
                try std.testing.expectEqual(@as(usize, 0), h.stack.redo.items.len);
                return err;
            };
            _ = h.redo(&session) catch |err| {
                try std.testing.expectEqual(@as(u32, 0), h.stack.revision);
                try std.testing.expectEqual(@as(u32, 2), h.stack.next_revision);
                try std.testing.expectEqualStrings("A", session.sections[0].sites.items[0].text);
                try std.testing.expectEqual(@as(usize, 0), h.stack.undo.items.len);
                try std.testing.expectEqual(@as(usize, 1), h.stack.redo.items.len);
                return err;
            };
            try std.testing.expectEqualStrings("검증😀A", session.sections[0].sites.items[0].text);
            try std.testing.expectEqual(@as(u32, 1), h.stack.revision);
        }
    }.run, .{});
}

test "HWPX native history undo redo branches failures and bounded eviction" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var h = try history.History.init(&session, 2, 4_000_000);
    defer h.deinit();
    try std.testing.expect(!try h.undo(&session));
    h.max_checkpoint_bytes = try @import("editor_checkpoint.zig").size(&session, std.math.maxInt(usize));
    try std.testing.expectError(error.LimitExceeded, h.apply(&session, .{ .kind = .anchored, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "증가😀" }));
    const after_limit = try session.save();
    defer a.free(after_limit);
    try std.testing.expectEqualSlices(u8, bytes, after_limit);
    try std.testing.expectEqual(@as(usize, 0), h.stack.undo.items.len);
    h.max_checkpoint_bytes = 4_000_000;
    try std.testing.expect(try h.apply(&session, .{ .kind = .anchored, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "A" }));
    try std.testing.expect(try h.apply(&session, .{ .kind = .anchored, .paragraph = 1, .start = 1, .deleted = 0, .inserted = "B" }));
    try std.testing.expect(try h.undo(&session));
    try std.testing.expectError(error.ProtectedInlineControl, h.apply(&session, .{ .kind = .anchored, .paragraph = 1, .start = 1, .deleted = 1, .inserted = "" }));
    try std.testing.expect(!try h.apply(&session, .{ .kind = .anchored, .paragraph = 1, .start = 0, .deleted = 1, .inserted = "A" }));
    try std.testing.expectEqual(@as(usize, 1), h.stack.redo.items.len);
    try std.testing.expect(try h.redo(&session));
    try std.testing.expect(try h.undo(&session));
    try std.testing.expect(try h.undo(&session));
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, bytes, restored);
    try std.testing.expect(try h.apply(&session, .{ .kind = .anchored, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "C" }));
    try std.testing.expect(!try h.redo(&session));
    for (0..3) |_| try std.testing.expect(try h.apply(&session, .{ .kind = .anchored, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "D" }));
    try std.testing.expectEqual(@as(usize, 2), h.stack.undo.items.len);
    try std.testing.expect(try h.undo(&session));
    try std.testing.expect(try h.undo(&session));
    try std.testing.expect(!try h.undo(&session));
}
