//! Paired private drafts: source cold stays left, right is a plain continuation.
const std = @import("std");
const model = @import("../../model/document.zig");
const Draft = @import("paragraph_split.zig").Draft;
pub fn prepare(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, p: model.Paragraph, at: u32, id: u32, char_count: usize) !Draft {
    if (id == 0 or id == p.instance_id) return error.InvalidParagraphInstanceId;
    try @import("column_split_scope.zig").validate(a, source, version, p, at, char_count);
    const bytes = try @import("plain_text_content.zig").editableTextBytes(a, p);
    defer a.free(bytes);
    try @import("character_runs.zig").validate(p.character_runs, bytes, char_count);
    const end: u32 = @intCast(bytes.len / 2 - 1);
    const left_bytes = try a.alloc(u8, @as(usize, at) * 2 + 2);
    defer a.free(left_bytes);
    @memcpy(left_bytes[0 .. left_bytes.len - 2], bytes[0 .. @as(usize, at) * 2]);
    left_bytes[left_bytes.len - 2 ..][0..2].* = .{ 13, 0 };
    const right_bytes = bytes[@as(usize, at) * 2 ..];
    try @import("plain_text_content.zig").validatePlain(right_bytes);
    var left = try @import("../../model/clone.zig").paragraph(a, p);
    errdefer left.deinit(a);
    var right = try @import("../../model/clone.zig").paragraph(a, p);
    errdefer right.deinit(a);
    try replace(a, &left, left_bytes, at, end);
    try replace(a, &right, right_bytes, 0, at);
    right.source_node = null;
    right.header_template = p.source_node;
    right.instance_id = id;
    right.deferred_direct_records = 0;
    return .{ .left = left, .right = right };
}
fn replace(a: std.mem.Allocator, p: *model.Paragraph, bytes: []const u8, start: u32, end: u32) !void {
    // Non-null empty ranges mark a materialized text edit for the existing writer.
    const ranges = try a.alloc(model.TextRange, 0);
    errdefer a.free(ranges);
    const runs = try @import("character_runs.zig").replace(a, p.character_runs, start, end, 0, null);
    errdefer a.free(runs);
    const tokens = try @import("token_ownership.zig").fromText(a, bytes);
    for (p.tokens) |token| a.free(token.raw);
    a.free(p.tokens);
    a.free(p.character_runs);
    if (p.range_tags) |old| a.free(old);
    p.tokens = tokens;
    p.character_runs = runs;
    p.range_tags = ranges;
    p.text_present = true;
    p.declared_units = @intCast(bytes.len / 2);
}

test "HWP5 column split paired draft retains cold prefix plain suffix and allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/multicolumns-widths.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer document.deinit(a);
    const p = document.sections[0].paragraphs[1];
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, paragraph: model.Paragraph) !void {
            var draft = try prepare(allocator, bytes, version, paragraph, 8, 0xfffffffe, 1000);
            defer draft.deinit(allocator);
            const original = try @import("plain_text_content.zig").textBytes(allocator, paragraph);
            defer allocator.free(original);
            const left = try @import("plain_text_content.zig").textBytes(allocator, draft.left);
            defer allocator.free(left);
            const right = try @import("plain_text_content.zig").textBytes(allocator, draft.right);
            defer allocator.free(right);
            try std.testing.expectEqualSlices(u8, original[0..16], left[0..16]);
            try std.testing.expectEqualSlices(u8, original[16..], right);
            try std.testing.expectEqual(paragraph.source_node, draft.left.source_node);
            try std.testing.expect(draft.right.source_node == null);
            try std.testing.expectEqual(@as(usize, 0), draft.right.deferred_direct_records);
        }
    }.run, .{ raw, source.header.version(), p });
}

test "HWP5 column split native session retains declaration and saves generated continuation" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/multicolumns-widths.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    const Session = @import("style_preservation.zig").Session;
    const s = try Session.open(a, bytes);
    defer s.close();
    try s.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 1, .at_unit = 8 } });
    try std.testing.expectEqual(@as(usize, 4), try s.paragraphCount(0));
    const columns = try s.columnSources(a, 0);
    defer @import("column_sources_snapshot.zig").free(a, columns);
    try std.testing.expectEqual(@as(?usize, 1), columns[1].current_paragraph);
    try std.testing.expectEqual(@as(?usize, 3), columns[2].current_paragraph);
    try std.testing.expectEqual(@as(?u32, 0), columns[1].current_unit);
    try s.apply(.{ .splice_text = .{ .section = 0, .paragraph = 1, .start_unit = 0, .end_unit = 0, .utf8 = "앞😀" } });
    const shifted = try s.columnSources(a, 0);
    defer @import("column_sources_snapshot.zig").free(a, shifted);
    try std.testing.expectEqual(@as(?u32, 3), shifted[1].current_unit);
    const saved = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try Session.open(a, saved.bytes);
    defer reopened.close();
    try std.testing.expectEqual(@as(usize, 4), try reopened.paragraphCount(0));
    const left = try s.copyText(a, 0, 1);
    defer a.free(left);
    const reopened_left = try reopened.copyText(a, 0, 1);
    defer a.free(reopened_left);
    try std.testing.expectEqualSlices(u8, left, reopened_left);
}

test "HWP5 column split full session allocation failures retain original on refused transaction" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/multicolumns-widths.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const before = try a.dupe(u8, input);
    defer a.free(before);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            const Session = @import("style_preservation.zig").Session;
            const s = try Session.open(allocator, bytes);
            defer s.close();
            s.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 1, .at_unit = 8 } }) catch |err| {
                // Independent healthy allocator observes state after failed apply.
                const unchanged = try s.save(std.testing.allocator, .{});
                defer std.testing.allocator.free(unchanged.bytes);
                try std.testing.expectEqualSlices(u8, bytes, unchanged.bytes);
                try std.testing.expectEqual(@as(usize, 3), try s.paragraphCount(0));
                return err;
            };
            const saved = try s.save(allocator, .{ .allow_stale_layout = true });
            defer allocator.free(saved.bytes);
            const reopened = try Session.open(allocator, saved.bytes);
            defer reopened.close();
            const left = try s.copyText(allocator, 0, 1);
            defer allocator.free(left);
            const actual = try reopened.copyText(allocator, 0, 1);
            defer allocator.free(actual);
            try std.testing.expectEqualSlices(u8, left, actual);
            try std.testing.expectEqual(@as(usize, 4), try reopened.paragraphCount(0));
        }
    }.run, .{input});
    try std.testing.expectEqualSlices(u8, before, input);
}
