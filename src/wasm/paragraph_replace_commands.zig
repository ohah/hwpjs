//! 검증된 연속 문단 선택을 splice와 merge 묶음으로 구성합니다.
const std = @import("std");
const Format = @import("../model/document.zig").Format;
const Range = @import("character_range_batch.zig").Range;

pub fn Command(comptime format: Format) type {
    return if (format == .hwp5) @import("../hwp5/edit/style_preservation.zig").Command else @import("../hwpx/editor_history.zig").Command;
}

/// 길이는 현재 세션에서 얻은 UTF-16 길이여야 합니다. text는 호출 중 빌려 씁니다.
pub fn build(comptime format: Format, a: std.mem.Allocator, ranges: []const Range, lengths: []const u32, text: []const u8) ![]Command(format) {
    if (ranges.len == 0 or ranges.len != lengths.len) return error.InvalidTextPosition;
    if (ranges.len > @import("character_range_batch.zig").max_ranges or text.len > 4 * 1024 * 1024) return error.LimitExceeded;
    for (ranges, 0..) |range, i| {
        if (range.end < range.start or range.end > lengths[i] or range.section != ranges[0].section) return error.InvalidTextPosition;
        if (i + 1 < ranges.len and range.end != lengths[i]) return error.InvalidTextPosition;
        if (i > 0 and (range.start != 0 or range.paragraph != std.math.add(u32, ranges[i - 1].paragraph, 1) catch return error.InvalidTextPosition)) return error.InvalidTextPosition;
    }
    const line_count = std.mem.count(u8, text, "\n") + 1;
    if (line_count > 4096) return error.LimitExceeded;
    const commands = try a.alloc(Command(format), ranges.len * 2 - 1 + (line_count - 1) * 2);
    errdefer a.free(commands);
    var lines = std.mem.splitScalar(u8, text, '\n');
    const first_line = lineText(lines.next().?, line_count > 1);
    // 뒤에서부터 변경하면 이후 구조 병합 전의 문단 번호를 유지할 수 있습니다.
    for (0..ranges.len) |i| {
        const index = ranges.len - i - 1;
        const range = ranges[index];
        const inserted = if (index == 0) first_line else "";
        commands[i] = if (format == .hwp5)
            .{ .splice_text = .{ .section = range.section, .paragraph = range.paragraph, .start_unit = range.start, .end_unit = range.end, .utf8 = inserted } }
        else
            .{ .section = range.section, .paragraph = range.paragraph, .start = range.start, .deleted = range.end - range.start, .inserted = inserted };
    }
    const merged_end = ranges.len * 2 - 1;
    for (commands[ranges.len..merged_end]) |*command| command.* = if (format == .hwp5)
        .{ .merge_paragraph = .{ .section = ranges[0].section, .paragraph = ranges[0].paragraph } }
    else
        .{ .kind = .merge, .section = ranges[0].section, .paragraph = ranges[0].paragraph, .start = 0, .deleted = 0, .inserted = "" };
    var paragraph = ranges[0].paragraph;
    var at = std.math.add(u32, ranges[0].start, try utf16Length(a, first_line)) catch return error.InvalidTextPosition;
    var index = merged_end;
    while (lines.next()) |raw_line| {
        const line = lineText(raw_line, index + 2 < commands.len);
        commands[index] = if (format == .hwp5)
            .{ .split_paragraph = .{ .section = ranges[0].section, .paragraph = paragraph, .at_unit = at } }
        else
            .{ .kind = .split, .section = ranges[0].section, .paragraph = paragraph, .start = at, .deleted = 0, .inserted = "" };
        paragraph = std.math.add(u32, paragraph, 1) catch return error.InvalidTextPosition;
        commands[index + 1] = if (format == .hwp5)
            .{ .splice_text = .{ .section = ranges[0].section, .paragraph = paragraph, .start_unit = 0, .end_unit = 0, .utf8 = line } }
        else
            .{ .section = ranges[0].section, .paragraph = paragraph, .start = 0, .deleted = 0, .inserted = line };
        at = try utf16Length(a, line);
        index += 2;
    }
    return commands;
}

