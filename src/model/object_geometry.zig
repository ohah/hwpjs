//! Shared source-frame edit contract. Native object adapters own links, transforms and persistence.
const std = @import("std");
pub const Binding = struct { session: []const u8, serial: []const u8 };
pub const Kind = enum { chart, drawing };
pub const Selector = struct { kind: Kind, section: u32, node: u32 };
pub const Frame = struct { width: u32, height: u32, horizontalOffset: i32, verticalOffset: i32, treatAsCharacter: bool };
pub const Patch = struct { width: ?u32 = null, height: ?u32 = null, horizontalOffset: ?i32 = null, verticalOffset: ?i32 = null, treatAsCharacter: ?bool = null };
pub const Owner = struct { ownerNode: u32, componentNode: ?u32, paragraph: u32, anchorUnit: u32, sourceSha256: [32]u8, link: []const u8 };
pub const Editable = struct { size: bool, position: bool };
pub const Observation = struct {
    format: enum { hwp5, hwpx },
    selector: Selector,
    owner: Owner,
    frame: Frame,
    editable: Editable,
    reason: ?[]const u8,
    historyRevision: u64,
    binding: Binding,
    pub fn deinit(self: *Observation, a: std.mem.Allocator) void {
        a.free(self.owner.link);
        a.free(self.binding.session);
        a.free(self.binding.serial);
        self.* = undefined;
    }
};
pub const Request = struct { selector: Selector, owner: Owner, expected: Frame, historyRevision: u64, binding: Binding, patch: Patch };
pub const Parsed = struct {
    json: std.json.Parsed(Request),
    pub fn deinit(self: *Parsed) void {
        self.json.deinit();
        self.* = undefined;
    }
};
pub fn validateFrame(frame: Frame) !void {
    if (frame.width == 0 or frame.height == 0) return error.InvalidObjectGeometrySize;
}
pub fn after(before: Frame, patch: Patch) !Frame {
    var result = before;
    inline for (@typeInfo(Patch).@"struct".field_names) |name| if (@field(patch, name)) |value| {
        @field(result, name) = value;
    };
    try validateFrame(result);
    return result;
}
fn object(value: std.json.Value, allowed: []const []const u8, required: usize) !void {
    if (value != .object or value.object.count() < required or value.object.count() > allowed.len) return error.InvalidObjectGeometryRequest;
    var entries = value.object.iterator();
    while (entries.next()) |entry| {
        var found = false;
        for (allowed) |name| if (std.mem.eql(u8, name, entry.key_ptr.*)) {
            found = true;
            break;
        };
        if (!found) return error.InvalidObjectGeometryRequest;
    }
}
fn integer(value: std.json.Value, low: i64, high: i64) !void {
    if (value != .integer or value.integer < low or value.integer > high) return error.InvalidObjectGeometryRequest;
}
fn validateWire(value: std.json.Value) !void {
    try object(value, &.{ "selector", "owner", "expected", "historyRevision", "binding", "patch" }, 6);
    const binding = value.object.get("binding") orelse return error.InvalidObjectGeometryRequest;
    try object(binding, &.{ "session", "serial" }, 2);
    const session = binding.object.get("session") orelse return error.InvalidObjectGeometryRequest;
    const serial = binding.object.get("serial") orelse return error.InvalidObjectGeometryRequest;
    if (session != .string or session.string.len < 2 or session.string.len > 256 or serial != .string) return error.InvalidObjectGeometryRequest;
    _ = try @import("formatting_binding.zig").decimal(serial.string);
    const selector = value.object.get("selector") orelse return error.InvalidObjectGeometryRequest;
    try object(selector, &.{ "kind", "section", "node" }, 3);
    const kind = selector.object.get("kind") orelse return error.InvalidObjectGeometryRequest;
    if (kind != .string or (!std.mem.eql(u8, kind.string, "chart") and !std.mem.eql(u8, kind.string, "drawing"))) return error.InvalidObjectGeometryRequest;
    for ([_][]const u8{ "section", "node" }) |key| try integer(selector.object.get(key) orelse return error.InvalidObjectGeometryRequest, 0, std.math.maxInt(u32));
    const owner = value.object.get("owner") orelse return error.InvalidObjectGeometryRequest;
    try object(owner, &.{ "ownerNode", "componentNode", "paragraph", "anchorUnit", "sourceSha256", "link" }, 6);
    for ([_][]const u8{ "ownerNode", "paragraph", "anchorUnit" }) |key| try integer(owner.object.get(key) orelse return error.InvalidObjectGeometryRequest, 0, std.math.maxInt(u32));
    const component = owner.object.get("componentNode") orelse return error.InvalidObjectGeometryRequest;
    if (component != .null) try integer(component, 0, std.math.maxInt(u32));
    const digest = owner.object.get("sourceSha256") orelse return error.InvalidObjectGeometryRequest;
    if (digest != .array or digest.array.items.len != 32) return error.InvalidObjectGeometryRequest;
    for (digest.array.items) |byte| try integer(byte, 0, 255);
    const link = owner.object.get("link") orelse return error.InvalidObjectGeometryRequest;
    if (link != .string or link.string.len == 0 or link.string.len > 8192) return error.InvalidObjectGeometryRequest;
    try integer(value.object.get("historyRevision") orelse return error.InvalidObjectGeometryRequest, 0, 9007199254740991);
    for ([_][]const u8{ "expected", "patch" }) |which| {
        const frame = value.object.get(which) orelse return error.InvalidObjectGeometryRequest;
        try object(frame, &.{ "width", "height", "horizontalOffset", "verticalOffset", "treatAsCharacter" }, if (std.mem.eql(u8, which, "expected")) 5 else 0);
        var entries = frame.object.iterator();
        while (entries.next()) |entry| {
            if (std.mem.eql(u8, entry.key_ptr.*, "treatAsCharacter")) {
                if (entry.value_ptr.* != .bool) return error.InvalidObjectGeometryRequest;
            } else if (std.mem.eql(u8, entry.key_ptr.*, "width") or std.mem.eql(u8, entry.key_ptr.*, "height")) {
                try integer(entry.value_ptr.*, 1, std.math.maxInt(u32));
            } else try integer(entry.value_ptr.*, std.math.minInt(i32), std.math.maxInt(i32));
        }
    }
}
pub fn parse(a: std.mem.Allocator, bytes: []const u8) !Parsed {
    if (bytes.len > 16384) return error.LimitExceeded;
    const wire = try std.json.parseFromSlice(std.json.Value, a, bytes, .{ .duplicate_field_behavior = .@"error" });
    defer wire.deinit();
    try validateWire(wire.value);
    const json = try std.json.parseFromSlice(Request, a, bytes, .{ .allocate = .alloc_always, .ignore_unknown_fields = false, .duplicate_field_behavior = .@"error" });
    errdefer json.deinit();
    try validateFrame(json.value.expected);
    _ = try after(json.value.expected, json.value.patch);
    return .{ .json = json };
}

