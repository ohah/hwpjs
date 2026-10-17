const std = @import("std");
const numbers = @import("table_number_targets.zig");
const objects = @import("cross_reference_object_target.zig");
const rules = @import("control_rules.zig");
const command = @import("cross_reference_command.zig");
fn wire(comptime text: []const u8) [text.len * 2]u8 {
    var bytes: [text.len * 2]u8 = @splat(0);
    for (text, 0..) |ch, i| bytes[i * 2] = ch;
    return bytes;
}
const object = objects.Site{ .section = 0, .record_offset = 12, .control_id = rules.table_id, .instance_id = 123 };
const value = numbers.Value{ .header = .{ .attributes = 4, .number = 0 }, .symbol = 0, .prefix = 0, .suffix = 0, .extra_bytes = 0, .extra_nonzero = false };

test "table number lookup keeps zero missing duplicate and external identities distinct" {
    const t = std.testing;
    const view = try command.View.parse(&wire("?#123;0;1;1;0;"));
    var site = numbers.Site{ .object = object, .caption_numbers = 1, .value = value };
    try t.expectEqual(value, try numbers.storedValue(view, &.{object}, &.{site}));
    try t.expectError(error.UnresolvedCrossReferenceTarget, numbers.storedValue(view, &.{}, &.{site}));
    try t.expectError(error.AmbiguousCrossReferenceTarget, numbers.storedValue(view, &.{ object, object }, &.{site}));
    try t.expectError(error.MissingCrossReferenceTableNumber, numbers.storedValue(view, &.{object}, &.{}));
    try t.expectError(error.AmbiguousCrossReferenceTableNumber, numbers.storedValue(view, &.{object}, &.{ site, site }));
    site.caption_numbers = 0;
    try t.expectError(error.MissingCrossReferenceTableNumber, numbers.storedValue(view, &.{object}, &.{site}));
    site.caption_numbers = 2;
    try t.expectError(error.AmbiguousCrossReferenceTableNumber, numbers.storedValue(view, &.{object}, &.{site}));
    site.caption_numbers = 1;
    site.value = null;
    try t.expectError(error.MissingCrossReferenceTableNumber, numbers.storedValue(view, &.{object}, &.{site}));
    site.value = value;
    site.value.?.header.attributes = 3;
    try t.expectError(error.CrossReferenceNumberKindMismatch, numbers.storedValue(view, &.{object}, &.{site}));
    site.value = value;
    site.value.?.header = .{ .attributes = 0x80000004, .number = 65535 };
    site.value.?.prefix = 0xd800;
    site.value.?.extra_bytes = 7;
    site.value.?.extra_nonzero = true;
    try t.expectEqual(site.value.?, try numbers.storedValue(view, &.{object}, &.{site}));
    site.object.section = 1;
    try t.expectError(error.MissingCrossReferenceTableNumber, numbers.storedValue(view, &.{object}, &.{site}));
    site.object.section = 0;
    site.object.instance_id = 124;
    try t.expectError(error.SourceBindingMismatch, numbers.storedValue(view, &.{object}, &.{site}));
    try t.expectError(error.UnsupportedExternalCrossReference, numbers.storedValue(try command.View.parse(&wire("other.hwp?#123;0;1;0;0;")), &.{object}, &.{}));
    try t.expectError(error.UnsupportedCrossReferenceResultKind, numbers.storedValue(try command.View.parse(&wire("?#123;0;0;0;0;")), &.{object}, &.{}));
    var picture = object;
    picture.control_id = rules.drawing_id;
    try t.expectError(error.CrossReferenceObjectKindMismatch, numbers.storedValue(view, &.{picture}, &.{}));
}

fn eightTargets(a: std.mem.Allocator) ![]numbers.Site {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table-caption.hwp", a, .limited(64000000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.openReadOnly(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var tree = try @import("tree.zig").Tree.parse(a, raw, source.header.version(), .{});
    defer tree.deinit(a);
    const sites = try numbers.collect(a, tree, 0);
    errdefer a.free(sites);
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: @import("tree.zig").Tree, expected: []const numbers.Site) !void {
            const all = try objects.collect(allocator, original, 0);
            defer allocator.free(all);
            const actual = try numbers.collect(allocator, original, 0);
            defer allocator.free(actual);
            try std.testing.expectEqualDeep(expected, actual);
            try std.testing.expectEqual(@as(usize, 8), all.len);
        }
    }.run, .{ tree, sites });
    return sites;
}

test "table number targets actual eight captions preserve scalar ownership and every allocation failure" {
    const a = std.testing.allocator;
    // Tree, decoded section, source CFB and original bytes are already released.
    const sites = try eightTargets(a);
    defer a.free(sites);
    try std.testing.expectEqual(@as(usize, 8), sites.len);
    for (sites, 0..) |site, i| {
        try std.testing.expectEqual(@as(u32, @intCast(1748212109 + i)), site.object.instance_id);
        try std.testing.expectEqual(@as(usize, 1), site.caption_numbers);
        try std.testing.expectEqual(@as(u16, @intCast(i + 1)), site.value.?.header.number);
        try std.testing.expectEqual(@as(u32, 4), site.value.?.header.attributes);
        try std.testing.expectEqual(@as(usize, 0), site.value.?.extra_bytes);
    }
}
