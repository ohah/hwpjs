const std = @import("std");
const semantic = @import("../../model/original_cell_insets.zig");
test "original cell insets H5 fixed payload preserves every non-inset byte and explicit layouts" {
    const a = std.testing.allocator;
    for ([_]@import("../body/list_header.zig").Layout{ .spec6, .observed8 }) |layout| {
        const header: usize = if (layout == .spec6) 6 else 8;
        var payload: [39]u8 = @splat(0xa5);
        const raw = payload[0 .. header + 29];
        std.mem.writeInt(u16, raw[0..2], 1, .little);
        const attributes: u32 = (1 << 31) | (1 << 18);
        std.mem.writeInt(u32, raw[header - 4 ..][0..4], attributes, .little);
        std.mem.writeInt(u32, raw[header + 8 ..][0..4], 10000, .little);
        std.mem.writeInt(u32, raw[header + 12 ..][0..4], 4000, .little);
        for ([_]i16{ 10, 20, 30, 40 }, 0..) |value, i| std.mem.writeInt(i16, raw[header + 16 + i * 2 ..][0..2], value, .little);
        const after = try semantic.prepare(.{ .use_cell = false, .cell = .{ 10, 20, 30, 40 }, .table = .{ 144, 288, 432, 576 } }, .{ .width = 10000, .height = 4000 }, .{ .custom = .{ 720, null, null, null } });
        const out = try @import("cell_insets_payload.zig").write(a, raw, layout, attributes, after, 1000);
        defer a.free(out);
        for (raw, out, 0..) |before, byte, i| {
            if ((i >= header - 4 and i < header) or (i >= header + 16 and i < header + 24)) continue;
            try std.testing.expectEqual(before, byte);
        }
        const parsed = try (try @import("../body/list_header.zig").Header.parse(out)).view(layout);
        try std.testing.expectEqual(attributes | (1 << 16), parsed.attributes);
        const cell = try @import("../body/table_cell.zig").Cell.parse(parsed.extra);
        try std.testing.expectEqualDeep([4]i16{ 720, 288, 432, 576 }, cell.margins);
    }
}
