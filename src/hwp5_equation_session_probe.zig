const std = @import("std");
test "HWP5 equation session snapshot actual latex current owners and read-only saved bytes" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/latex.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const Session = @import("hwp5/edit/style_preservation.zig").Session;
    const s = try Session.open(a, input);
    defer s.close();
    var history = try @import("hwp5/edit/editor_history.zig").History.init(a, s, 8, 16 * 1024 * 1024);
    defer history.deinit();
    const before = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(before.bytes);
    const revision = history.revision();
    const stats = history.stats();
    var count: usize = 0;
    for (0..s.sectionCount()) |section| {
        const sites = try s.equationSites(a, section);
        defer a.free(sites);
        const bytes = try s.equationSnapshot(a, section, .version_only);
        defer a.free(bytes);
        var parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
        defer parsed.deinit();
        const rows = parsed.value.object.get("sources").?.array.items;
        try std.testing.expectEqual(sites.len, rows.len);
        for (rows, sites) |row, site| {
            const value = row.object.get("site").?.object;
            try std.testing.expectEqual(@as(i64, @intCast(site.paragraph)), value.get("paragraph").?.integer);
            try std.testing.expectEqual(@as(i64, @intCast(site.equation_node)), value.get("equation_node").?.integer);
            try std.testing.expectEqual(@as(i64, @intCast(site.current_unit)), value.get("current_unit").?.integer);
            count += 1;
        }
    }
    try std.testing.expect(count > 0);
    try std.testing.expectError(error.InvalidSection, s.equationSnapshot(a, s.sectionCount(), .version_only));
    const after = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(after.bytes);
    try std.testing.expectEqualSlices(u8, before.bytes, after.bytes);
    try std.testing.expectEqual(revision, history.revision());
    try std.testing.expectEqualDeep(stats, history.stats());
}
