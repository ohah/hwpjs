const std = @import("std");
const common = @import("model/formatting_source_values.zig");
const Cache = @import("model/batch_font_lookup.zig").Cache;
test "atomic formatting regression: font: font face request index preserves first duplicate and linear visits" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    for ([_]usize{ 16, 32, 64 }) |n| {
        const faces = try a.alloc(@import("model/font_face_value.zig").Value, n * 7);
        for (faces, 0..) |*face, i| face.* = .{ .language = @fromBackingInt(@intCast(i % 7)), .id = @intCast(i / 7), .name = @constCast("first") };
        var index = try common.FontFaceIndex.init(a, faces);
        defer index.deinit();
        const ids: @import("model/character_fonts.zig").Values = @splat(0);
        for (0..n) |_| {
            const raw = try common.fontNames(a, ids, faces);
            const fast = try common.fontNamesIndexed(a, ids, faces, &index);
            const l = try std.json.Stringify.valueAlloc(a, raw, .{});
            const r = try std.json.Stringify.valueAlloc(a, fast, .{});
            try std.testing.expectEqualStrings(l, r);
        }
        try std.testing.expectEqual(n * 7, index.visits);
        std.debug.print("FONT_COUNTS targets={d} faces={d} visits={d}\n", .{ n, faces.len, index.visits });
    }
    const faces = [_]@import("model/font_face_value.zig").Value{ .{ .language = .hangul, .id = 0, .name = null }, .{ .language = .hangul, .id = 0, .name = @constCast("second") } };
    var index = try common.FontFaceIndex.init(a, &faces);
    defer index.deinit();
    const ids: @import("model/character_fonts.zig").Values = @splat(0);
    const raw = try common.fontField(a, ids, &faces, "character.fonts.hangul.name");
    const fast = try common.fontFieldIndexed(a, ids, &faces, "character.fonts.hangul.name", &index);
    try std.testing.expectEqualStrings(try std.json.Stringify.valueAlloc(a, raw, .{}), try std.json.Stringify.valueAlloc(a, fast, .{}));
}
test "atomic formatting regression: font: successful font ensure memo has seven misses per uniform seven-language batch" {
    for ([_]usize{ 16, 32, 64 }) |n| {
        var cache: Cache = .{};
        for (0..n) |_| for (0..7) |language| {
            const id = cache.get(language, "name") orelse blk: {
                cache.put(language, "name", @intCast(language));
                break :blk @as(u32, @intCast(language));
            };
            try std.testing.expectEqual(@as(u32, @intCast(language)), id);
        };
        try std.testing.expectEqual(@as(usize, 7), cache.misses);
        try std.testing.expectEqual((n - 1) * 7, cache.hits);
        cache.clear();
        try std.testing.expectEqual(@as(?u32, null), cache.get(0, "name"));
    }
}
test "atomic formatting regression: font: validated plain boundary plan preserves canonical errors over all endpoints" {
    const a = std.testing.allocator;
    const paint = @import("hwpx/character_style_paint.zig");
    var text = [_]u8{ 'a', 'b', 0xf0, 0x9f, 0x98, 0x80, 'c', 'd' };
    var rows = [_]@import("hwpx/text_sites.zig").Site{.{ .element_index = 0, .start = 0, .end = text.len, .text = &text }};
    const sites = @import("hwpx/text_sites.zig").Sites{ .items = &rows };
    const spans = [_]paint.Span{ .{ .start_unit = 0, .end_unit = 2, .site_start_unit = 0, .site_index = 0, .run_element = 0, .char_shape_id = 7 }, .{ .start_unit = 2, .end_unit = 6, .site_start_unit = 0, .site_index = 0, .run_element = 0, .char_shape_id = 8 } };
    const first = try paint.prepare(a, &sites, &spans, 0, 1, 7, &.{ 7, 8 }, 64);
    a.free(first);
    var plan = (try paint.afterValidatedPlain(a, &sites, &spans, 64)).?;
    defer plan.deinit(a);
    for (0..8) |start| for (0..8) |end| {
        if (paint.prepare(a, &sites, &spans, @intCast(start), @intCast(end), 7, &.{ 7, 8 }, 64)) |output| {
            a.free(output);
            try plan.validate(@intCast(start), @intCast(end));
        } else |expected| {
            try std.testing.expectError(expected, plan.validate(@intCast(start), @intCast(end)));
        }
    };
    try std.testing.expectEqual(@as(usize, 5), plan.scalar_reads);
    try std.testing.expect((try paint.afterValidatedPlain(a, &sites, &spans, 3)) == null);
}

fn probe(a: std.mem.Allocator) !void {
    const faces = [_]@import("model/font_face_value.zig").Value{ .{ .language = .hangul, .id = 0, .name = @constCast("a") }, .{ .language = .latin, .id = 0, .name = @constCast("b") }, .{ .language = .hangul, .id = 0, .name = @constCast("duplicate") } };
    var index = try common.FontFaceIndex.init(a, &faces);
    defer index.deinit();
}
test "atomic formatting regression: font index exact allocation cleanup" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, probe, .{});
}
