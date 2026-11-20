const std = @import("std");
const writer = @import("../record_writer.zig");
const inspect = @import("source_grid_paragraph.zig").inspect;
const a = std.testing.allocator;
const version = @import("../version.zig").Version{ .raw = 0x05000300 };
fn put(comptime T: type, bytes: []u8, at: usize, value: T) void {
    std.mem.writeInt(T, bytes[at..][0..@sizeOf(T)], value, .little);
}
fn fixture(allocator: std.mem.Allocator, mismatch: bool, extra_owned: bool) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(allocator);
    var header: [22]u8 = @splat(0);
    put(u32, &header, 0, 9);
    put(u32, &header, 4, 1 << 11);
    put(u16, &header, 12, 1);
    try writer.append(allocator, &out, 66, 0, &header, 4096);
    var text: [18]u8 = @splat(0);
    put(u16, &text, 0, 11);
    put(u32, &text, 2, if (mismatch) @import("../body/control_rules.zig").id("tbl ") else @import("../body/control_rules.zig").id("gso "));
    put(u16, &text, 14, 11);
    put(u16, &text, 16, 13);
    try writer.append(allocator, &out, 67, 1, &text, 4096);
    try writer.append(allocator, &out, 68, 1, &(@as([8]u8, @splat(0))), 4096);
    var control: [40]u8 = @splat(0);
    put(u32, &control, 0, @import("../body/control_rules.zig").drawing_id);
    try writer.append(allocator, &out, 71, 1, &control, 4096);
    var component: [100]u8 = @splat(0);
    put(u32, &component, 0, @import("../body/control_rules.zig").id("$pic"));
    put(u32, &component, 4, @import("../body/control_rules.zig").id("$pic"));
    try writer.append(allocator, &out, 76, 2, &component, 4096);
    try writer.append(allocator, &out, 85, 3, &(@as([73]u8, @splat(0))), 4096);
    if (extra_owned) try writer.append(allocator, &out, 900, 3, "unknown", 4096);
    return out.toOwnedSlice(allocator);
}

// Independent atno control preceding the picture, or a numbered-only paragraph.
// The existing caption flag must still control number admission.
fn numberedFixture(raw: []const u8, with_picture: bool) ![]u8 {
    var records = @import("../record.zig").Iterator.init(raw, .{});
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    while (try records.next()) |record| {
        if (record.tag == 66) {
            var header: [22]u8 = undefined;
            @memcpy(&header, record.payload);
            put(u32, &header, 0, if (with_picture) 17 else 9);
            put(u32, &header, 4, (1 << 18) | (if (with_picture) @as(u32, 1 << 11) else 0));
            try writer.append(a, &out, 66, 0, &header, 4096);
        } else if (record.tag == 67) {
            var text: [34]u8 = @splat(0);
            put(u16, &text, 0, 18);
            put(u32, &text, 2, @import("../body/control_rules.zig").id("atno"));
            put(u16, &text, 14, 18);
            if (with_picture) @memcpy(text[16..], record.payload) else put(u16, &text, 16, 13);
            try writer.append(a, &out, 67, 1, text[0..if (with_picture) 34 else 18], 4096);
        } else if (record.tag == 71) {
            var number: [16]u8 = @splat(0);
            put(u32, &number, 0, @import("../body/control_rules.zig").id("atno"));
            put(u32, &number, 4, 4);
            put(u16, &number, 8, 1);
            try writer.append(a, &out, 71, 1, &number, 4096);
            if (with_picture) try out.appendSlice(a, record.raw);
        } else if (record.tag == 68 or with_picture) try out.appendSlice(a, record.raw);
    }
    return out.toOwnedSlice(a);
}

test "source column HWP5 picture paragraph preserves raw anchor and strict policy boundary" {
    const raw = try fixture(a, false, false);
    defer a.free(raw);
    const before = try a.dupe(u8, raw);
    defer a.free(before);
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.UnsupportedSourceTableGrid, inspect(tree, 0, tree.nodes.len, false, .validated_cache));
    const result = try inspect(tree, 0, tree.nodes.len, false, .retained_picture_cache);
    try std.testing.expectEqual(@as(usize, 1), result.pictures);
    try std.testing.expectEqualSlices(u8, before, raw);
    for ([_]bool{ false, true }) |with_picture| {
        const numbered = try numberedFixture(raw, with_picture);
        defer a.free(numbered);
        var numbered_tree = try @import("source_tree.zig").parse(a, numbered, version, .{});
        defer numbered_tree.deinit(a);
        // Ordinary cell paragraphs do not gain permission to contain numbers.
        try std.testing.expectError(error.UnsupportedSourceTableGrid, inspect(numbered_tree, 0, numbered_tree.nodes.len, false, .retained_picture_cache));
        const allowed = try inspect(numbered_tree, 0, numbered_tree.nodes.len, true, if (with_picture) .retained_picture_cache else .validated_cache);
        try std.testing.expectEqual(@as(usize, 1), allowed.numbers);
        try std.testing.expectEqual(@as(usize, @intFromBool(with_picture)), allowed.pictures);
    }
}

test "source column HWP5 picture refuses mismatched anchor and unknown owned record" {
    for ([_]bool{ false, true }) |extra| {
        const raw = try fixture(a, !extra, extra);
        defer a.free(raw);
        var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
        defer tree.deinit(a);
        try std.testing.expectError(error.UnsupportedSourceTableGrid, inspect(tree, 0, tree.nodes.len, false, .retained_picture_cache));
    }
}

test "source column HWP5 observed8 keeps full attributes separate from unknown word" {
    var raw: [47]u8 = @splat(0);
    put(u16, &raw, 0, 1);
    for ([_]u32{ 0x20, 0x40, 0x01000020, 0x04000020 }) |flags| {
        put(u32, &raw, 4, flags);
        const header = try @import("../body/list_header.zig").Header.parse(&raw);
        const view = try header.view(.observed8);
        try std.testing.expectEqual(@as(?u16, 0), view.unknown);
        try std.testing.expectEqual(flags, view.attributes);
        try std.testing.expectEqual(@as(u3, 0), view.direction());
        try std.testing.expectEqual(@as(u2, 0), view.wrapping());
        try std.testing.expectEqual(@as(u2, if (flags == 0x40) 2 else 1), view.alignment());
        try std.testing.expect(!@import("../body/cell_attributes.zig").Attributes.fromList(view).isProtected());
        put(u32, &raw, 4, flags | (1 << 17));
        const protected = try (try @import("../body/list_header.zig").Header.parse(&raw)).view(.observed8);
        try std.testing.expect(@import("../body/cell_attributes.zig").Attributes.fromList(protected).isProtected());
    }
}
