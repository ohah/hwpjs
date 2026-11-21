//! The active session retains the source owner and history ticket behind a one-use lease.
const std = @import("std");
const model = @import("../hwp5/edit/picture_anchored_resize.zig");

pub const version: u32 = 1;
pub const max_request_bytes = 256;

pub const Request = struct {
    lease: u64,
    width: u32,
    height: u32,
    anchor: model.Anchor,
};

pub fn decode(a: std.mem.Allocator, bytes: []const u8) !Request {
    if (bytes.len > max_request_bytes) return error.LimitExceeded;
    var parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
    defer parsed.deinit();
    if (parsed.value != .object) return error.InvalidAnchoredPictureResize;
    const object = parsed.value.object;
    if (object.count() != 4) return error.InvalidAnchoredPictureResize;
    const raw_lease = object.get("lease") orelse return error.InvalidAnchoredPictureLease;
    if (raw_lease != .string) return error.InvalidAnchoredPictureLease;
    const lease = raw_lease.string;
    if (lease.len == 0 or lease.len > 20 or lease[0] == '0') return error.InvalidAnchoredPictureLease;
    for (lease) |byte| if (byte < '0' or byte > '9') return error.InvalidAnchoredPictureLease;
    const width = try dimension(object.get("width") orelse return error.InvalidAnchoredPictureSize);
    const height = try dimension(object.get("height") orelse return error.InvalidAnchoredPictureSize);
    const anchor = object.get("anchor") orelse return error.InvalidAnchoredPictureResize;
    if (anchor != .string) return error.InvalidAnchoredPictureResize;
    return .{
        .lease = std.fmt.parseInt(u64, lease, 10) catch return error.InvalidAnchoredPictureLease,
        .width = width,
        .height = height,
        .anchor = std.meta.stringToEnum(model.Anchor, anchor.string) orelse return error.InvalidAnchoredPictureResize,
    };
}

fn dimension(value: std.json.Value) !u32 {
    if (value != .integer or value.integer <= 0) return error.InvalidAnchoredPictureSize;
    return std.math.cast(u32, value.integer) orelse return error.InvalidAnchoredPictureSize;
}

pub fn observation(a: std.mem.Allocator, before: model.Observation, lease: u64, revision: u32) ![]u8 {
    const lease_text = try std.fmt.allocPrint(a, "{d}", .{lease});
    defer a.free(lease_text);
    return std.json.Stringify.valueAlloc(a, .{
        .profileVersion = version,
        .format = "hwp5",
        .section = before.target.selector.section,
        .pictureNode = before.target.selector.node,
        .width = before.frame.width,
        .height = before.frame.height,
        .horizontalOffset = before.frame.horizontalOffset,
        .verticalOffset = before.frame.verticalOffset,
        .historyRevision = revision,
        .lease = lease_text,
    }, .{});
}

test "anchored H5 request carries every fixed point with exact integer size" {
    const a = std.testing.allocator;
    for (std.enums.values(model.Anchor)) |anchor| {
        const input = try std.json.Stringify.valueAlloc(a, .{ .lease = "18446744073709551615", .width = @as(u32, 6400), .height = @as(u32, 4800), .anchor = anchor }, .{});
        defer a.free(input);
        try std.testing.expectEqual(Request{ .lease = std.math.maxInt(u64), .width = 6400, .height = 4800, .anchor = anchor }, try decode(a, input));
    }
}

test "anchored H5 request rejects noncanonical leases, injected frame data and fractional sizes" {
    const a = std.testing.allocator;
    for ([_][]const u8{
        \\{"lease":"0","width":10,"height":20,"anchor":"top_left"}
        ,
        \\{"lease":"01","width":10,"height":20,"anchor":"top_left"}
        ,
        \\{"lease":1,"width":10,"height":20,"anchor":"top_left"}
        ,
        \\{"lease":"18446744073709551616","width":10,"height":20,"anchor":"top_left"}
        ,
    }) |input| try std.testing.expectError(error.InvalidAnchoredPictureLease, decode(a, input));
    for ([_][]const u8{
        \\{"lease":"1","width":0,"height":20,"anchor":"top_left"}
        ,
        \\{"lease":"1","width":"10","height":20,"anchor":"top_left"}
        ,
        \\{"lease":"1","width":10.5,"height":20,"anchor":"top_left"}
        ,
        \\{"lease":"1","width":4294967296,"height":20,"anchor":"top_left"}
        ,
    }) |input| try std.testing.expectError(error.InvalidAnchoredPictureSize, decode(a, input));
    try std.testing.expectError(error.InvalidAnchoredPictureResize, decode(a, "{\"lease\":\"1\",\"width\":10,\"height\":20,\"anchor\":\"middle\"}"));
    try std.testing.expectError(error.InvalidAnchoredPictureResize, decode(a, "{\"lease\":\"1\",\"width\":10,\"height\":20,\"anchor\":\"top_left\",\"x\":0}"));
    const oversized: [max_request_bytes + 1]u8 = @splat(' ');
    try std.testing.expectError(error.LimitExceeded, decode(a, &oversized));
}