fn lineText(bytes: []const u8, terminated: bool) []const u8 {
    return if (terminated and bytes.len > 0 and bytes[bytes.len - 1] == '\r') bytes[0 .. bytes.len - 1] else bytes;
}
fn utf16Length(a: std.mem.Allocator, bytes: []const u8) !u32 {
    const units = try std.unicode.utf8ToUtf16LeAlloc(a, bytes);
    defer a.free(units);
    return std.math.cast(u32, units.len) orelse error.LimitExceeded;
}

test "paragraph replacement multiline plans release every failed allocation" {
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            const ranges = [_]Range{ .{ .section = 0, .paragraph = 5, .start = 1, .end = 4 }, .{ .section = 0, .paragraph = 6, .start = 0, .end = 4 }, .{ .section = 0, .paragraph = 7, .start = 0, .end = 2 } };
            const hwp = try build(.hwp5, a, &ranges, &.{ 4, 4, 4 }, "한😀\r\n\n둘\r");
            defer a.free(hwp);
            const hwpx = try build(.hwpx, a, &ranges, &.{ 4, 4, 4 }, "한😀\r\n\n둘\r");
            defer a.free(hwpx);
            try std.testing.expectEqual(@as(usize, 9), hwp.len);
            try std.testing.expectEqual(@as(usize, 9), hwpx.len);
            try std.testing.expectEqualStrings("한😀", hwp[2].splice_text.utf8);
            try std.testing.expectEqual(@as(u32, 4), hwpx[5].start);
            try std.testing.expectEqualStrings("둘\r", hwpx[8].inserted);
        }
    }.run, .{});
}

test "paragraph replacement plans accept exact line limit and reject late invalid UTF8" {
    const a = std.testing.allocator;
    const ranges = [_]Range{.{ .section = 0, .paragraph = 1, .start = 0, .end = 0 }};
    const separators: [4096]u8 = @splat('\n');
    const hwp = try build(.hwp5, a, &ranges, &.{0}, separators[0..4095]);
    defer a.free(hwp);
    const hwpx = try build(.hwpx, a, &ranges, &.{0}, separators[0..4095]);
    defer a.free(hwpx);
    try std.testing.expectEqual(@as(usize, 8191), hwp.len);
    try std.testing.expectEqual(@as(usize, 8191), hwpx.len);
    try std.testing.expectEqual(@as(usize, 4096), hwp[hwp.len - 1].splice_text.paragraph);
    try std.testing.expectEqual(@as(usize, 4096), hwpx[hwpx.len - 1].paragraph);
    try std.testing.expectError(error.LimitExceeded, build(.hwp5, a, &ranges, &.{0}, &separators));
    try std.testing.expectError(error.LimitExceeded, build(.hwpx, a, &ranges, &.{0}, &separators));
    try std.testing.expectError(error.InvalidUtf8, build(.hwp5, a, &ranges, &.{0}, "한😀\n\n\xff"));
    try std.testing.expectError(error.InvalidUtf8, build(.hwpx, a, &ranges, &.{0}, "한😀\n\n\xff"));
}

test "paragraph replacement command plan preserves order and rejects gaps and wraparound" {
    const a = std.testing.allocator;
    const ranges = [_]Range{ .{ .section = 0, .paragraph = 5, .start = 1, .end = 4 }, .{ .section = 0, .paragraph = 6, .start = 0, .end = 2 } };
    const commands = try build(.hwp5, a, &ranges, &.{ 4, 4 }, "한😀");
    defer a.free(commands);
    try std.testing.expectEqual(@as(usize, 3), commands.len);
    try std.testing.expectEqual(@as(usize, 6), commands[0].splice_text.paragraph);
    try std.testing.expectEqualStrings("한😀", commands[1].splice_text.utf8);
    try std.testing.expectEqual(@as(usize, 5), commands[2].merge_paragraph.paragraph);
    var invalid = ranges;
    invalid[1].paragraph = 7;
    try std.testing.expectError(error.InvalidTextPosition, build(.hwpx, a, &invalid, &.{ 4, 4 }, ""));
    invalid[0].paragraph = std.math.maxInt(u32);
    invalid[1].paragraph = 0;
    try std.testing.expectError(error.InvalidTextPosition, build(.hwp5, a, &invalid, &.{ 4, 4 }, ""));
    try std.testing.expectError(error.InvalidTextPosition, build(.hwp5, a, &ranges, &.{ 5, 4 }, ""));
    try std.testing.expectError(error.InvalidTextPosition, build(.hwp5, a, &ranges, &.{4}, ""));
    try std.testing.expectError(error.InvalidTextPosition, build(.hwp5, a, &ranges, &.{ 4, 1 }, ""));
}

