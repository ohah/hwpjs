const std = @import("std");
const t = std.testing;
const Text = @import("text.zig").Text;
test "preview text preserves arbitrary units, BOM, NUL and unpaired surrogates" {
    const raw = [_]u8{ 0xff, 0xfe, 0, 0, 0, 0xd8, 'A', 0, 0, 0xdc, 0, 0xd8, 0, 0xdc, 2, 0 };
    const text = try Text.parse(&raw);
    try t.expect(text.raw.ptr == &raw);
    try t.expectEqualDeep(@import("text.zig").Stats{ .units = 8, .scalar_values = 5, .unpaired_surrogates = 2, .nul_units = 1, .bom_units = 1 }, text.stats);
    for (0..raw.len + 1) |n| {
        if (n % 2 == 1) try t.expectError(error.InvalidPreviewTextSize, Text.parse(raw[0..n])) else _ = try Text.parse(raw[0..n]);
    }
    try t.expectEqual(0, (try Text.parse(&.{})).stats.units);
}
test "all individual UTF16 units have independent surrogate diagnostics" {
    var raw: [2]u8 = undefined;
    for (0..65536) |i| {
        std.mem.writeInt(u16, &raw, @intCast(i), .little);
        const text = try Text.parse(&raw);
        const invalid = i >= 0xd800 and i <= 0xdfff;
        try t.expectEqual(@intFromBool(invalid), text.stats.unpaired_surrogates);
        try t.expectEqual(@intFromBool(!invalid), text.stats.scalar_values);
        try t.expectEqual(@intFromBool(i == 0), text.stats.nul_units);
        try t.expectEqual(@intFromBool(i == 0xfeff), text.stats.bom_units);
    }
}
