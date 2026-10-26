//! Surgical UTF-16 property replacement; preserve every non-target byte.
const std = @import("std");
const properties = @import("../body/form_property.zig");
const schema = @import("../body/form_schema.zig");

fn splice(a: std.mem.Allocator, bytes: []const u8, start: usize, end: usize, value: []const u8, limit: usize) ![]u8 {
    if (start > end or end > bytes.len) return error.InvalidFormPropertyRange;
    const size = std.math.add(usize, bytes.len - (end - start), value.len) catch return error.LimitExceeded;
    if (size > limit) return error.LimitExceeded;
    const result = try a.alloc(u8, size);
    @memcpy(result[0..start], bytes[0..start]);
    @memcpy(result[start..][0..value.len], value);
    @memcpy(result[start + value.len ..], bytes[end..]);
    return result;
}

fn replaceCounted(a: std.mem.Allocator, property: properties.Property, value: []const u8, limit: usize) ![]u8 {
    if (value.len % 2 != 0 or (property.kind != .set and property.kind != .wstring)) return error.InvalidFormReplacementValue;
    const prefix = property.value_offset - property.offset;
    if (prefix < 4 or prefix > property.raw.len) return error.InvalidFormPropertyRange;
    const with_value = try splice(a, property.raw, prefix, property.raw.len, value, limit);
    errdefer a.free(with_value);
    // Keep original decimal spelling when its mathematical length is unchanged.
    if (value.len == property.value.len) return with_value;
    var at = prefix - 4;
    while (std.mem.readInt(u16, property.raw[at..][0..2], .little) != ':') {
        if (at < 2) return error.InvalidFormPropertyRange;
        at -= 2;
    }
    const digits = try std.fmt.allocPrint(a, "{d}", .{value.len / 2});
    defer a.free(digits);
    const wide = try std.unicode.utf8ToUtf16LeAlloc(a, digits);
    defer a.free(wide);
    const result = try splice(a, with_value, at + 2, prefix - 2, std.mem.sliceAsBytes(wide), limit);
    a.free(with_value);
    return result;
}

pub fn replaceKnown(a: std.mem.Allocator, bytes: []const u8, kind: @import("../body/form_object.zig").Kind, field: schema.Field, value: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (value.len % 2 != 0) return error.InvalidFormReplacementValue;
    var tree = try @import("../body/form_property_tree.zig").Tree.parseObservedUnits(a, bytes, .{});
    defer tree.deinit(a);
    const report = try schema.inspectObserved(tree, kind);
    var index = report.fields[@backingInt(field)] orelse return error.MissingFormProperty;
    const property = tree.nodes[index].property;
    const choice = field == .value and (kind == .check_box or kind == .radio_button) and property.kind == .integer;
    if (property.kind != .wstring and !choice) return error.UnsupportedFormPropertyEdit;
    // Only the bounded checkbox wire states, never arbitrary scalar injection.
    if (choice and (value.len != 2 or value[1] != 0 or value[0] < '0' or value[0] > '2')) return error.InvalidFormReplacementValue;
    if (choice and kind == .radio_button and value[0] > '1') return error.InvalidFormReplacementValue;
    if (std.mem.eql(u8, tree.nodes[index].property.value, value)) return a.dupe(u8, bytes);
    var replacement = if (choice)
        try splice(a, property.raw, property.value_offset - property.offset, property.raw.len, value, limit)
    else
        try replaceCounted(a, property, value, limit);
    defer a.free(replacement);
    while (tree.nodes[index].parent) |parent| {
        const owner = tree.nodes[parent].property;
        const child = tree.nodes[index].property;
        if (child.offset < owner.value_offset) return error.InvalidFormPropertyRange;
        const at = child.offset - owner.value_offset;
        const body = try splice(a, owner.value, at, at + child.raw.len, replacement, limit);
        defer a.free(body);
        const next = try replaceCounted(a, owner, body, limit);
        a.free(replacement);
        replacement = next;
        index = parent;
    }
    const root = tree.nodes[index].property;
    return splice(a, bytes, root.offset, root.offset + root.raw.len, replacement, limit);
}

