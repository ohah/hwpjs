//! Source-only integration entry. Main registers/runs this after its build grant.
//! Every input is produced in memory; no fixture or filesystem access.
comptime {
    _ = @import("new_document/color_profile_tests.zig");
}
const std = @import("std");
const new_document = @import("new_document/root.zig");
const native = @import("native/context.zig");
const a = std.testing.allocator;

test {
    _ = @import("new_document/metadata_tests.zig");
    _ = @import("hwp5/edit/section_prefix_split_tests.zig");
}

fn expectEmptyHwp5(bytes: []const u8) !void {
    const text = try @import("hwp5/body/text.zig").Text.parse(bytes);
    var tokens = text.tokens();
    var anchors: usize = 0;
    var breaks: usize = 0;
    while (try tokens.next()) |token| switch (token.value) {
        .text => |raw| try std.testing.expectEqual(@as(usize, 0), raw.len),
        .control => |control| switch (control.code) {
            2 => {
                try std.testing.expect(anchors < 2);
                const ids = @import("hwp5/body/control_rules.zig");
                try std.testing.expectEqual(if (anchors == 0) ids.section_id else ids.column_id, std.mem.readInt(u32, control.data[0..4], .little));
                anchors += 1;
            },
            13 => breaks += 1,
            else => return error.UnexpectedNewDocumentControl,
        },
    };
    try std.testing.expectEqual(@as(usize, 2), anchors);
    try std.testing.expectEqual(@as(usize, 1), breaks);
}

test "new document Native open empty read insert save reopen undo redo both formats" {
    inline for (.{ native.Format.hwp5, native.Format.hwpx }) |format| {
        const source = try switch (format) {
            .hwp5 => new_document.hwp5(a),
            .hwpx => new_document.hwpx(a),
        };
        defer a.free(source);
        var bridge = native.Bridge.init(a);
        defer bridge.deinit();
        const token = try bridge.open(format, source);
        const paragraph: u32 = if (format == .hwp5) 0 else 1;
        const offset: u32 = if (format == .hwp5) 16 else 0;
        const initial = try bridge.read(token, 0, paragraph);
        const empty = try bridge.output(initial.token);
        const empty_copy = try a.dupe(u8, empty);
        defer a.free(empty_copy);
        if (format == .hwp5) try expectEmptyHwp5(empty) else try std.testing.expectEqualStrings("", empty);
        const ctx = try bridge.get(token);
        try std.testing.expect(!try ctx.splice(0, 0, paragraph, offset, 0, ""));
        try std.testing.expectEqual(@as(u32, 0), ctx.revision);
        try std.testing.expect(try ctx.splice(0, 0, paragraph, offset, 0, "한글😀"));
        const current = try bridge.read(token, 0, paragraph);
        const edited = try bridge.output(current.token);
        if (format == .hwp5) {
            try std.testing.expectEqualSlices(u8, &.{ 0x5c, 0xd5, 0x00, 0xae, 0x3d, 0xd8, 0x00, 0xde, 13, 0 }, edited[32..]);
        } else try std.testing.expectEqualStrings("한글😀", edited);
        const saved = try bridge.save(token, 1, true);
        const reopened = try bridge.open(format, try bridge.output(saved.token));
        const reread = try bridge.read(reopened, 0, paragraph);
        try std.testing.expectEqualSlices(u8, edited, try bridge.output(reread.token));
        try std.testing.expect(try ctx.moveHistory(1, false));
        const restored = try bridge.save(token, 2, false);
        try std.testing.expectEqualSlices(u8, source, try bridge.output(restored.token));
        try std.testing.expect(try ctx.moveHistory(2, true));
        const redone = try bridge.save(token, 3, true);
        try std.testing.expectEqualSlices(u8, try bridge.output(saved.token), try bridge.output(redone.token));
        // Previously retained outputs stay valid through edits and history moves.
        try std.testing.expectEqualSlices(u8, empty_copy, try bridge.output(initial.token));
    }
}

