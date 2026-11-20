const std = @import("std");
const binding = @import("document_text_read_binding.zig");
test "document text anchor read binding rejects no-history ABA despite identical paragraph text" {
    var lifetime: @import("formatting_binding.zig").State = .{};
    try lifetime.open();
    const captured: binding.Stamp = .{ .epoch = lifetime.epoch, .serial = 0 };
    try binding.assertCurrent(captured, lifetime, 0, null);
    try std.testing.expectError(error.StaleDocumentTextReadBinding, binding.assertCurrent(captured, lifetime, 2, null));
    try std.testing.expectError(error.DocumentTextReadBindingRequired, binding.assertCurrent(null, lifetime, 2, null));
    try lifetime.open();
    try std.testing.expectError(error.StaleDocumentTextReadBinding, binding.assertCurrent(captured, lifetime, 0, null));
}
test "document text anchor read binding keeps strict counters separate from existing History revision" {
    var lifetime: @import("formatting_binding.zig").State = .{};
    try lifetime.open();
    try binding.assertCurrent(null, lifetime, 4, 9);
    try std.testing.expectError(error.StaleDocumentTextReadBinding, binding.assertCurrent(.{ .epoch = lifetime.epoch, .serial = 3 }, lifetime, 4, 9));
    lifetime.opened = false;
    try std.testing.expectError(error.EditorNotOpen, binding.assertCurrent(.{ .epoch = lifetime.epoch, .serial = 4 }, lifetime, 4, 9));
}
