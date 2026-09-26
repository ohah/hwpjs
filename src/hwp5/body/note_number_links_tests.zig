const std = @import("std");
const t = std.testing;
const Tree = @import("tree.zig").Tree;
const Groups = @import("list_groups.zig").Groups;
const links = @import("note_number_links.zig");
const id = @import("control_rules.zig").id;

fn frame(a: std.mem.Allocator, bytes: *std.ArrayList(u8), tag: u32, level: u32, payload: []const u8) !void {
    var header: [4]u8 = undefined;
    std.mem.writeInt(u32, &header, tag | (level << 10) | (@as(u32, @intCast(payload.len)) << 20), .little);
    try bytes.appendSlice(a, &header);
    try bytes.appendSlice(a, payload);
}

fn control(a: std.mem.Allocator, bytes: *std.ArrayList(u8), name: u32, level: u32, number: u16, kind: u32) !void {
    var payload = [_]u8{0} ** 16;
    std.mem.writeInt(u32, payload[0..4], name, .little);
    if (name == id("atno")) {
        std.mem.writeInt(u32, payload[4..8], kind, .little);
        std.mem.writeInt(u16, payload[8..10], number, .little);
    } else std.mem.writeInt(u32, payload[4..8], number, .little);
    try frame(a, bytes, 71, level, &payload);
}

fn run(a: std.mem.Allocator, bytes: []const u8, layout: @import("note_control.zig").Layout) !links.Report {
    var tree = try Tree.parse(a, bytes, .{ .raw = 0x05000300 }, .{});
    defer tree.deinit(a);
    var groups = try Groups.build(a, tree);
    defer groups.deinit(a);
    return links.inspect(tree, groups.items, layout);
}

test "HWP5 note number links diagnose kind number missing and multiple without rejecting" {
    const a = t.allocator;
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(a);
    try control(a, &bytes, id("fn  "), 0, 7, 0);
    var list = [_]u8{0} ** 8;
    std.mem.writeInt(u16, list[0..2], 1, .little);
    try frame(a, &bytes, 72, 1, &list);
    try frame(a, &bytes, 66, 1, &([_]u8{0} ** 22));
    const before_auto = bytes.items.len;
    try control(a, &bytes, id("atno"), 2, 7, 1);
    const good = try run(a, bytes.items, .observed12);
    try t.expectEqual(@as(usize, 1), good.auto_controls);
    try t.expectEqual(@as(usize, 1), good.matching_kinds);
    try t.expectEqual(@as(usize, 1), good.matching_stored_numbers);
    try t.expectEqual(@as(usize, 0), good.notes_without_auto);
    std.mem.writeInt(u32, bytes.items[8..12], 0x10007, .little);
    const wide = try run(a, bytes.items, .observed12);
    try t.expectEqual(@as(usize, 1), wide.mismatched_stored_numbers);
    std.mem.writeInt(u32, bytes.items[8..12], 7, .little);
    const specified = try run(a, bytes.items, .spec8);
    try t.expectEqual(@as(usize, 1), specified.opaque_stored_numbers);
    try t.expectEqual(@as(usize, 0), specified.matching_stored_numbers);
    try control(a, &bytes, id("autn"), 2, 7, 1);
    const wrong_alias = try run(a, bytes.items, .observed12);
    try t.expectEqual(@as(usize, 1), wrong_alias.auto_controls);
    try control(a, &bytes, id("atno"), 2, 8, 2);
    const multi = try run(a, bytes.items, .observed12);
    try t.expectEqual(@as(usize, 1), multi.notes_with_multiple_auto);
    try t.expectEqual(@as(usize, 1), multi.mismatched_kinds);
    try t.expectEqual(@as(usize, 1), multi.mismatched_stored_numbers);
    const missing = try run(a, bytes.items[0..before_auto], .observed12);
    try t.expectEqual(@as(usize, 1), missing.notes_without_auto);
}

test "HWP5 note number links keep sibling and nested note ownership separate" {
    const a = t.allocator;
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(a);
    try control(a, &bytes, id("fn  "), 0, 1, 0);
    var list = [_]u8{0} ** 8;
    std.mem.writeInt(u16, list[0..2], 1, .little);
    try frame(a, &bytes, 72, 1, &list);
    try frame(a, &bytes, 66, 1, &([_]u8{0} ** 22));
    try control(a, &bytes, id("en  "), 2, 2, 0);
    try frame(a, &bytes, 72, 3, &list);
    try frame(a, &bytes, 66, 3, &([_]u8{0} ** 22));
    try control(a, &bytes, id("atno"), 4, 2, 2);
    try control(a, &bytes, id("atno"), 0, 1, 1);
    const result = try run(a, bytes.items, .observed12);
    try t.expectEqual(@as(usize, 1), result.auto_controls);
    try t.expectEqual(@as(usize, 1), result.notes_without_auto);
    try t.expectEqual(@as(usize, 1), result.matching_kinds);
}

test "HWP5 note number links honor explicit observed16 width" {
    const a = t.allocator;
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(a);
    var header = [_]u8{0} ** 20;
    std.mem.writeInt(u32, header[0..4], id("en  "), .little);
    std.mem.writeInt(u32, header[4..8], 65535, .little);
    std.mem.writeInt(u32, header[16..20], 0x12345678, .little);
    try frame(a, &bytes, 71, 0, &header);
    var list = [_]u8{0} ** 8;
    std.mem.writeInt(u16, list[0..2], 1, .little);
    try frame(a, &bytes, 72, 1, &list);
    try frame(a, &bytes, 66, 1, &([_]u8{0} ** 22));
    try control(a, &bytes, id("atno"), 2, 65535, 2);
    const result = try run(a, bytes.items, .observed16);
    try t.expectEqual(@as(usize, 1), result.matching_kinds);
    try t.expectEqual(@as(usize, 1), result.matching_stored_numbers);
    const specified = try run(a, bytes.items, .spec8);
    try t.expectEqual(@as(usize, 1), specified.opaque_stored_numbers);
    var short: std.ArrayList(u8) = .empty;
    defer short.deinit(a);
    try frame(a, &short, 71, 0, header[0..19]);
    try short.appendSlice(a, bytes.items[24..]);
    try t.expectError(error.UnexpectedEnd, run(a, short.items, .observed16));
}

test "HWP5 note number links count automatic numbers across separate direct lists" {
    const a = t.allocator;
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(a);
    try control(a, &bytes, id("fn  "), 0, 7, 0);
    var list = [_]u8{0} ** 8;
    std.mem.writeInt(u16, list[0..2], 1, .little);
    try frame(a, &bytes, 72, 1, &list);
    try frame(a, &bytes, 66, 1, &([_]u8{0} ** 22));
    try control(a, &bytes, id("atno"), 2, 7, 1);
    try frame(a, &bytes, 72, 1, &list);
    try frame(a, &bytes, 66, 1, &([_]u8{0} ** 22));
    try control(a, &bytes, id("atno"), 2, 8, 1);
    const report = try run(a, bytes.items, .observed12);
    try t.expectEqual(@as(usize, 2), report.auto_controls);
    try t.expectEqual(@as(usize, 1), report.notes_with_multiple_auto);
    try t.expectEqual(@as(usize, 2), report.matching_kinds);
    try t.expectEqual(@as(usize, 1), report.matching_stored_numbers);
    try t.expectEqual(@as(usize, 1), report.mismatched_stored_numbers);
}
