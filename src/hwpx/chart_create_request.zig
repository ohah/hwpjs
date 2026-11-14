//! Strict public JSON request, with the source SHA injected by Native.
//! All borrowed Request slices remain alive until ParsedRequest.deinit().
const std = @import("std");
const api = @import("chart_create.zig");
const Wire = struct {
    target: @import("inline_object_insert.zig").Target,
    size: @import("chart_create_host.zig").Size,
    data: api.Data,
};
pub const ParsedRequest = struct {
    json: std.json.Parsed(Wire),
    request: api.Request,
    pub fn deinit(self: *ParsedRequest) void {
        self.json.deinit();
        self.* = undefined;
    }
};

pub fn parseRequest(a: std.mem.Allocator, bytes: []const u8, before_sha256: [32]u8) !ParsedRequest {
    if (bytes.len == 0 or bytes.len > 32 * 1024 * 1024) return error.LimitExceeded;
    // A typed JSON parser can accept quoted numbers; check exact wire kinds.
    const kinds = try std.json.parseFromSlice(std.json.Value, a, bytes, .{ .duplicate_field_behavior = .@"error" });
    defer kinds.deinit();
    const root = kinds.value;
    try object(root, 3);
    const target = try field(root, "target");
    try object(target, 4);
    try unsigned(try field(target, "section"), std.math.maxInt(u32));
    try unsigned(try field(target, "paragraph"), std.math.maxInt(u32));
    try unsigned(try field(target, "unit"), std.math.maxInt(u32));
    try string(try field(target, "expected_text"));
    const size = try field(root, "size");
    try object(size, 2);
    try unsigned(try field(size, "width"), std.math.maxInt(i32));
    try unsigned(try field(size, "height"), std.math.maxInt(i32));
    const data = try field(root, "data");
    try object(data, 2);
    const categories = try field(data, "categories");
    if (categories != .array or categories.array.items.len == 0 or categories.array.items.len > @import("chart_create_data.zig").max_categories) return error.InvalidChartCreateRequest;
    for (categories.array.items) |value| try string(value);
    const series = try field(data, "series");
    if (series != .array or series.array.items.len == 0 or series.array.items.len > @import("chart_create_data.zig").max_series) return error.InvalidChartCreateRequest;
    for (series.array.items) |item| {
        try object(item, 2);
        try string(try field(item, "name"));
        const values = try field(item, "values");
        if (values != .array or values.array.items.len != categories.array.items.len) return error.InvalidChartCreateRequest;
        for (values.array.items) |value| try string(value);
    }
    const parsed = try std.json.parseFromSlice(Wire, a, bytes, .{ .allocate = .alloc_always, .ignore_unknown_fields = false, .duplicate_field_behavior = .@"error" });
    errdefer parsed.deinit();
    const wire = parsed.value;
    if (wire.target.section != 0) return error.UnsupportedInsertSections;
    if (wire.target.paragraph == 0) return error.InvalidParagraphIndex;
    _ = try @import("../image/image_insertion.zig").byteOffset(wire.target.expected_text, wire.target.unit);
    try @import("chart_create_host.zig").validateSize(wire.size);
    try @import("chart_create_data.zig").validate(wire.data);
    return .{ .json = parsed, .request = .{ .expected_source_sha256 = before_sha256, .target = wire.target, .size = wire.size, .data = wire.data } };
}

fn object(value: std.json.Value, count: usize) !void {
    if (value != .object or value.object.count() != count) return error.InvalidChartCreateRequest;
}
fn field(value: std.json.Value, key: []const u8) !std.json.Value {
    if (value != .object) return error.InvalidChartCreateRequest;
    return value.object.get(key) orelse error.InvalidChartCreateRequest;
}
fn string(value: std.json.Value) !void {
    if (value != .string) return error.InvalidChartCreateRequest;
}
fn unsigned(value: std.json.Value, maximum: u64) !void {
    if (value != .integer or value.integer < 0 or @as(u64, @intCast(value.integer)) > maximum) return error.InvalidChartCreateRequest;
}
