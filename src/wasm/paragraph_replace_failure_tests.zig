//! 작은 실제 패키지의 거래·저장 실패 검사. 독립 ZIP oracle은 별도입니다.
const std = @import("std");
const plans = @import("paragraph_replace_commands.zig");
const Range = @import("character_range_batch.zig").Range;
const history = @import("../hwpx/editor_history.zig");

test "paragraph replacement HWPX small multiline transaction survives every allocation failure" {
    const fixture = @import("../hwpx/test_package_fixture.zig");
    const sources = [_]fixture.Source{
        .{ .name = "mimetype", .data = @import("../hwpx/package.zig").mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest><o:item id='h' href='Contents/header.xml' media-type='application/xml'/><o:item id='s' href='Contents/section0.xml' media-type='application/xml'/></o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>" },
        .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'/>" },
        .{ .name = "Contents/section0.xml", .data = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:t>A</p:t></p:run></p:p><p:p id='2'><p:run><p:t>B</p:t></p:run></p:p></s:sec>" },
    };
    const input = try fixture.storedZip(std.testing.allocator, &sources);
    defer std.testing.allocator.free(input);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator, bytes: []const u8) !void {
            var session = try @import("../hwpx/editor_session.zig").open(a, bytes, .{});
            defer session.deinit();
            var h = try history.History.init(&session, 4, 100000);
            defer h.deinit();
            const ranges = [_]Range{ .{ .section = 0, .paragraph = 1, .start = 0, .end = 1 }, .{ .section = 0, .paragraph = 2, .start = 0, .end = 1 } };
            const commands = try plans.build(.hwpx, a, &ranges, &.{ 1, 1 }, "한😀\n\n둘");
            defer a.free(commands);
            _ = h.applyBatch(&session, commands) catch |err| {
                try std.testing.expect(session.sections[0].structure_values == null);
                try std.testing.expectEqual(@as(usize, 2), session.sections[0].last_paragraph);
                try std.testing.expectEqualStrings("A", session.sections[0].sites.items[0].text);
                try std.testing.expectEqualStrings("B", session.sections[0].sites.items[1].text);
                try std.testing.expectEqual(@as(usize, 0), h.stack.undo.items.len);
                try std.testing.expectEqual(@as(usize, 0), h.stack.redo.items.len);
                return err;
            };
            try std.testing.expectEqual(@as(usize, 3), session.sections[0].last_paragraph);
            try std.testing.expectEqual(@as(usize, 1), h.stack.undo.items.len);
            const values = session.sections[0].structure_values.?;
            try std.testing.expectEqual(@as(usize, 3), values.paragraphs.len);
            try std.testing.expectEqualStrings("한😀", values.paragraphs[0].sites.items[0].text);
            const saved = session.save() catch |err| {
                try std.testing.expectEqual(@as(usize, 1), h.stack.undo.items.len);
                try std.testing.expectEqual(@as(usize, 0), h.stack.redo.items.len);
                try std.testing.expectEqual(@as(usize, 3), session.sections[0].last_paragraph);
                try std.testing.expectEqualStrings("한😀", session.sections[0].structure_values.?.paragraphs[0].sites.items[0].text);
                return err;
            };
            defer a.free(saved);
            {
                var reopened = try @import("../hwpx/editor_session.zig").open(a, saved, .{});
                defer reopened.deinit();
                for ([_][]const u8{ "한😀", "", "둘" }, 1..) |expected, paragraph| {
                    const current = try reopened.anchorText(0, paragraph);
                    defer a.free(current);
                    try std.testing.expectEqualStrings(expected, current);
                }
            }
            try std.testing.expect(try h.undo(&session));
            try std.testing.expect(session.sections[0].structure_values == null);
            try std.testing.expectEqualStrings("A", session.sections[0].sites.items[0].text);
            try std.testing.expectEqualStrings("B", session.sections[0].sites.items[1].text);
            const restored = try session.save();
            defer a.free(restored);
            try std.testing.expectEqualSlices(u8, bytes, restored);
            try std.testing.expect(try h.redo(&session));
            const redone = try session.save();
            defer a.free(redone);
            try std.testing.expectEqualSlices(u8, saved, redone);
        }
    }.run, .{input});
}
