//! 실행 미허가: Native 선언만 준비한다. 같은 noori owner를 바꾸지 않는다.
const std = @import("std");
const model = @import("../model/document.zig");
const windows = @import("../hwp5/edit/live_text_window.zig");
const gap = @import("../hwp5/edit/live_text_backing.zig");
const edit = @import("../hwp5/edit/style_preservation.zig");
const histories = @import("../hwp5/edit/editor_history.zig");
const a = std.testing.allocator;
fn paragraph(tokens: []model.Token, units: u32, present: bool) model.Paragraph {
    return .{ .source_node = 87, .parent_node = 80, .declared_units = units, .text_present = present, .para_shape_id = 0, .style_id = 0, .tokens = tokens, .character_runs = &.{}, .deferred_direct_records = 0 };
}
test "HWP5 text window: canonical bounded UTF16와 부재 빈 payload" {
    var raw = [_]u8{ 'A', 0, 0x3d, 0xd8, 0, 0xde, 'B', 0, 13, 0 };
    var tokens = [_]model.Token{ .{ .start_unit = 0, .kind = .text, .encoding = .utf16le, .raw = raw[0..8] }, .{ .start_unit = 4, .kind = .control, .encoding = .utf16le, .raw = raw[8..] } };
    const p = paragraph(&tokens, 5, true);
    var window = try windows.canonical(a, p, 1, 3);
    defer window.deinit(a);
    try std.testing.expectEqualSlices(u8, raw[2..6], window.bytes);
    try std.testing.expectEqual(@as(u32, 5), window.total_units);
    try std.testing.expectError(error.SplitSurrogatePair, windows.canonical(a, p, 2, 3));
    var tail = try windows.canonical(a, p, 4, 5);
    defer tail.deinit(a);
    try std.testing.expectEqualSlices(u8, &.{ 13, 0 }, tail.bytes);
    var absent = try windows.canonical(a, paragraph(&.{}, 1, false), 0, 0);
    defer absent.deinit(a);
    var empty = try windows.canonical(a, paragraph(&.{}, 0, true), 0, 0);
    defer empty.deinit(a);
    try std.testing.expect(!absent.text_present and empty.text_present);
    try std.testing.expectEqual(@as(u32, 0), absent.total_units);
}
fn allocationCase(allocator: std.mem.Allocator) !void {
    var backing = try gap.Backing.init(allocator, &.{ 'a', 0, 13, 0 }, 0, 15, 87, 80);
    defer backing.deinit();
    const serial = backing.serial;
    const out = try backing.copyWindow(allocator, 0, 2);
    defer allocator.free(out);
    try backing.reserve(256);
    try std.testing.expectEqualSlices(u8, &.{ 'a', 0, 13, 0 }, out);
    try std.testing.expectEqual(serial, backing.serial);
    try std.testing.expectEqual(@as(usize, 0), backing.counters.materialize_units);
}
test "HWP5 text window: gap 성장 후 caller 소유와 모든 allocation 실패" {
    try std.testing.checkAllAllocationFailures(a, allocationCase, .{});
}
test "HWP5 text window: 동일 noori owner32 64 128 입력 window와 역undo" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp", a, .limited(4_000_000));
    defer a.free(input);
    for ([_]usize{ 32, 64, 128 }) |count| {
        const s = try edit.Session.open(a, input);
        defer s.close();
        s.enableHistoryDelta();
        const p = try s.paragraph(0, 15);
        try std.testing.expectEqual(@as(?u32, 87), p.source_node);
        try std.testing.expectEqual(@as(?u32, 80), p.parent_node);
        const original = try s.copyText(a, 0, 15);
        defer a.free(original);
        const ref = try s.currentSourceParagraphReference(0, 15);
        var h = try histories.History.initV2(a, s, .{ .max_entries = 128, .max_checkpoint_bytes = 1024 * 1024 });
        defer h.deinit();
        var copied: usize = 0;
        for (0..count) |i| {
            try std.testing.expect(try h.apply(s, .{ .splice_text = .{ .section = 0, .paragraph = 15, .start_unit = @intCast(i), .end_unit = @intCast(i), .utf8 = "x" } }));
            const ticket = try s.historyTicket();
            const identity = edit.Testing.liveIdentity(s);
            const total = @as(u32, @intCast(original.len / 2 + i + 1));
            const focus: u32 = @intCast(i + 1);
            const start = focus -| 8;
            const end = @min(total, focus + 8);
            var out = try s.copySourceTextWindowUtf16(a, 0, ref.source.host, start, end);
            defer out.deinit(a);
            try std.testing.expectEqual(total, out.total_units);
            try std.testing.expect(start <= focus and focus <= end and focus < total);
            for (0..end - start) |j| {
                const global = @as(usize, start) + j;
                const expected = if (global <= i) @as(u16, 'x') else std.mem.readInt(u16, original[(global - i - 1) * 2 ..][0..2], .little);
                try std.testing.expectEqual(expected, std.mem.readInt(u16, out.bytes[j * 2 ..][0..2], .little));
            }
            copied += end - start;
            try std.testing.expect(std.meta.eql(ticket, try s.historyTicket()));
            try std.testing.expect(std.meta.eql(identity, edit.Testing.liveIdentity(s)));
            try std.testing.expectEqual(@as(usize, 0), s.liveTextCounters().materialize_units);
        }
        const stats = s.liveTextCounters();
        try std.testing.expectEqual(@as(u64, @intCast(copied)), stats.window_copy_units);
        std.debug.print("\nHWP5 window E={d} source={d} window={d} materialize={d}\n", .{ count, stats.source_copy_units, stats.window_copy_units, stats.materialize_units });
        const edited = (try s.save(a, .{ .allow_stale_layout = true })).bytes;
        defer a.free(edited);
        const opened = try edit.Session.open(a, edited);
        defer opened.close();
        const full = try opened.copyText(a, 0, 15);
        defer a.free(full);
        for (0..count) |j| try std.testing.expectEqual(@as(u16, 'x'), std.mem.readInt(u16, full[j * 2 ..][0..2], .little));
        try std.testing.expectEqualSlices(u8, original, full[count * 2 ..]);
        const after_save = try s.copySourceTextWindowUtf16(a, 0, ref.source.host, 0, @min(@as(u32, @intCast(full.len / 2)), 16));
        var owned_window = after_save;
        defer owned_window.deinit(a);
        const resaved = (try s.save(a, .{ .allow_stale_layout = true })).bytes;
        defer a.free(resaved);
        try std.testing.expectEqualSlices(u8, edited, resaved);
        for (0..count) |_| try std.testing.expect(try h.undo(s));
        const saved = (try s.save(a, .{ .allow_stale_layout = true })).bytes;
        defer a.free(saved);
        try std.testing.expectEqualSlices(u8, input, saved);
    }
}
test "HWP5 text window: bounded wire header는 epoch owner와 payload를 분리한다" {
    try std.testing.checkAllAllocationFailures(a, wireAllocationCase, .{});
    var raw = [_]u8{ 'a', 0, 13, 0 };
    var tokens = [_]model.Token{ .{ .start_unit = 0, .kind = .text, .encoding = .utf16le, .raw = raw[0..2] }, .{ .start_unit = 1, .kind = .control, .encoding = .utf16le, .raw = raw[2..] } };
    var window = try windows.canonical(a, paragraph(&tokens, 2, true), 0, 1);
    defer window.deinit(a);
    const bytes = try @import("../wasm/hwp5_text_window_wire.zig").encode(a, 42, 0, window);
    defer a.free(bytes);
    try std.testing.expectEqual(@as(usize, 50), bytes.len);
    try std.testing.expectEqualSlices(u8, "H5W1", bytes[0..4]);
    try std.testing.expectEqual(@as(u32, 42), std.mem.readInt(u32, bytes[8..12], .little));
    try std.testing.expectEqual(@as(u32, 87), std.mem.readInt(u32, bytes[20..24], .little));
    try std.testing.expectEqualSlices(u8, &.{ 'a', 0 }, bytes[48..]);
}

fn wireAllocationCase(allocator: std.mem.Allocator) !void {
    var raw = [_]u8{ 'a', 0, 13, 0 };
    var tokens = [_]model.Token{ .{ .start_unit = 0, .kind = .text, .encoding = .utf16le, .raw = raw[0..2] }, .{ .start_unit = 1, .kind = .control, .encoding = .utf16le, .raw = raw[2..] } };
    var window = try windows.canonical(allocator, paragraph(&tokens, 2, true), 0, 1);
    defer window.deinit(allocator);
    const out = try @import("../wasm/hwp5_text_window_wire.zig").encode(allocator, 42, 0, window);
    defer allocator.free(out);
    try std.testing.expectEqualSlices(u8, &.{ 'a', 0 }, out[48..]);
}
