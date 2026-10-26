//! Common typed leaf attributes, preserving element/attribute absence.
const std = @import("std");
const Tree = @import("chart_tree.zig").Tree;
pub const default_max_attribute_bytes = 4096;
pub const Number = union(enum) {
    finite: f64,
    positive_infinity,
    negative_infinity,
    not_a_number,
    pub fn jsonStringify(self: Number, writer: anytype) !void {
        const normalized = if (self == .finite) fromFloat(self.finite) else self;
        try writer.write(.{ .kind = @tagName(normalized), .value = if (normalized == .finite) @as(?f64, normalized.finite) else @as(?f64, null) });
    }
};
pub fn fromFloat(value: f64) Number {
    if (std.math.isNan(value)) return .not_a_number;
    if (std.math.isFinite(value)) return .{ .finite = value };
    return if (value < 0) .negative_infinity else .positive_infinity;
}
pub fn number(raw: []const u8) !Number {
    return fromFloat(try @import("xml_values.zig").float64(raw));
}
pub fn Field(comptime T: type) type {
    return struct { node: usize, value: ?T };
}
pub fn read(comptime T: type, a: std.mem.Allocator, tree: *const Tree, node: usize, limit: usize, invalid: anyerror) !Field(T) {
    if (node >= tree.elements.len or tree.elements[node].first_child != null) return invalid;
    const raw = try tree.attributeValue(a, node, "", "val") orelse return .{ .node = node, .value = null };
    const text = try raw.toUtf8(a, limit);
    defer a.free(text);
    const value: T = if (T == bool)
        try @import("xml_values.zig").boolean(text)
    else if (T == u32)
        try @import("xml_values.zig").unsigned32(text)
    else if (T == i32)
        try @import("xml_values.zig").signed32(text)
    else if (T == Number)
        try number(text)
    else
        std.meta.stringToEnum(T, text) orelse return invalid;
    return .{ .node = node, .value = value };
}

test "chart display number JSON never fabricates finite nonportable values" {
    const a = std.testing.allocator;
    for ([_]Number{ .{ .finite = 2 }, .positive_infinity, .negative_infinity, .not_a_number, .{ .finite = std.math.nan(f64) } }) |value| {
        const bytes = try @import("../json/bounded_stringify.zig").encode(a, value, 1000);
        defer a.free(bytes);
        var parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
        defer parsed.deinit();
        const object = parsed.value.object;
        if (std.mem.eql(u8, object.get("kind").?.string, "finite")) {
            try std.testing.expect(object.get("value").? != .null);
        } else try std.testing.expectEqual(.null, std.meta.activeTag(object.get("value").?));
    }
}
