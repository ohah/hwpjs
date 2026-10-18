//! Source-only JSON boundary. Attribute keys come from the native field enums.
const std = @import("std");
const attributes = @import("../hwpx/form_attribute_values.zig");
const Wrapper = struct {
    value: attributes.Values,
    pub fn jsonStringify(self: Wrapper, writer: anytype) !void {
        try writer.beginObject();
        try writer.objectField("sourceOnly");
        try writer.write(true);
        try writer.objectField("kind");
        try writer.write(@tagName(self.value.kind));
        try writer.objectField("strings");
        try writer.beginObject();
        inline for (@import("../reflection.zig").fields(attributes.StringField), 0..) |field, index| {
            try writer.objectField(field.name);
            try writer.write(self.value.strings[index]);
        }
        try writer.endObject();
        try writer.objectField("booleans");
        try writer.beginObject();
        inline for (@import("../reflection.zig").fields(attributes.BooleanField), 0..) |field, index| {
            try writer.objectField(field.name);
            try writer.write(self.value.booleans[index]);
        }
        try writer.endObject();
        try writer.objectField("integers");
        try writer.beginObject();
        inline for (@import("../reflection.zig").fields(attributes.IntegerField), 0..) |field, index| {
            try writer.objectField(field.name);
            try writer.write(self.value.integers[index]);
        }
        try writer.endObject();
        try writer.endObject();
    }
};
pub fn encode(a: std.mem.Allocator, value: attributes.Values) ![]u8 {
    if (!@import("../hwpx/run_anchor.zig").isForm(value.kind)) return error.InvalidFormNode;
    const bytes = try std.json.Stringify.valueAlloc(a, Wrapper{ .value = value }, .{});
    errdefer a.free(bytes);
    if (bytes.len > 1024 * 1024) return error.LimitExceeded;
    return bytes;
}
fn allocationCase(a: std.mem.Allocator) !void {
    var value: attributes.Values = .{ .kind = .check_button };
    defer value.deinit(a);
    value.strings[@backingInt(attributes.StringField.caption)] = try a.dupe(u8, "한글<&😀");
    value.strings[@backingInt(attributes.StringField.name)] = try a.dupe(u8, "");
    value.booleans[@backingInt(attributes.BooleanField.enabled)] = false;
    value.integers[@backingInt(attributes.IntegerField.tabOrder)] = 0;
    const bytes = try encode(a, value);
    defer a.free(bytes);
    var parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
    defer parsed.deinit();
    const object = parsed.value.object;
    const strings = object.get("strings").?.object;
    try std.testing.expectEqualStrings("한글<&😀", strings.get("caption").?.string);
    try std.testing.expectEqualStrings("", strings.get("name").?.string);
    try std.testing.expectEqual(.null, std.meta.activeTag(strings.get("value").?));
    try std.testing.expectEqual(false, object.get("booleans").?.object.get("enabled").?.bool);
    try std.testing.expectEqual(@as(i64, 0), object.get("integers").?.object.get("tabOrder").?.integer);
    try std.testing.expectEqual(true, object.get("sourceOnly").?.bool);
}
test "HWPX form attribute JSON preserves ownership optional values and Unicode under OOM" {
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
    try std.testing.expectError(error.InvalidFormNode, encode(std.testing.allocator, .{ .kind = .picture }));
}