test "object geometry strict Native patch parser rejects quoted numeric and unknown fields" {
    const a = std.testing.allocator;
    const prefix = "{\"selector\":{\"kind\":\"drawing\",\"section\":0,\"node\":2},\"owner\":{\"ownerNode\":1,\"componentNode\":2,\"paragraph\":0,\"anchorUnit\":0,\"sourceSha256\":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],\"link\":\"gso:1\"},\"expected\":{\"width\":10,\"height\":20,\"horizontalOffset\":0,\"verticalOffset\":0,\"treatAsCharacter\":true},\"historyRevision\":0,\"binding\":{\"session\":\"s1\",\"serial\":\"0\"},\"patch\":";
    var valid = try parse(a, prefix ++ "{\"horizontalOffset\":-10,\"treatAsCharacter\":false}}");
    defer valid.deinit();
    try std.testing.expectEqual(@as(?i32, -10), valid.json.value.patch.horizontalOffset);
    for ([_][]const u8{ "{\"width\":\"30\"}}", "{\"width\":null}}", "{\"width\":0}}", "{\"rotation\":0}}", "{\"width\":30,\"width\":40}}" }) |suffix| {
        const bytes = try std.mem.concat(a, u8, &.{ prefix, suffix });
        defer a.free(bytes);
        if (parse(a, bytes)) |value| {
            var invalid = value;
            invalid.deinit();
            return error.AcceptedInvalidGeometryRequest;
        } else |_| {}
    }
}
