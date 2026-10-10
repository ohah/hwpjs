//! 현재 세션 길이 조회와 wire 검증만 담당합니다. 모델을 변경하지 않습니다.
const std = @import("std");
const Format = @import("../model/document.zig").Format;
const wire = @import("character_range_batch.zig");
const plans = @import("paragraph_replace_commands.zig");

pub fn prepare(comptime format: Format, a: std.mem.Allocator, session: anytype, bytes: []const u8, text: []const u8) ![]plans.Command(format) {
    if (text.len > 4 * 1024 * 1024) return error.LimitExceeded;
    const ranges = try wire.decode(a, bytes);
    defer a.free(ranges);
    const lengths = try a.alloc(u32, ranges.len);
    defer a.free(lengths);
    for (ranges, lengths) |range, *length| {
        if (format == .hwp5) {
            length.* = try session.editableTextLength(a, range.section, range.paragraph);
        } else {
            const current = try session.anchorText(range.section, range.paragraph);
            defer session.allocator.free(current);
            const units = try std.unicode.utf8ToUtf16LeAlloc(a, current);
            defer a.free(units);
            length.* = std.math.cast(u32, units.len) orelse return error.LimitExceeded;
        }
    }
    return plans.build(format, a, ranges, lengths, text);
}

test "paragraph replacement request reads actual lengths and rejects partial tail without mutation" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try @import("../hwp5/edit/style_preservation.zig").Session.open(a, input);
    defer session.close();
    var bytes: [32]u8 = @splat(0);
    std.mem.writeInt(u32, bytes[4..8], 5, .little);
    std.mem.writeInt(u32, bytes[12..16], 4, .little);
    std.mem.writeInt(u32, bytes[20..24], 6, .little);
    std.mem.writeInt(u32, bytes[28..32], 1, .little);
    const commands = try prepare(.hwp5, a, session, &bytes, "한😀");
    defer a.free(commands);
    try std.testing.expectEqual(@as(usize, 3), commands.len);
    std.mem.writeInt(u32, bytes[12..16], 3, .little);
    try std.testing.expectError(error.InvalidTextPosition, prepare(.hwp5, a, session, &bytes, ""));
    const saved = try session.save(a, .{});
    defer a.free(saved.bytes);
    try std.testing.expectEqualSlices(u8, input, saved.bytes);
}

test "paragraph replacement request prepares actual HWPX for one atomic replacement" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("../hwpx/editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const text = try session.anchorText(0, 2);
    defer a.free(text);
    const units = try std.unicode.utf8ToUtf16LeAlloc(a, text);
    defer a.free(units);
    var bytes: [32]u8 = @splat(0);
    std.mem.writeInt(u32, bytes[4..8], 2, .little);
    std.mem.writeInt(u32, bytes[12..16], @intCast(units.len), .little);
    std.mem.writeInt(u32, bytes[20..24], 3, .little);
    const commands = try prepare(.hwpx, a, &session, &bytes, "한😀");
    defer a.free(commands);
    var history = try @import("../hwpx/editor_history.zig").History.init(&session, 4, 4_000_000);
    defer history.deinit();
    try std.testing.expect(try history.applyBatch(&session, commands));
    try std.testing.expect(try history.undo(&session));
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
}

test "paragraph replacement request accepts an actual omitted HWP5 empty cell without changing source" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try @import("../hwp5/edit/style_preservation.zig").Session.open(a, input);
    defer session.close();
    try std.testing.expectEqual(@as(u32, 0), try session.editableTextLength(a, 0, 1));
    var bytes: [16]u8 = @splat(0);
    std.mem.writeInt(u32, bytes[4..8], 1, .little);
    const commands = try prepare(.hwp5, a, session, &bytes, "빈셀😀");
    defer a.free(commands);
    const before = try session.save(a, .{});
    defer a.free(before.bytes);
    try std.testing.expectEqualSlices(u8, input, before.bytes);
    var history = try @import("../hwp5/edit/editor_history.zig").History.init(a, session, 4, 4_000_000);
    defer history.deinit();
    try std.testing.expect(try history.applyBatch(session, commands));
    try std.testing.expectEqual(@as(u32, 4), try session.editableTextLength(a, 0, 1));
    try std.testing.expect(try history.undo(session));
    const restored = try session.save(a, .{});
    defer a.free(restored.bytes);
    try std.testing.expectEqualSlices(u8, input, restored.bytes);
}

test "paragraph replacement request every preparation allocation failure preserves actual HWP5 source" {
    const a = std.testing.allocator;
    const edit = @import("../hwp5/edit/style_preservation.zig");
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, current: *edit.Session) !void {
            var bytes: [16]u8 = @splat(0);
            std.mem.writeInt(u32, bytes[4..8], 1, .little);
            const commands = try prepare(.hwp5, allocator, current, &bytes, "빈셀😀");
            defer allocator.free(commands);
            try std.testing.expectEqual(@as(usize, 1), commands.len);
        }
    }.run, .{session});
    const saved = try session.save(a, .{});
    defer a.free(saved.bytes);
    try std.testing.expectEqualSlices(u8, input, saved.bytes);
}
