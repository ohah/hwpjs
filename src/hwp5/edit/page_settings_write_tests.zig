const std = @import("std");
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const t = @import("page_settings_types.zig");
const values: t.Values = .{ .orientation = .narrowly, .width = 64800, .height = 86400, .gutter_type = .top_bottom, .margin = .{ .header = 1800, .footer = 1800, .gutter = 720, .left = 7200, .right = 3600, .top = 3600, .bottom = 5400 } };
fn input(a: std.mem.Allocator) ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, "apps/docs/docs/public/editor/fixtures/page.hwp", a, .limited(4000000));
}
fn request(s: *edit.Session, target: *[1]t.Target, a: std.mem.Allocator) !t.Request {
    target[0] = .{ .section = 0, .expected = try s.pageSettings(a, 0) };
    return .{ .binding = .{ .session = "native-only-test", .revision = 0, .serial = "0" }, .scope = .section, .targets = target, .values = values };
}
test "H5 page settings integrated single history canonical geometry undo redo and reopen" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    const before = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(before.bytes);
    var target: [1]t.Target = undefined;
    var r = try request(s, &target, a);
    try std.testing.expect(try h.apply(s, .{ .edit_page_settings = &r }));
    try std.testing.expectEqual(@as(u32, 1), h.revision());
    const snapshot = try s.pageSettings(a, 0);
    try std.testing.expectEqual(@as(u32, 5), snapshot.flags);
    try std.testing.expectEqual(@as(u32, 64800), snapshot.width);
    const after = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(after.bytes);
    r = try request(s, &target, a);
    try std.testing.expect(!try h.apply(s, .{ .edit_page_settings = &r }));
    try std.testing.expectEqual(@as(u32, 1), h.revision());
    try std.testing.expect(try h.undo(s));
    const undo = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(undo.bytes);
    try std.testing.expectEqualSlices(u8, before.bytes, undo.bytes);
    try std.testing.expect(try h.redo(s));
    const redo = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(redo.bytes);
    try std.testing.expectEqualSlices(u8, after.bytes, redo.bytes);
    const reopened = try edit.Session.open(a, after.bytes);
    defer reopened.close();
    try std.testing.expectEqualDeep(snapshot, try reopened.pageSettings(a, 0));
}
test "H5 page settings integrated invalid expected or document targets preserve source and revision" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    var target: [1]t.Target = undefined;
    var r = try request(s, &target, a);
    target[0].expected.flags ^= 8;
    try std.testing.expectError(error.StalePageSettingsSnapshot, h.apply(s, .{ .edit_page_settings = &r }));
    r = try request(s, &target, a);
    r.values.width = 0;
    try std.testing.expectError(error.InvalidPageSettingsGeometry, h.apply(s, .{ .edit_page_settings = &r }));
    r = try request(s, &target, a);
    r.scope = .document;
    r.targets = &.{};
    try std.testing.expectError(error.InvalidPageSettingsTargets, h.apply(s, .{ .edit_page_settings = &r }));
    try std.testing.expectEqual(@as(u32, 0), h.revision());
}
test "H5 page settings integrated allocation failures preserve native source revision and redo" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    var tested: usize = 0;
    for (0..10000) |point| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const f = failing.allocator();
        const s = try edit.Session.open(f, bytes);
        defer s.close();
        s.enableHistoryDelta();
        var h = try History.initV2(f, s, .{});
        defer h.deinit();
        var target: [1]t.Target = undefined;
        var r = try request(s, &target, f);
        try std.testing.expect(try h.apply(s, .{ .edit_page_settings = &r }));
        const first = try s.save(a, .{ .allow_stale_layout = true });
        defer a.free(first.bytes);
        try std.testing.expect(try h.undo(s));
        const before = try s.save(a, .{ .allow_stale_layout = true });
        defer a.free(before.bytes);
        r = try request(s, &target, f);
        r.values.width = 65000;
        failing.fail_index = failing.alloc_index + point;
        const changed = h.apply(s, .{ .edit_page_settings = &r }) catch |err| {
            failing.fail_index = std.math.maxInt(usize);
            if (err != error.OutOfMemory) return err;
            const after = try s.save(a, .{ .allow_stale_layout = true });
            defer a.free(after.bytes);
            try std.testing.expectEqualSlices(u8, before.bytes, after.bytes);
            try std.testing.expectEqual(@as(u32, 0), h.revision());
            try std.testing.expectEqual(@as(usize, 1), h.stats().redoCount);
            try std.testing.expect(!h.stats().poisoned);
            try std.testing.expect(try h.redo(s));
            const redone = try s.save(a, .{ .allow_stale_layout = true });
            defer a.free(redone.bytes);
            try std.testing.expectEqualSlices(u8, first.bytes, redone.bytes);
            tested += 1;
            continue;
        };
        failing.fail_index = std.math.maxInt(usize);
        try std.testing.expect(changed);
        break;
    }
    try std.testing.expect(tested > 0 and tested < 10000);
    std.debug.print("{d} H5 page-settings apply allocation rollback points with redo retained\n", .{tested});
}

