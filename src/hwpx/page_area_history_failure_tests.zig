//! 공개 병합과 History 체크포인트 거래의 할당 실패를 검증합니다.
const std = @import("std");
const editor = @import("editor_session.zig");
const History = @import("editor_history.zig").History;

const paragraphs = "<p:p id='1'><p:run charPrIDRef='0'><p:t>AB</p:t></p:run><p:run charPrIDRef='1'><p:ctrl><p:header id='1' applyPageType='BOTH'><p:subList><p:p id='2'><p:run><p:t>HEAD</p:t></p:run></p:p></p:subList></p:header></p:ctrl><p:t>😀</p:t><p:ctrl><p:footer id='2' applyPageType='BOTH'><p:subList><p:p id='3'><p:run><p:t>FOOT</p:t></p:run></p:p></p:subList></p:footer></p:ctrl><p:t>CD</p:t></p:run></p:p>";

fn prepare(a: std.mem.Allocator, input: []const u8) !editor.Session {
    var session = try editor.open(a, input, .{});
    errdefer session.deinit();
    _ = try session.splitParagraph(0, 1, 4, 0);
    _ = try session.splice(0, 3, 0, 0, "서식<&");
    return session;
}

test "page area public ordered merge History ZIP transaction fails atomically" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, paragraphs);
    defer a.free(input);
    var source = try prepare(a, input);
    defer source.deinit();
    const baseline = try source.save();
    defer a.free(baseline);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, expected: []const u8) !void {
            var session = try prepare(allocator, bytes);
            defer session.deinit();
            var history = try History.init(&session, 8, 4000000);
            defer history.deinit();
            const count = session.sections[0].last_paragraph;
            _ = history.apply(&session, .{ .kind = .merge, .paragraph = 1, .right_paragraph = 3, .start = 0, .deleted = 0, .inserted = "" }) catch |err| {
                try std.testing.expectEqual(count, session.sections[0].last_paragraph);
                try std.testing.expectEqual(@as(usize, 0), history.stack.undo.items.len);
                try std.testing.expectEqual(@as(usize, 0), history.stack.redo.items.len);
                var readonly = session;
                readonly.allocator = std.testing.allocator;
                const saved = try readonly.save();
                defer std.testing.allocator.free(saved);
                try std.testing.expectEqualSlices(u8, expected, saved);
                return err;
            };
            try std.testing.expectEqual(count - 1, session.sections[0].last_paragraph);
            var readonly = session;
            readonly.allocator = std.testing.allocator;
            const merged = try readonly.save();
            defer std.testing.allocator.free(merged);
            const did_undo = history.undo(&session) catch |err| {
                var failed_view = session;
                failed_view.allocator = std.testing.allocator;
                const saved = try failed_view.save();
                defer std.testing.allocator.free(saved);
                try std.testing.expectEqualSlices(u8, merged, saved);
                try std.testing.expectEqual(@as(usize, 1), history.stack.undo.items.len);
                try std.testing.expectEqual(@as(usize, 0), history.stack.redo.items.len);
                return err;
            };
            try std.testing.expect(did_undo);
            readonly = session;
            readonly.allocator = std.testing.allocator;
            const undone = try readonly.save();
            defer std.testing.allocator.free(undone);
            try std.testing.expectEqualSlices(u8, expected, undone);
            try std.testing.expect(try history.redo(&session));
            readonly = session;
            readonly.allocator = std.testing.allocator;
            const redone = try readonly.save();
            defer std.testing.allocator.free(redone);
            try std.testing.expectEqualSlices(u8, merged, redone);
        }
    };
    try Probe.run(a, input, baseline);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ input, baseline });
}
