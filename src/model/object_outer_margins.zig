//! Optional existing-node margins contract. Geometry V1 remains strict and unchanged.
const std = @import("std");
const geometry = @import("object_geometry.zig");
pub const Margins = struct { left: u32, right: u32, top: u32, bottom: u32 };
pub const Observation = struct {
    geometry: geometry.Observation,
    margins: Margins,
    pub fn deinit(self: *Observation, a: std.mem.Allocator) void {
        self.geometry.deinit(a);
        self.* = undefined;
    }
};
/// geometry.patch must be empty; no frame/position mutation can be smuggled in.
pub const Request = struct { geometry: geometry.Request, expectedMargins: Margins, margins: Margins };
pub const Parsed = struct {
    json: std.json.Parsed(Request),
    pub fn deinit(self: *Parsed) void {
        self.json.deinit();
        self.* = undefined;
    }
};
pub fn validateMargins(value: Margins) !void {
    inline for (@typeInfo(Margins).@"struct".field_names) |name| if (@field(value, name) > 32767) return error.InvalidObjectOuterMargins;
}
pub fn validateRequest(value: Request) !void {
    if (value.geometry.selector.kind != .drawing or !std.meta.eql(value.geometry.patch, geometry.Patch{})) return error.InvalidObjectOuterMargins;
    try validateMargins(value.expectedMargins);
    try validateMargins(value.margins);
}
fn exact(value: std.json.Value, names: []const []const u8) !void {
    if (value != .object or value.object.count() != names.len) return error.InvalidObjectOuterMargins;
    for (names) |name| if (!value.object.contains(name)) return error.InvalidObjectOuterMargins;
}
fn marginsWire(value: std.json.Value) !void {
    try exact(value, &.{ "left", "right", "top", "bottom" });
    for ([_][]const u8{ "left", "right", "top", "bottom" }) |name| {
        const item = value.object.get(name).?;
        if (item != .integer or item.integer < 0 or item.integer > 32767) return error.InvalidObjectOuterMargins;
    }
}
pub fn parse(a: std.mem.Allocator, bytes: []const u8) !Parsed {
    if (bytes.len > 16384) return error.LimitExceeded;
    const wire = try std.json.parseFromSlice(std.json.Value, a, bytes, .{ .duplicate_field_behavior = .@"error" });
    defer wire.deinit();
    try exact(wire.value, &.{ "geometry", "expectedMargins", "margins" });
    try marginsWire(wire.value.object.get("expectedMargins").?);
    try marginsWire(wire.value.object.get("margins").?);
    const nested = try std.json.Stringify.valueAlloc(a, wire.value.object.get("geometry").?, .{});
    defer a.free(nested);
    var checked = try geometry.parse(a, nested);
    defer checked.deinit();
    const json = try std.json.parseFromSlice(Request, a, bytes, .{ .allocate = .alloc_always, .ignore_unknown_fields = false, .duplicate_field_behavior = .@"error" });
    errdefer json.deinit();
    try validateRequest(json.value);
    return .{ .json = json };
}
