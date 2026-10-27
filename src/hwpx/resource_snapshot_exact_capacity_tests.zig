//! 이력 스냅샷의 실제 capacity·복원 후 재성장·할당 실패 소유권 회귀.
const std = @import("std");
const Ch = @import("character_resource_values.zig");
const Pa = @import("paragraph_resource_values.zig");
const editor = @import("editor_session.zig");
const history = @import("editor_history.zig");
fn exactGrowth(a: std.mem.Allocator) !void {
    inline for (.{ Ch, Pa }) |M| {
        var values: M.Values = .{};
        defer values.deinit(a);
        var empty = try values.cloneExact(a);
        defer empty.deinit(a);
        try std.testing.expectEqual(@as(usize, 0), empty.entries.capacity);
        const value: M.Entry = if (M == Ch) .{ .source_id = 0, .id = 1, .properties = .{ .bold = true } } else .{ .source_id = 0, .id = 1, .alignment = .RIGHT };
        try values.entries.append(a, value);
        var copied = try values.cloneExact(a);
        defer copied.deinit(a);
        try std.testing.expectEqual(copied.entries.items.len, copied.entries.capacity);
        try std.testing.expectEqualDeep(values.entries.items, copied.entries.items);
        try copied.entries.append(a, value);
        try std.testing.expectEqual(@as(usize, 1), values.entries.items.len);
        try std.testing.expectEqual(@as(usize, 2), copied.entries.items.len);
        var again = try copied.cloneExact(a);
        defer again.deinit(a);
        try std.testing.expectEqual(@as(usize, 2), again.entries.capacity);
        var normal = try values.clone(a);
        defer normal.deinit(a);
        try std.testing.expectEqualDeep(values.entries.items, normal.entries.items);
    }
}
test "HX exact snapshot clone restore growth OOM cleanup" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, exactGrowth, .{});
}

test "HX restored session exact resource growth failure preserves bytes and ownership" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    {
        var h = try history.History.initV2(&s, .{ .max_retained_bytes = 88662 });
        defer h.deinit();
        try std.testing.expect(try h.apply(&s, .{ .kind = .character_properties, .section = 0, .paragraph = 3, .start = 0, .deleted = 1, .inserted = "", .character_properties = .{ .bold = true, .italic = true, .size = 1800 } }));
        try std.testing.expect(try h.apply(&s, .{ .kind = .paragraph_alignment, .section = 0, .paragraph = 3, .start = 0, .deleted = 0, .inserted = "", .paragraph_alignment = .RIGHT }));
        try std.testing.expect(try h.undo(&s));
        try std.testing.expect(try h.redo(&s));
    }
    const before = try s.save();
    defer a.free(before);
    inline for (.{ "character_resources", "paragraph_resources" }) |field| {
        const values = &@field(s, field);
        try std.testing.expectEqual(@as(usize, 1), values.entries.capacity);
        const value = values.entries.items[0];
        var fail = std.testing.FailingAllocator.init(a, .{ .fail_index = 0, .resize_fail_index = 0 });
        try std.testing.expectError(error.OutOfMemory, values.entries.append(fail.allocator(), value));
        try std.testing.expect(fail.has_induced_failure);
        try std.testing.expectEqual(@as(usize, 1), values.entries.items.len);
        try std.testing.expectEqual(@as(usize, 1), values.entries.capacity);
        const after_failure = try s.save();
        defer a.free(after_failure);
        try std.testing.expectEqualSlices(u8, before, after_failure);
        // 복원된 실제 세션의 버퍼가 정상 재성장하고 기존 소유자가 정확히 한 번 해제한다.
        try values.entries.append(a, value);
        try std.testing.expectEqual(@as(usize, 2), values.entries.items.len);
        _ = values.entries.pop();
    }
    const after = try s.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}
