//! Public formula transaction allocation failures, independent of draft tests.
const std = @import("std");
const Session = @import("style_preservation.zig").Session;

fn expectValues(editor: *Session, number: []const u8, formula: []const u8) !void {
    const a = std.testing.allocator;
    const numeric = try editor.copyText(a, 0, 19);
    defer a.free(numeric);
    for (number, 0..) |c, i| try std.testing.expectEqual(@as(u16, c), std.mem.readInt(u16, numeric[i * 2 ..][0..2], .little));
    try std.testing.expectEqual(number.len * 2, numeric.len);
    const field = try editor.copyText(a, 0, 23);
    defer a.free(field);
    const span = try @import("../body/field_span.zig").find(field, @import("../body/control_rules.zig").id("%fmu"), 0);
    const text = field[@as(usize, span.start_unit) * 2 .. @as(usize, span.end_unit) * 2];
    try std.testing.expectEqual(formula.len * 2, text.len);
    for (formula, 0..) |c, i| try std.testing.expectEqual(@as(u16, c), std.mem.readInt(u16, text[i * 2 ..][0..2], .little));
}

fn allocationFailures(a: std.mem.Allocator, input: []const u8) !void {
    const editor = try Session.open(a, input);
    defer editor.close();
    editor.apply(.{ .splice_text = .{ .section = 0, .paragraph = 19, .start_unit = 1, .end_unit = 2, .utf8 = "2" } }) catch |err| {
        try expectValues(editor, "11.2\r", "67.5");
        const unchanged = try editor.save(std.testing.allocator, .{});
        defer std.testing.allocator.free(unchanged.bytes);
        try std.testing.expectEqualSlices(u8, input, unchanged.bytes);
        return err;
    };
    try expectValues(editor, "12.2\r", "68.5");
    const saved = editor.save(a, .{ .allow_stale_layout = true }) catch |err| {
        // Save is a read operation: a failed output allocation cannot undo or
        // partially alter the already committed edit.
        try expectValues(editor, "12.2\r", "68.5");
        return err;
    };
    defer a.free(saved.bytes);
    const reopened = try Session.open(a, saved.bytes);
    defer reopened.close();
    try expectValues(reopened, "12.2\r", "68.5");
}

test "public formula session preserves original on failed apply and committed values on failed save allocations" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwp", a, .limited(2_000_000));
    defer a.free(input);
    try std.testing.checkAllAllocationFailures(a, allocationFailures, .{input});
}
