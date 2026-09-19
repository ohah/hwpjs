const std = @import("std");
const arrow = @import("emf_plus_custom_line_cap_arrow.zig");
const binary = @import("../../binary/reader.zig");
const default = @import("emf_plus_custom_line_cap_default.zig");
const graphics_version = @import("emf_plus_graphics_version.zig");
const line_values = @import("emf_plus_line_values.zig");
const object = @import("emf_plus_object.zig");

pub const Options = struct {
    max_custom_line_cap_bytes: usize = 64 * 1024 * 1024,
    default_options: default.Options = .{},
};

pub const Data = union(line_values.CustomLineCapDataType) {
    default: default.Default,
    adjustable_arrow: arrow.Arrow,
};

pub const CustomLineCap = struct {
    bytes: []const u8,
    version: graphics_version.GraphicsVersion,
    data: Data,
};

pub fn parse(bytes: []const u8, options: Options) !CustomLineCap {
    if (bytes.len > options.max_custom_line_cap_bytes) return error.LimitExceeded;
    var reader: binary.Reader = .{ .bytes = bytes };
    const version = try graphics_version.parse(try reader.readInt(u32));
    const cap_type = try line_values.customLineCapDataType(try reader.readInt(i32));
    const payload = bytes[reader.offset..];
    const data: Data = switch (cap_type) {
        .default => .{ .default = try default.parse(payload, options.default_options) },
        .adjustable_arrow => .{ .adjustable_arrow = try arrow.parse(payload) },
    };
    return .{ .bytes = bytes, .version = version, .data = data };
}

pub fn parseCompleted(value: object.Completed, options: Options) !CustomLineCap {
    if (value.object_type != .custom_line_cap) return error.NotEmfPlusCustomLineCapObject;
    return parse(value.object_data, options);
}

fn putU32(bytes: []u8, offset: usize, value: u32) void {
    std.mem.writeInt(u32, bytes[offset..][0..4], value, .little);
}

test "EMF+ CustomLineCap dispatches default and adjustable arrow data" {
    var default_bytes = [_]u8{0} ** 56;
    putU32(&default_bytes, 0, 0xdbc01001);
    try std.testing.expectEqual(@as(u32, 0), (try parse(&default_bytes, .{})).data.default.flags_raw);

    var arrow_bytes = [_]u8{0} ** 60;
    putU32(&arrow_bytes, 0, 0xdbc01002);
    putU32(&arrow_bytes, 4, 1);
    putU32(&arrow_bytes, 20, 1);
    try std.testing.expect((try parse(&arrow_bytes, .{})).data.adjustable_arrow.isFilled());
}

test "EMF+ CustomLineCap rejects envelope truncation type limit and wrong completed object" {
    var bytes = [_]u8{0} ** 56;
    putU32(&bytes, 0, 0xdbc01001);
    for (0..8) |cut| try expectError(bytes[0..cut], .{});
    putU32(&bytes, 4, 2);
    try std.testing.expectError(error.InvalidEmfPlusCustomLineCapDataType, parse(&bytes, .{}));
    putU32(&bytes, 4, 0);
    try std.testing.expectError(error.LimitExceeded, parse(&bytes, .{ .max_custom_line_cap_bytes = 55 }));
    try std.testing.expectError(error.NotEmfPlusCustomLineCapObject, parseCompleted(.{
        .object_id = 1,
        .object_type = .pen,
        .object_data = &bytes,
        .multipart = false,
    }, .{}));
    _ = try parseCompleted(.{
        .object_id = 1,
        .object_type = .custom_line_cap,
        .object_data = &bytes,
        .multipart = false,
    }, .{});
}

fn expectError(bytes: []const u8, options: Options) !void {
    if (parse(bytes, options)) |_| return error.TestExpectedError else |_| {}
}