test "paragraph replacement command plan edits actual HWP5 paragraphs in one history transaction" {
    const a = std.testing.allocator;
    const edit = @import("../hwp5/edit/style_preservation.zig");
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    var history = try @import("../hwp5/edit/editor_history.zig").History.init(a, session, 8, 4_000_000);
    defer history.deinit();
    const ranges = [_]Range{ .{ .section = 0, .paragraph = 5, .start = 1, .end = 4 }, .{ .section = 0, .paragraph = 6, .start = 0, .end = 2 } };
    const first_before = try session.copyText(a, 0, 5);
    defer a.free(first_before);
    const second_before = try session.copyText(a, 0, 6);
    defer a.free(second_before);
    const commands = try build(.hwp5, a, &ranges, &.{ @intCast(first_before.len / 2 - 1), @intCast(second_before.len / 2 - 1) }, "한😀");
    defer a.free(commands);
    try std.testing.expect(try history.applyBatch(session, commands));
    const text = try session.copyText(a, 0, 5);
    defer a.free(text);
    const expected = try std.unicode.utf8ToUtf16LeAlloc(a, "문한😀 7\r");
    defer a.free(expected);
    try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(expected), text);
    try std.testing.expect(try history.undo(session));
    try std.testing.expect(!try history.undo(session));
    const restored = try session.save(a, .{});
    defer a.free(restored.bytes);
    try std.testing.expectEqualSlices(u8, input, restored.bytes);
}

test "paragraph replacement command plan edits actual HWPX and rolls back a late merge refusal" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("../hwpx/editor_session.zig").open(a, input, .{});
    defer session.deinit();
    var history = try @import("../hwpx/editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    const first = try session.anchorText(0, 2);
    defer a.free(first);
    const second = try session.anchorText(0, 3);
    defer a.free(second);
    const units = try std.unicode.utf8ToUtf16LeAlloc(a, first);
    defer a.free(units);
    const ranges = [_]Range{ .{ .section = 0, .paragraph = 2, .start = 0, .end = @intCast(units.len) }, .{ .section = 0, .paragraph = 3, .start = 0, .end = 0 } };
    const second_units = try std.unicode.utf8ToUtf16LeAlloc(a, second);
    defer a.free(second_units);
    const commands = try build(.hwpx, a, &ranges, &.{ @intCast(units.len), @intCast(second_units.len) }, "한😀");
    defer a.free(commands);
    try std.testing.expect(try history.applyBatch(&session, commands));
    const text = try session.anchorText(0, 2);
    defer a.free(text);
    const expected = try std.fmt.allocPrint(a, "한😀{s}", .{second});
    defer a.free(expected);
    try std.testing.expectEqualStrings(expected, text);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expect(try history.undo(&session));
    try std.testing.expect(!try history.undo(&session));
    commands[2].paragraph = std.math.maxInt(u32);
    try std.testing.expectError(error.InvalidParagraphIndex, history.applyBatch(&session, commands));
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    try std.testing.expect(try history.undo(&session));
    const multiline = try build(.hwpx, a, &ranges, &.{ @intCast(units.len), @intCast(second_units.len) }, "한😀\r\n\n둘");
    defer a.free(multiline);
    try std.testing.expect(try history.applyBatch(&session, multiline));
    const first_line = try session.anchorText(0, 2);
    defer a.free(first_line);
    const empty_line = try session.anchorText(0, 3);
    defer a.free(empty_line);
    const last_line = try session.anchorText(0, 4);
    defer a.free(last_line);
    const expected_last = try std.fmt.allocPrint(a, "둘{s}", .{second});
    defer a.free(expected_last);
    try std.testing.expectEqualStrings("한😀", first_line);
    try std.testing.expectEqualStrings("", empty_line);
    try std.testing.expectEqualStrings(expected_last, last_line);
    try std.testing.expect(try history.undo(&session));
    const original_again = try session.save();
    defer a.free(original_again);
    try std.testing.expectEqualSlices(u8, input, original_again);
}
