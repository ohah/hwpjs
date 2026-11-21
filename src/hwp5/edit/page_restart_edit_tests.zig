const std = @import("std");
const a = std.testing.allocator;
const edit = @import("page_restart_edit.zig");
const fixture = @import("page_restart_edit_fixture.zig");
const version: @import("../version.zig").Version = .{ .raw = 0x05000300 };
test "H5 existing PAGE restart edits only number and reopens source with UTF16 anchor" {
    const raw = try fixture.make(a, 1, 0, &.{});
    defer a.free(raw);
    const target = try edit.capture(a, raw, version, 0, 3);
    try std.testing.expectEqual(@as(usize, 3), target.source_unit);
    const out = (try edit.write(a, raw, version, target, 65535)).?;
    defer a.free(out);
    const after = try edit.capture(a, out, version, 0, 3);
    try std.testing.expectEqual(@as(u16, 65535), after.number);
    try std.testing.expectEqual(target.source_unit, after.source_unit);
    try std.testing.expectEqual(raw.len, out.len);
    var changed: usize = 0;
    for (raw, out) |before, next| if (before != next) {
        changed += 1;
    };
    try std.testing.expectEqual(@as(usize, 2), changed);
}
test "H5 existing PAGE restart noop still checks exact snapshot" {
    const raw = try fixture.make(a, 7, 0, &.{});
    defer a.free(raw);
    var target = try edit.capture(a, raw, version, 0, 3);
    try std.testing.expect((try edit.write(a, raw, version, target, 7)) == null);
    target.section_digest[0] ^= 1;
    try std.testing.expectError(error.StalePageRestartSnapshot, edit.write(a, raw, version, target, 7));
}
test "H5 existing PAGE restart rejects zero unknown attributes and opaque tail" {
    const raw = try fixture.make(a, 7, 0, &.{});
    defer a.free(raw);
    const target = try edit.capture(a, raw, version, 0, 3);
    try std.testing.expectError(error.InvalidPageRestartNumber, edit.write(a, raw, version, target, 0));
    const flags = try fixture.make(a, 7, 1, &.{});
    defer a.free(flags);
    try std.testing.expectError(error.UnsupportedRestartSplit, edit.capture(a, flags, version, 0, 3));
    const tail = try fixture.make(a, 7, 0, &.{ 0, 0 });
    defer a.free(tail);
    try std.testing.expectError(error.UnsupportedRestartSplit, edit.capture(a, tail, version, 0, 3));
}
test "H5 existing PAGE restart current anchor comes from projected token ownership" {
    const raw = try fixture.make(a, 7, 0, &.{});
    defer a.free(raw);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{raw});
    defer document.deinit(a);
    const target = try edit.capture(a, raw, version, 0, 3);
    const anchor = try edit.currentAnchor(a, raw, version, document.sections[0].paragraphs, target);
    try std.testing.expectEqual(@as(usize, 0), anchor.paragraph);
    try std.testing.expectEqual(@as(u32, 3), anchor.current_unit);
}
test "H5 existing PAGE restart allocation failures never modify borrowed source" {
    const raw = try fixture.make(a, 7, 0, &.{});
    defer a.free(raw);
    const target = try edit.capture(a, raw, version, 0, 3);
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, selected: edit.Target) !void {
            const out = (try edit.write(allocator, bytes, version, selected, 9)).?;
            defer allocator.free(out);
        }
    }.run, .{ raw, target });
    try std.testing.expectEqualDeep(target, try edit.capture(a, raw, version, 0, 3));
}
