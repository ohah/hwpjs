//! PAGE_DEF scalar serialization only; no owner, lifetime, history, or layout authority.
//! Format fields/bit assignments: official HWP5 tables 131/132.
//! Upper layers must validate effective geometry and source ownership before use.
const std = @import("std");
const page = @import("../body/page_def.zig");
pub const Values = struct {
    width: u32,
    height: u32,
    left: u32,
    right: u32,
    top: u32,
    bottom: u32,
    header: u32,
    footer: u32,
    gutter: u32,
    orientation: page.Orientation,
    binding: page.Binding,
};
/// Both slices are exact source payloads, including unknown flags and trailing bytes.
/// Return an independently owned full payload; callers own the allocation.
pub fn prepare(a: std.mem.Allocator, current: []const u8, expected: []const u8, values: Values) ![]u8 {
    if (!std.mem.eql(u8, current, expected)) return error.StalePageDefinitionPayload;
    const original = try page.Definition.parse(current);
    _ = try original.binding();
    if (values.width == 0 or values.height == 0) return error.InvalidPageDefinitionDimensions;
    const output = try a.dupe(u8, current);
    inline for (.{ "width", "height", "left", "right", "top", "bottom", "header", "footer", "gutter" }, 0..) |name, i| {
        std.mem.writeInt(u32, output[i * 4 ..][0..4], @field(values, name), .little);
    }
    const orientation: u32 = switch (values.orientation) {
        .narrowly => 0,
        .widely => 1,
    };
    const binding: u32 = switch (values.binding) {
        .one_side => 0,
        .facing => 1,
        .top => 2,
    };
    std.mem.writeInt(u32, output[36..40], (original.flags & ~@as(u32, 7)) | orientation | (binding << 1), .little);
    return output;
}
const initial: Values = .{ .width = 59528, .height = 84188, .left = 8504, .right = 8504, .top = 5669, .bottom = 4252, .header = 4252, .footer = 4252, .gutter = 1000, .orientation = .narrowly, .binding = .one_side };
fn seed() [45]u8 {
    var bytes: [45]u8 = @splat(0);
    std.mem.writeInt(u32, bytes[36..40], 0xa5c38a08, .little);
    bytes[40..].* = .{ 0, 0xff, 0xa5, 0x5a, 7 };
    return bytes;
}
test "H5 page settings payload all orientation binding bits preserve stored axes opaque flags and tail" {
    const a = std.testing.allocator;
    const source = seed();
    for ([_]page.Orientation{ .narrowly, .widely }, 0..) |orientation, orientation_bit| {
        for ([_]page.Binding{ .one_side, .facing, .top }, 0..) |binding, binding_bits| {
            var values = initial;
            values.orientation = orientation;
            values.binding = binding;
            const out = try prepare(a, &source, &source, values);
            defer a.free(out);
            const decoded = try page.Definition.parse(out);
            try std.testing.expectEqual(@as(u32, 59528), decoded.width);
            try std.testing.expectEqual(@as(u32, 84188), decoded.height);
            try std.testing.expectEqual(orientation, decoded.orientation());
            try std.testing.expectEqual(binding, try decoded.binding());
            try std.testing.expectEqual(@as(u32, 0xa5c38a08) | @as(u32, @intCast(orientation_bit | (binding_bits << 1))), decoded.flags);
            try std.testing.expectEqualSlices(u8, source[40..], decoded.extra);
            inline for (.{ "left", "right", "top", "bottom", "header", "footer", "gutter" }) |name| try std.testing.expectEqual(@field(initial, name), @field(decoded, name));
        }
    }
}
test "H5 page settings payload rejects stale snapshot truncation reserved binding and zero dimensions" {
    const a = std.testing.allocator;
    const original = seed();
    var other = original;
    other[44] ^= 1;
    try std.testing.expectError(error.StalePageDefinitionPayload, prepare(a, &original, &other, initial));
    other = original;
    other[39] ^= 1;
    try std.testing.expectError(error.StalePageDefinitionPayload, prepare(a, &original, &other, initial));
    for (0..40) |n| try std.testing.expectError(error.UnexpectedEnd, prepare(a, original[0..n], original[0..n], initial));
    other = original;
    other[36] |= 6;
    try std.testing.expectError(error.UnsupportedPageBinding, prepare(a, &other, &other, initial));
    var invalid = initial;
    invalid.width = 0;
    try std.testing.expectError(error.InvalidPageDefinitionDimensions, prepare(a, &original, &original, invalid));
    invalid = initial;
    invalid.height = 0;
    try std.testing.expectError(error.InvalidPageDefinitionDimensions, prepare(a, &original, &original, invalid));
    try std.testing.expectEqualSlices(u8, &seed(), &original);
}
test "H5 page settings payload allocation failure leaves exact input owned by caller" {
    const source = seed();
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, bytes: []const u8) !void {
            const out = try prepare(a, bytes, bytes, initial);
            defer a.free(out);
            try std.testing.expectEqualSlices(u8, bytes[40..], out[40..]);
        }
    }.run, .{&source});
    try std.testing.expectEqualSlices(u8, &seed(), &source);
}