test "H5 page settings integrated two-section scope prepares atomically and keeps non-target raw bytes" {
    const a = std.testing.allocator;
    const bytes = try @import("../test_section_count_fixture.zig").make(a, 2, &.{ "Section0", "Section1" });
    defer a.free(bytes);
    const s = try edit.Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    var target = [_]t.Target{.{ .section = 1, .expected = try s.pageSettings(a, 1) }};
    var r: t.Request = .{ .binding = .{ .session = "test", .revision = 0, .serial = "0" }, .scope = .section, .targets = &target, .values = values };
    const original = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(original.bytes);
    try std.testing.expect(try h.apply(s, .{ .edit_page_settings = &r }));
    const single = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(single.bytes);
    const Source = @import("../text_source.zig").Source;
    var first = try Source.open(a, original.bytes);
    defer first.deinit();
    var second = try Source.open(a, single.bytes);
    defer second.deinit();
    const old = try first.decodeSection(a, 0);
    defer a.free(old);
    const current = try second.decodeSection(a, 0);
    defer a.free(current);
    try std.testing.expectEqualSlices(u8, old, current);
    var all = [_]t.Target{ .{ .section = 0, .expected = try s.pageSettings(a, 0) }, .{ .section = 1, .expected = try s.pageSettings(a, 1) } };
    r.scope = .document;
    r.targets = &all;
    try std.testing.expect(try h.apply(s, .{ .edit_page_settings = &r }));
    try std.testing.expect(@import("page_settings_types.zig").equal(try s.pageSettings(a, 0), values));
    try std.testing.expect(@import("page_settings_types.zig").equal(try s.pageSettings(a, 1), values));
    const both = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(both.bytes);
    try std.testing.expect(try h.undo(s));
    const undo = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(undo.bytes);
    try std.testing.expectEqualSlices(u8, single.bytes, undo.bytes);
    try std.testing.expect(try h.redo(s));
    const redo = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(redo.bytes);
    try std.testing.expectEqualSlices(u8, both.bytes, redo.bytes);
}

test "H5 page settings integrated unknown cache owner flags and children refuse without erasing source" {
    const a = std.testing.allocator;
    const fixture = @import("../document/test_fixture.zig");
    const base = try fixture.section(a);
    defer a.free(base);
    var raw: std.ArrayList(u8) = .empty;
    defer raw.deinit(a);
    try raw.appendSlice(a, base);
    try fixture.frame(a, &raw, 900, 0, &.{ 1, 2, 3 });
    try fixture.frame(a, &raw, 69, 1, &(@as([36]u8, @splat(0))));
    try std.testing.expectError(error.UnsupportedPageLayoutCache, @import("page_settings_section.zig").write(a, raw.items, .{ .raw = 0x05000107 }, values));
    raw.clearRetainingCapacity();
    try raw.appendSlice(a, base);
    var line: [36]u8 = @splat(0);
    std.mem.writeInt(u32, line[32..36], 8, .little);
    try fixture.frame(a, &raw, 69, 1, &line);
    try std.testing.expectError(error.UnsupportedPageLayoutCache, @import("page_settings_section.zig").write(a, raw.items, .{ .raw = 0x05000107 }, values));
    raw.clearRetainingCapacity();
    try raw.appendSlice(a, base);
    @memset(&line, 0);
    try fixture.frame(a, &raw, 69, 1, &line);
    try fixture.frame(a, &raw, 900, 2, &.{ 1, 2, 3 });
    try std.testing.expectError(error.UnsupportedPageLayoutCache, @import("page_settings_section.zig").write(a, raw.items, .{ .raw = 0x05000107 }, values));
}