test "new document HWP5 empty paragraph newline save reopen undo redo" {
    const edit = @import("hwp5/edit/style_preservation.zig");
    const History = @import("hwp5/edit/editor_history.zig").History;
    const source = try new_document.hwp5(a);
    defer a.free(source);
    const session = try edit.Session.open(a, source);
    defer session.close();
    try std.testing.expectEqual(@as(usize, 1), try session.paragraphCount(0));
    var history = try History.initV2(a, session, .{});
    defer history.deinit();
    // The two required section/column anchors stay in the left paragraph.
    try std.testing.expect(try history.apply(session, .{ .split_paragraph = .{ .section = 0, .paragraph = 0, .at_unit = 16 } }));
    try std.testing.expectEqual(@as(usize, 2), try session.paragraphCount(0));
    const left = try session.copyText(a, 0, 0);
    defer a.free(left);
    try expectEmptyHwp5(left);
    const right = try session.copyText(a, 0, 1);
    defer a.free(right);
    try std.testing.expectEqualSlices(u8, &.{ 13, 0 }, right);
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    try std.testing.expectEqual(@as(usize, 2), try reopened.paragraphCount(0));
    const reread = try reopened.copyText(a, 0, 0);
    defer a.free(reread);
    try std.testing.expectEqualSlices(u8, left, reread);
    const reread_right = try reopened.copyText(a, 0, 1);
    defer a.free(reread_right);
    try std.testing.expectEqualSlices(u8, right, reread_right);
    try std.testing.expect(try history.undo(session));
    const restored = try session.save(a, .{});
    defer a.free(restored.bytes);
    try std.testing.expectEqualSlices(u8, source, restored.bytes);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}

test "new document HWPX empty paragraph newline save reopen undo redo" {
    const edit = @import("hwpx/editor_session.zig");
    const History = @import("hwpx/editor_history.zig").History;
    const source = try new_document.hwpx(a);
    defer a.free(source);
    var session = try edit.open(a, source, .{});
    defer session.deinit();
    var history = try History.initV2(&session, .{});
    defer history.deinit();
    try std.testing.expect(try history.apply(&session, .{ .kind = .split, .section = 0, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "" }));
    try std.testing.expectEqual(@as(usize, 2), session.sections[0].last_paragraph);
    for ([_]usize{ 1, 2 }) |paragraph| {
        const text = try session.anchorText(0, paragraph);
        defer a.free(text);
        try std.testing.expectEqualStrings("", text);
    }
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try edit.open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(@as(usize, 2), reopened.sections[0].last_paragraph);
    for ([_]usize{ 1, 2 }) |paragraph| {
        const text = try reopened.anchorText(0, paragraph);
        defer a.free(text);
        try std.testing.expectEqualStrings("", text);
    }
    try std.testing.expect(try history.undo(&session));
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, source, restored);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}

test "new document ZIP store writer bounds paths duplicates CRC epoch and exact budget" {
    const writer = @import("zip/store_writer.zig");
    const zip = @import("zip/archive.zig");
    const sources = [_]writer.Source{ .{ .name = "mimetype", .bytes = "application/hwp+zip" }, .{ .name = "내용.xml", .bytes = "<x/>" } };
    const bytes = try writer.write(a, &sources, .{});
    defer a.free(bytes);
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    try std.testing.expectEqual(@as(usize, 2), archive.entries.len);
    try std.testing.expectEqual(@as(usize, 0), archive.entries[0].local_offset);
    for (archive.entries, sources) |entry, source| {
        try std.testing.expectEqual(@as(u16, 0), entry.method);
        try std.testing.expectEqual(@as(u16, 0x0800), entry.flags);
        const decoded = try archive.decode(entry, 1024);
        defer a.free(decoded);
        try std.testing.expectEqualSlices(u8, source.bytes, decoded);
    }
    const exact = try writer.write(a, &sources, .{ .max_output_bytes = bytes.len });
    defer a.free(exact);
    try std.testing.expectEqualSlices(u8, bytes, exact);
    try std.testing.expectError(error.LimitExceeded, writer.write(a, &sources, .{ .max_output_bytes = bytes.len - 1 }));
    try std.testing.expectError(error.LimitExceeded, writer.write(a, &.{}, .{ .max_output_bytes = 21 }));
    try std.testing.expectError(error.DuplicateEntryName, writer.write(a, &.{ sources[0], sources[0] }, .{}));
    for ([_][]const u8{ "", "/absolute", "../escape", "a/../b", "a\\b", &.{0xff} }) |name| {
        try std.testing.expectError(error.InvalidEntryName, writer.write(a, &.{.{ .name = name, .bytes = "x" }}, .{}));
    }
    const corrupt = try a.dupe(u8, bytes);
    defer a.free(corrupt);
    const payload_at = 30 + sources[0].name.len;
    corrupt[payload_at] ^= 1;
    var bad = try zip.open(a, corrupt, .{});
    defer bad.deinit();
    try std.testing.expectError(error.InvalidCrc, bad.decode(bad.entries[0], 1024));
}

test "new document constructors and ZIP writer release every allocation failure" {
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator) !void {
            const h5 = try new_document.hwp5(allocator);
            defer allocator.free(h5);
            const hx = try new_document.hwpx(allocator);
            defer allocator.free(hx);
            const zip = try @import("zip/store_writer.zig").write(allocator, &.{.{ .name = "한글", .bytes = "x" }}, .{});
            defer allocator.free(zip);
        }
    }.run, .{});
}
