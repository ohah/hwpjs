//! HWPX existing textbox flow only. No geometry, margin or numeric format mapping.
const std = @import("std");
const geometry = @import("object_geometry.zig");
pub const Wrap = enum { SQUARE, TOP_AND_BOTTOM, BEHIND_TEXT, IN_FRONT_OF_TEXT };
pub const Side = enum { BOTH_SIDES, LEFT_ONLY, RIGHT_ONLY, LARGEST_ONLY };
pub const Flow = struct { textWrap: Wrap, textFlow: Side };
pub const Observation = struct {
    geometry: geometry.Observation,
    flow: Flow,
    pub fn deinit(self: *Observation, a: std.mem.Allocator) void {
        self.geometry.deinit(a);
        self.* = undefined;
    }
};
pub const Request = struct { geometry: geometry.Request, expectedFlow: Flow, flow: Flow };
pub const Parsed = struct {
    json: std.json.Parsed(Request),
    pub fn deinit(self: *Parsed) void {
        self.json.deinit();
        self.* = undefined;
    }
};
pub fn validateRequest(value: Request) !void {
    if (value.geometry.selector.kind != .drawing or !std.meta.eql(value.geometry.patch, geometry.Patch{})) return error.InvalidObjectBodyFlow;
    // Side-flow edits have a visible meaning only for SQUARE. Other modes retain it.
    if (value.flow.textWrap != .SQUARE and value.flow.textFlow != value.expectedFlow.textFlow) return error.UnsupportedObjectBodyFlowSide;
}
fn exact(value: std.json.Value, names: []const []const u8) !void {
    if (value != .object or value.object.count() != names.len) return error.InvalidObjectBodyFlow;
    for (names) |name| if (!value.object.contains(name)) return error.InvalidObjectBodyFlow;
}
fn flowWire(value: std.json.Value) !void {
    try exact(value, &.{ "textWrap", "textFlow" });
    const wrap = value.object.get("textWrap").?;
    const side = value.object.get("textFlow").?;
    if (wrap != .string or side != .string) return error.InvalidObjectBodyFlow;
    _ = std.meta.stringToEnum(Wrap, wrap.string) orelse return error.InvalidObjectBodyFlow;
    _ = std.meta.stringToEnum(Side, side.string) orelse return error.InvalidObjectBodyFlow;
}
pub fn parse(a: std.mem.Allocator, bytes: []const u8) !Parsed {
    if (bytes.len > 16384) return error.LimitExceeded;
    const wire = try std.json.parseFromSlice(std.json.Value, a, bytes, .{ .duplicate_field_behavior = .@"error" });
    defer wire.deinit();
    try exact(wire.value, &.{ "geometry", "expectedFlow", "flow" });
    try flowWire(wire.value.object.get("expectedFlow").?);
    try flowWire(wire.value.object.get("flow").?);
    const nested = try std.json.Stringify.valueAlloc(a, wire.value.object.get("geometry").?, .{});
    defer a.free(nested);
    var checked = try geometry.parse(a, nested);
    defer checked.deinit();
    const json = try std.json.parseFromSlice(Request, a, bytes, .{ .allocate = .alloc_always, .ignore_unknown_fields = false, .duplicate_field_behavior = .@"error" });
    errdefer json.deinit();
    try validateRequest(json.value);
    return .{ .json = json };
}
