//! Observed counted-envelope writer; not a permission or live model mutation API.
const std = @import("std");
pub fn prepare(a: std.mem.Allocator, payload: []const u8, field: @import("../body/form_schema.zig").Field, value: []const u8, limit: usize) ![]u8 {
    const view = try @import("../body/form_object.zig").View.parseObserved(payload);
    // Parsing preserves other profiles. Writing must not guess the DWORD meaning.
    if (view.raw_length != view.properties.len / 2) return error.UnsupportedFormLengthProfile;
    const properties = try @import("form_property_replace.zig").replaceKnown(a, view.properties, view.kind(), field, value, std.math.maxInt(u16) * 2);
    defer a.free(properties);
    if (std.mem.eql(u8, properties, view.properties)) {
        if (payload.len > limit) return error.LimitExceeded;
        return a.dupe(u8, payload);
    }
    const size = std.math.add(usize, 14 + view.extra.len, properties.len) catch return error.LimitExceeded;
    if (size > limit) return error.LimitExceeded;
    const result = try a.alloc(u8, size);
    @memcpy(result[0..8], payload[0..8]);
    std.mem.writeInt(u32, result[8..12], @intCast(properties.len / 2), .little);
    std.mem.writeInt(u16, result[12..14], @intCast(properties.len / 2), .little);
    @memcpy(result[14..][0..properties.len], properties);
    @memcpy(result[14 + properties.len ..], view.extra);
    return result;
}

test "HWP5 form value payload preserves real calendar fields and opaque tail" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/basic/calendar_monthly.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var tree = try @import("source_tree.zig").parse(a, bytes, source.header.version(), .{});
    defer tree.deinit(a);
    var forms = try @import("../body/form_links.zig").collectObservedUnits(a, tree, .{});
    defer forms.deinit(a);
    const old = tree.nodes[forms.forms.forms[0].object_node].record.framing.payload;
    const with_tail = try a.alloc(u8, old.len + 3);
    defer a.free(with_tail);
    @memcpy(with_tail[0..old.len], old);
    @memcpy(with_tail[old.len..], &[_]u8{ 17, 0, 255 });
    const value = try std.unicode.utf8ToUtf16LeAlloc(a, "2026😀");
    defer a.free(value);
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, payload: []const u8, replacement: []const u8) !void {
            const output = try prepare(allocator, payload, .text, replacement, 1_000_000);
            defer allocator.free(output);
            const before = try @import("../body/form_object.zig").View.parseObserved(payload);
            const after = try @import("../body/form_object.zig").View.parseObserved(output);
            try std.testing.expectEqualDeep(before.type_id, after.type_id);
            try std.testing.expectEqualDeep(before.secondary_type_id, after.secondary_type_id);
            try std.testing.expectEqualSlices(u8, before.extra, after.extra);
            try std.testing.expectEqual(after.raw_length, after.properties.len / 2);
            var properties = try @import("../body/form_property_tree.zig").Tree.parseObservedUnits(allocator, after.properties, .{});
            defer properties.deinit(allocator);
            const report = try @import("../body/form_schema.zig").inspectObserved(properties, after.kind());
            try std.testing.expectEqualSlices(u8, replacement, report.get(properties, .text).?.value);
        }
    }.run, .{ with_tail, std.mem.sliceAsBytes(value) });
    const wrong = try a.dupe(u8, old);
    defer a.free(wrong);
    std.mem.writeInt(u32, wrong[8..12], 1, .little);
    try std.testing.expectError(error.UnsupportedFormLengthProfile, prepare(a, wrong, .text, &.{}, 1_000_000));
}
