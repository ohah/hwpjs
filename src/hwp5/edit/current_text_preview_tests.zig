const std = @import("std");
const a = std.testing.allocator;
fn readOwned(allocator: std.mem.Allocator, session: *const @import("style_preservation.zig").Session, expected: []const u8) !void {
    const result = try session.currentTextPreview(allocator);
    defer allocator.free(result);
    try std.testing.expectEqualSlices(u8, expected, result);
}
test "current native preview shares source framing preserves tokens and handles every allocation failure" {
    for ([_][]const u8{ "charshape", "software", "table-caption" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(bytes);
        const session = try @import("style_preservation.zig").Session.open(a, bytes);
        defer session.close();
        const expected = try @import("../text_preview.zig").encode(a, bytes);
        defer a.free(expected);
        try std.testing.checkAllAllocationFailures(a, readOwned, .{ session, expected });
        const saved = try session.save(a, .{});
        defer a.free(saved.bytes);
        try std.testing.expectEqualSlices(u8, bytes, saved.bytes);
    }
}
