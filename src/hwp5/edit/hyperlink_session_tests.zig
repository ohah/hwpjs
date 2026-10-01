//! Public cross-paragraph transaction failures, including output/reopen.
const std = @import("std");
const Session = @import("style_preservation.zig").Session;

fn allocationFailures(a: std.mem.Allocator, input: []const u8) !void {
    const editor = try Session.open(a, input);
    defer editor.close();
    const stable = std.testing.allocator;
    const owner = try editor.copyText(stable, 0, 1);
    defer stable.free(owner);
    const target = try editor.copyText(stable, 0, 2);
    defer stable.free(target);
    editor.apply(.{ .splice_text = .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 4, .utf8 = "한😀" } }) catch |err| {
        const current_owner = try editor.copyText(stable, 0, 1);
        defer stable.free(current_owner);
        const current_target = try editor.copyText(stable, 0, 2);
        defer stable.free(current_target);
        try std.testing.expectEqualSlices(u8, owner, current_owner);
        try std.testing.expectEqualSlices(u8, target, current_target);
        const unchanged = try editor.save(stable, .{});
        defer stable.free(unchanged.bytes);
        try std.testing.expectEqualSlices(u8, input, unchanged.bytes);
        return err;
    };
    const committed = try editor.copyText(stable, 0, 2);
    defer stable.free(committed);
    try std.testing.expect(!std.mem.eql(u8, target, committed));
    const current_owner = try editor.copyText(stable, 0, 1);
    defer stable.free(current_owner);
    try std.testing.expectEqualSlices(u8, owner, current_owner);
    const saved = editor.save(a, .{ .allow_stale_layout = true }) catch |err| {
        const still_committed = try editor.copyText(stable, 0, 2);
        defer stable.free(still_committed);
        try std.testing.expectEqualSlices(u8, committed, still_committed);
        return err;
    };
    defer a.free(saved.bytes);
    const reopened = try Session.open(a, saved.bytes);
    defer reopened.close();
    const recovered = try reopened.copyText(stable, 0, 2);
    defer stable.free(recovered);
    try std.testing.expectEqualSlices(u8, committed, recovered);
}

test "public crossing hyperlink session is atomic across all allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwp", a, .limited(2_000_000));
    defer a.free(input);
    try std.testing.checkAllAllocationFailures(a, allocationFailures, .{input});
}
