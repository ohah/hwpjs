const std = @import("std");
const Session = @import("style_preservation.zig").Session;

fn storedCount(a: std.mem.Allocator, input: []const u8, section: usize) !i32 {
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, section);
    defer a.free(raw);
    var tree = try @import("source_tree.zig").parse(a, raw, source.header.version(), .{});
    defer tree.deinit(a);
    var groups = try @import("../body/list_groups.zig").Groups.build(a, tree);
    defer groups.deinit(a);
    for (groups.items) |group| if (group.memo) |memo| return memo.header.paragraph_count;
    return error.MissingMemoListHeader;
}

test "actual memo split merge preserves 32 bit stored count and native history" {
    try exercise("reference/rhwp/samples/issue5866/memo_field_hwp5.hwp", 0);
}

test "actual memo split merge supports consecutive English memo markers" {
    try exercise("reference/rhwp/samples/basic/english.hwp", 0);
}

test "actual memo split merge supports aift section two" {
    try exercise("reference/rhwp/samples/aift.hwp", 2);
}

test "actual memo text input saves reopens and restores history" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/basic/english.hwp", a, .limited(8_000_000));
    defer a.free(input);
    const session = try Session.open(a, input);
    defer session.close();
    const flows = try session.paragraphFlow(a, 0);
    defer a.free(flows);
    var target: ?usize = null;
    for (flows) |row| if (row.memo_node != null) {
        target = row.paragraph;
        break;
    };
    const paragraph = target orelse return error.MissingMemoParagraph;
    var protection = try session.textSourceProtection(a, 0);
    defer protection.deinit(a);
    try std.testing.expectEqual(.retained_memo, protection.mode);
    try std.testing.expectEqual(@as(?usize, 15), protection.retained_headers);
    for (flows) |row| if (row.memo_node != null) try std.testing.expect(!protection.protected_paragraphs[row.paragraph]);
    // The root before every memo field is independently writable. Field-bearing
    // roots remain covered by the dedicated memo-body retention regression.
    try std.testing.expect(!protection.protected_paragraphs[0]);
    const before = try session.copyText(a, 0, paragraph);
    defer a.free(before);
    var history = try @import("editor_history.zig").History.init(a, session, 4, 8_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = paragraph, .start_unit = 0, .end_unit = 0, .utf8 = "메모입력" } }));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try Session.open(a, saved.bytes);
    defer reopened.close();
    const actual = try reopened.copyText(a, 0, paragraph);
    defer a.free(actual);
    try std.testing.expectEqualSlices(u8, before, actual[8..]);
    try std.testing.expect(try history.undo(session));
    const undone = try session.save(a, .{});
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, input, undone.bytes);
    try std.testing.expect(try history.redo(session));
}

fn exercise(path: []const u8, section: usize) !void {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
    defer a.free(input);
    const session = try Session.open(a, input);
    defer session.close();
    var history = try @import("editor_history.zig").History.init(a, session, 4, 8_000_000);
    defer history.deinit();
    const flows = try session.paragraphFlow(a, section);
    defer a.free(flows);
    var paragraph: ?usize = null;
    for (flows) |row| if (row.memo_index != null) {
        paragraph = row.paragraph;
        break;
    };
    const target = paragraph orelse return error.MissingMemoParagraph;
    const original_count = try storedCount(a, input, section);
    try std.testing.expect(try history.apply(session, .{ .split_paragraph = .{ .section = section, .paragraph = target, .at_unit = 0 } }));
    const split = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(split.bytes);
    try std.testing.expectEqual(original_count + 1, try storedCount(a, split.bytes, section));
    const reopened = try Session.open(a, split.bytes);
    defer reopened.close();
    const after = try reopened.paragraphFlow(a, section);
    defer a.free(after);
    var memo_paragraphs: usize = 0;
    for (after) |row| if (row.memo_node == flows[target].memo_node) {
        memo_paragraphs += 1;
    };
    try std.testing.expectEqual(@as(usize, @intCast(original_count + 1)), memo_paragraphs);
    // A new session removes a physical source paragraph, unlike merging the
    // generated right-hand draft in the original session below.
    var reopened_history = try @import("editor_history.zig").History.init(a, reopened, 4, 8_000_000);
    defer reopened_history.deinit();
    try std.testing.expect(try reopened_history.apply(reopened, .{ .merge_paragraph = .{ .section = section, .paragraph = target } }));
    const reopened_merged = try reopened.save(a, .{ .allow_stale_layout = true });
    defer a.free(reopened_merged.bytes);
    try std.testing.expectEqual(original_count, try storedCount(a, reopened_merged.bytes, section));
    try std.testing.expect(try reopened_history.undo(reopened));
    const reopened_undone = try reopened.save(a, .{ .allow_stale_layout = true });
    defer a.free(reopened_undone.bytes);
    try std.testing.expectEqualSlices(u8, split.bytes, reopened_undone.bytes);
    try std.testing.expect(try reopened_history.redo(reopened));
    const reopened_redone = try reopened.save(a, .{ .allow_stale_layout = true });
    defer a.free(reopened_redone.bytes);
    try std.testing.expectEqualSlices(u8, reopened_merged.bytes, reopened_redone.bytes);
    try std.testing.expect(try history.undo(session));
    const undone = try session.save(a, .{});
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, input, undone.bytes);
    try std.testing.expect(try history.redo(session));
    try std.testing.expect(try history.apply(session, .{ .merge_paragraph = .{ .section = section, .paragraph = target } }));
    const merged = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(merged.bytes);
    try std.testing.expectEqual(original_count, try storedCount(a, merged.bytes, section));
    try std.testing.expect(try history.undo(session));
    const back_to_split = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(back_to_split.bytes);
    try std.testing.expectEqualSlices(u8, split.bytes, back_to_split.bytes);
}
