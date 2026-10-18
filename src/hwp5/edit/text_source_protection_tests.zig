const std = @import("std");
const protection = @import("text_source_protection.zig");
const fixture = @import("click_retained_fixture.zig");
const model = @import("../../model/document.zig");

fn allocationCase(a: std.mem.Allocator, bytes: []const u8) !void {
    var document = try @import("../model_projection.zig").fromDecodedSections(a, fixture.version, &.{bytes});
    defer document.deinit(a);
    var value = try protection.read(a, &.{bytes}, fixture.version, 0, document.sections[0]);
    defer value.deinit(a);
    try std.testing.expectEqual(.retained_click, value.mode);
    try std.testing.expectEqual(@as(?usize, 1), value.retained_headers);
    try std.testing.expectEqualSlices(bool, &.{ false, true }, value.protected_paragraphs);
    try std.testing.expectEqual(@as(u32, 10), document.sections[0].paragraphs[0].declared_units);
}
test "text protection extra map releases every partial allocation without mutating model" {
    const a = std.testing.allocator;
    const bytes = try fixture.bytes(a);
    defer a.free(bytes);
    try @import("../../testing/allocation_failures.zig").check(allocationCase, .{bytes});
}
test "text protection never recovers unsupported or unresolved unselected sections" {
    const a = std.testing.allocator;
    const bytes = try fixture.bytes(a);
    defer a.free(bytes);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, fixture.version, &.{bytes});
    defer document.deinit(a);
    try std.testing.expectError(error.UnsupportedCrossParagraphField, protection.read(a, &.{ bytes, bytes }, fixture.version, 0, document.sections[0]));
    const bad = [_]u8{ 71, 0, 64, 0, 'z', 'z', 'z', 'z' };
    try std.testing.expectError(error.UnsupportedSectionControl, protection.read(a, &.{ bytes, &bad }, fixture.version, 0, document.sections[0]));
    try std.testing.expectError(error.InvalidSection, protection.read(a, &.{bytes}, fixture.version, 1, document.sections[0]));
}
