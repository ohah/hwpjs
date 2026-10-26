comptime {
    _ = @import("hwpx/paragraph_owned_elements.zig");
    _ = @import("hwpx/character_style_formula_bindings.zig");
    _ = @import("hwpx/paragraph_site_owner.zig");
}

test "formula owned scope preserves real chart current styles without changing saved bytes" {
    const std = @import("std");
    const a = std.testing.allocator;
    const editor = @import("hwpx/editor_session.zig");
    const snapshot = @import("hwpx/character_style_snapshot.zig");
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const ids = try @import("hwpx/character_style_resources.zig").ids(&session);
    defer a.free(ids);
    try std.testing.expect(try session.setCharacterFormat(0, 24, 0, 2, ids[ids.len - 1]));
    try std.testing.expect(try session.splice(0, 20, 0, 4, "100"));
    const saved = try session.save();
    defer a.free(saved);
    const ranges = try snapshot.read(&session, 0, 24);
    defer a.free(ranges);
    try std.testing.expectEqual(@as(usize, 5), ranges[ranges.len - 1].end_unit);
    const repeated = try snapshot.read(&session, 0, 24);
    defer a.free(repeated);
    try std.testing.expectEqualDeep(ranges, repeated);
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, saved, unchanged);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const reopened_ranges = try snapshot.read(&reopened, 0, 24);
    defer a.free(reopened_ranges);
    try std.testing.expectEqualDeep(ranges, reopened_ranges);
}