test "HWP5 form replacement checkbox scalar preserves unknown fields and ancestor spelling" {
    const a = std.testing.allocator;
    const input = try std.unicode.utf8ToUtf16LeAlloc(a, "Unknown:set:12:Value:int:9  ButtonSet:set:00014:Value:int:000 ");
    defer a.free(input);
    const expected = try std.unicode.utf8ToUtf16LeAlloc(a, "Unknown:set:12:Value:int:9  ButtonSet:set:12:Value:int:2 ");
    defer a.free(expected);
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: []const u8, wanted: []const u8) !void {
            const result = try replaceKnown(allocator, original, .check_box, .value, &.{ '2', 0 }, 131070);
            defer allocator.free(result);
            try std.testing.expectEqualSlices(u8, wanted, result);
        }
    }.run, .{ std.mem.sliceAsBytes(input), std.mem.sliceAsBytes(expected) });
    for ([_][]const u8{ &.{}, &.{ '3', 0 }, &.{ '-', 0, '1', 0 }, &.{ '0', 0, ' ', 0 }, &.{ 0, 0xd8 } }) |bad| {
        try std.testing.expectError(error.InvalidFormReplacementValue, replaceKnown(a, std.mem.sliceAsBytes(input), .check_box, .value, bad, 131070));
    }
    try std.testing.expectError(error.InvalidFormReplacementValue, replaceKnown(a, std.mem.sliceAsBytes(input), .radio_button, .value, &.{ '2', 0 }, 131070));
    const single = try std.unicode.utf8ToUtf16LeAlloc(a, "ButtonSet:set:00012:Value:int:0 ");
    defer a.free(single);
    const same_length_expected = try std.unicode.utf8ToUtf16LeAlloc(a, "ButtonSet:set:00012:Value:int:1 ");
    defer a.free(same_length_expected);
    const same_length = try replaceKnown(a, std.mem.sliceAsBytes(single), .check_box, .value, &.{ '1', 0 }, 131070);
    defer a.free(same_length);
    try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(same_length_expected), same_length);
    const noop = try replaceKnown(a, std.mem.sliceAsBytes(single), .check_box, .value, &.{ '0', 0 }, 131070);
    defer a.free(noop);
    try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(single), noop);
}

test "HWP5 form replacement updates source length words without flattening unknown or noncanonical fields" {
    const a = std.testing.allocator;
    const original = try std.unicode.utf8ToUtf16LeAlloc(a, "Unknown:set:17:Text:wstring:2:ZZ  EditSet:set:00021:Text:wstring:0003:old  ");
    defer a.free(original);
    const value = try std.unicode.utf8ToUtf16LeAlloc(a, "양식😀");
    defer a.free(value);
    const expected = try std.unicode.utf8ToUtf16LeAlloc(a, "Unknown:set:17:Text:wstring:2:ZZ  EditSet:set:19:Text:wstring:4:양식😀  ");
    defer a.free(expected);
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, input: []const u8, replacement: []const u8, wanted: []const u8) !void {
            const actual = try replaceKnown(allocator, input, .edit, .text, replacement, 131070);
            defer allocator.free(actual);
            try std.testing.expectEqualSlices(u8, wanted, actual);
        }
    }.run, .{ std.mem.sliceAsBytes(original), std.mem.sliceAsBytes(value), std.mem.sliceAsBytes(expected) });
    const noop = try replaceKnown(a, std.mem.sliceAsBytes(original), .edit, .text, &.{ 'o', 0, 'l', 0, 'd', 0 }, 131070);
    defer a.free(noop);
    try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(original), noop);
    const same_length = try replaceKnown(a, std.mem.sliceAsBytes(original), .edit, .text, &.{ 'N', 0, 'E', 0, 'W', 0 }, 131070);
    defer a.free(same_length);
    const same_expected = try std.unicode.utf8ToUtf16LeAlloc(a, "Unknown:set:17:Text:wstring:2:ZZ  EditSet:set:00021:Text:wstring:0003:NEW  ");
    defer a.free(same_expected);
    try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(same_expected), same_length);
    const non_unicode = [_]u8{ 0, 0xd8, 0, 0, 0, 0xdc };
    const raw = try replaceKnown(a, std.mem.sliceAsBytes(original), .edit, .text, &non_unicode, 131070);
    defer a.free(raw);
    var raw_tree = try @import("../body/form_property_tree.zig").Tree.parseObservedUnits(a, raw, .{});
    defer raw_tree.deinit(a);
    const raw_schema = try schema.inspectObserved(raw_tree, .edit);
    try std.testing.expectEqualSlices(u8, &non_unicode, raw_schema.get(raw_tree, .text).?.value);
    try std.testing.expectError(error.MissingFormProperty, replaceKnown(a, std.mem.sliceAsBytes(original), .edit, .caption, &.{}, 131070));
    try std.testing.expectError(error.InvalidFormReplacementValue, replaceKnown(a, std.mem.sliceAsBytes(original), .edit, .text, &.{1}, 131070));
    try std.testing.expectError(error.LimitExceeded, replaceKnown(a, std.mem.sliceAsBytes(original), .edit, .text, std.mem.sliceAsBytes(value), 1));
    const simple = try std.unicode.utf8ToUtf16LeAlloc(a, "EditSet:set:18:Text:wstring:3:old");
    defer a.free(simple);
    const large = try a.alloc(u16, 65499);
    defer a.free(large);
    @memset(large, std.mem.nativeToLittle(u16, 'x'));
    const largest = try replaceKnown(a, std.mem.sliceAsBytes(simple), .edit, .text, std.mem.sliceAsBytes(large[0..65498]), 131070);
    defer a.free(largest);
    try std.testing.expectEqual(@as(usize, 131070), largest.len);
    try std.testing.expectError(error.LimitExceeded, replaceKnown(a, std.mem.sliceAsBytes(simple), .edit, .text, std.mem.sliceAsBytes(large), 131070));
}
