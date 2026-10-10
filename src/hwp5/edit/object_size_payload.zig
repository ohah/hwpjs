//! control ID 뒤 object 공통 표시 크기만 교체합니다.
const std = @import("std");
const common = @import("../body/object_common.zig");

pub fn write(a: std.mem.Allocator, payload: []const u8, size: [2]u32, limit: usize) ![]u8 {
    const control = try @import("../body/control_header.zig").Header.parse(payload);
    if (!common.supports(control.id)) return error.UnsupportedObjectSize;
    const properties = try common.Properties.parse(control.properties);
    if (properties.sizeProtected()) return error.PictureSizeProtected;
    if (payload.len > limit) return error.LimitExceeded;
    const offset = payload.len - control.properties.len + properties.size_offset;
    const output = try a.dupe(u8, payload);
    std.mem.writeInt(u32, output[offset..][0..4], size[0], .little);
    std.mem.writeInt(u32, output[offset + 4 ..][0..4], size[1], .little);
    return output;
}

test "HWP5 object size payload preserves descriptor tails flags and signed offsets under failures" {
    const a = std.testing.allocator;
    var raw = [_]u8{0} ** 51;
    std.mem.writeInt(u32, raw[0..4], @import("../body/control_rules.zig").drawing_id, .little);
    // counted UTF-16 description: two units, followed by opaque tail.
    std.mem.writeInt(u16, raw[44..46], 2, .little);
    raw[46] = 65;
    raw[48] = 66;
    raw[50] = 0xa5;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, payload: []const u8) !void {
            const output = try write(allocator, payload, .{ 12345, 67890 }, payload.len);
            defer allocator.free(output);
            try std.testing.expectEqualSlices(u8, payload[0..16], output[0..16]);
            try std.testing.expectEqualSlices(u8, payload[24..], output[24..]);
            const properties = try common.Properties.parse((try @import("../body/control_header.zig").Header.parse(output)).properties);
            try std.testing.expectEqual(@as(u32, 12345), properties.width);
            try std.testing.expectEqual(@as(u32, 67890), properties.height);
        }
    }.run, .{&raw});
    try std.testing.expectError(error.LimitExceeded, write(a, &raw, .{ 1, 2 }, raw.len - 1));
    std.mem.writeInt(u32, raw[4..8], (@as(u32, 2) << 3) | (@as(u32, 1) << 20), .little);
    try std.testing.expectError(error.PictureSizeProtected, write(a, &raw, .{ 1, 2 }, raw.len));
    std.mem.writeInt(u32, raw[0..4], 0, .little);
    try std.testing.expectError(error.UnsupportedObjectSize, write(a, &raw, .{ 1, 2 }, raw.len));
}

test "HWP5 object size payload actual root picture declarations preserve every other field" {
    const a = std.testing.allocator;
    var count: usize = 0;
    for ([_][]const u8{ "sample-5017", "sample-5017-pics" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(input);
        var source = try @import("../text_source.zig").Source.open(a, input);
        defer source.deinit();
        const decoded = try source.decodeSection(a, 0);
        defer a.free(decoded);
        const pictures = try @import("picture_sources.zig").read(a, decoded, source.header.version(), .base73);
        defer a.free(pictures);
        var tree = try @import("../body/tree.zig").Tree.parse(a, decoded, source.header.version(), .{});
        defer tree.deinit(a);
        for (pictures) |picture| {
            const payload = tree.nodes[picture.owner_node].record.framing.payload;
            const properties = try common.Properties.parse((try @import("../body/control_header.zig").Header.parse(payload)).properties);
            const same = try write(a, payload, .{ properties.width, properties.height }, payload.len);
            defer a.free(same);
            try std.testing.expectEqualSlices(u8, payload, same);
            const changed = try write(a, payload, .{ 10000, 6000 }, payload.len);
            defer a.free(changed);
            try std.testing.expectEqualSlices(u8, payload[0..16], changed[0..16]);
            try std.testing.expectEqualSlices(u8, payload[24..], changed[24..]);
            count += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 13), count);
}
