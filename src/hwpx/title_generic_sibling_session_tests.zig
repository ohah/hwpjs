//! 재현된 sibling 삭제를 실제 Session에서 검사합니다. 모델 값을 주입하지 않습니다.
const std = @import("std");
const editor = @import("editor_session.zig");
const a = std.testing.allocator;
const section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='1'><p:t>T<p:titleMark ignore='1'/></p:t></p:run><p:run charPrIDRef='1'><p:t>AB</p:t></p:run></p:p></s:sec>";
const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList><h:charProperties itemCnt='2'><h:charPr id='1' height='1000'/><h:charPr id='2' height='1200'/></h:charProperties></h:refList></h:head>";

fn input() ![]u8 {
    return @import("test_formula_fixture.zig").zipWithSectionHeader(a, section, header);
}

test "generic canonical zero actual Session sibling deletion matches reopened XML ZIP ranges" {
    const bytes = try input();
    defer a.free(bytes);
    var current = try editor.open(a, bytes, .{});
    defer current.deinit();
    try std.testing.expect(try current.setCharacterFormat(0, 1, 2, 3, 2));
    const formatted = try current.save();
    defer a.free(formatted);
    var reopened = try editor.open(a, formatted, .{});
    defer reopened.deinit();
    try std.testing.expect(try current.splice(0, 1, 2, 1, ""));
    try std.testing.expect(try reopened.splice(0, 1, 2, 1, ""));
    const left = try current.save();
    defer a.free(left);
    const right = try reopened.save();
    defer a.free(right);
    try std.testing.expectEqualSlices(u8, left, right);
    const left_ranges = try @import("character_style_snapshot.zig").read(&current, 0, 1);
    defer a.free(left_ranges);
    const right_ranges = try @import("character_style_snapshot.zig").read(&reopened, 0, 1);
    defer a.free(right_ranges);
    try std.testing.expectEqual(left_ranges.len, right_ranges.len);
    for (left_ranges, right_ranges) |one, two| try std.testing.expectEqualDeep(one, two);
    var saved = try editor.open(a, left, .{});
    defer saved.deinit();
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved.sections[0].tree.source, "<p:titleMark"));
    try std.testing.expect(std.mem.indexOf(u8, saved.sections[0].tree.source, "<p:run charPrIDRef='2'><p:t></p:t></p:run>") != null);
    try std.testing.expectEqualSlices(u8, bytes, current.source);
}

test "generic canonical zero actual Session sibling OOM leaves formatted text styles owners plan intact" {
    const bytes = try input();
    defer a.free(bytes);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: []const u8) !void {
            var session = try editor.open(allocator, original, .{});
            defer session.deinit();
            try std.testing.expect(try session.setCharacterFormat(0, 1, 2, 3, 2));
            const row = &session.sections[0].structure_values.?.paragraphs[0];
            const styles = try allocator.dupe(@import("character_style_paint.zig").Span, row.character_styles.?);
            defer allocator.free(styles);
            const owners = try allocator.dupe(@import("title_fragment_owner.zig").Owner, row.title_fragment_owners.?);
            defer allocator.free(owners);
            const ranges = try allocator.dupe(@import("character_style_display_ranges.zig").Range, row.title_output_projection.?.ranges);
            defer allocator.free(ranges);
            const changed = session.splice(0, 1, 2, 1, "") catch |err| {
                try std.testing.expect(err == error.OutOfMemory);
                try std.testing.expectEqualSlices(u8, original, session.source);
                const after = &session.sections[0].structure_values.?.paragraphs[0];
                try std.testing.expectEqual(styles.len, after.character_styles.?.len);
                for (styles, after.character_styles.?) |one, two| try std.testing.expectEqualDeep(one, two);
                try std.testing.expectEqual(owners.len, after.title_fragment_owners.?.len);
                for (owners, after.title_fragment_owners.?) |one, two| try std.testing.expectEqualDeep(one, two);
                try std.testing.expectEqual(ranges.len, after.title_output_projection.?.ranges.len);
                for (ranges, after.title_output_projection.?.ranges) |one, two| try std.testing.expectEqualDeep(one, two);
                try std.testing.expectEqual(@as(usize, 3), after.sites.items.len);
                try std.testing.expectEqualStrings("T", after.sites.items[0].text);
                try std.testing.expectEqualStrings("", after.sites.items[1].text);
                try std.testing.expectEqualStrings("AB", after.sites.items[2].text);
                return err;
            };
            try std.testing.expect(changed);
        }
    }.run, .{bytes});
}
