//! Explicit output policy for observed %g/%.2f, not arbitrary printf execution.
const std = @import("std");
pub const Grouping = @import("../../model/document.zig").NumberGrouping;
pub const Format = enum {
    general6,
    fixed2,

    pub fn parse(bytes: []const u8) !Format {
        if (std.mem.eql(u8, bytes, &.{ '%', 0, 'g', 0 })) return .general6;
        if (std.mem.eql(u8, bytes, &.{ '%', 0, '.', 0, '2', 0, 'f', 0 })) return .fixed2;
        return error.UnsupportedFormulaFormat;
    }

    pub fn render(self: Format, a: std.mem.Allocator, value: f64, grouping: Grouping) ![]u8 {
        if (!std.math.isFinite(value)) return error.InvalidFormulaNumber;
        var buffer: [512]u8 = undefined;
        var scientific_buffer: [64]u8 = undefined;
        var exponent: i32 = 0;
        var scientific = false;
        const rendered = switch (self) {
            .fixed2 => try std.fmt.float.render(&buffer, value, .{ .mode = .decimal, .precision = 2 }),
            .general6 => blk: {
                const s = try std.fmt.float.render(&scientific_buffer, value, .{ .mode = .scientific, .precision = 5 });
                const e = std.mem.indexOfScalar(u8, s, 'e') orelse return error.UnsupportedFormulaFormat;
                exponent = try std.fmt.parseInt(i32, s[e + 1 ..], 10);
                scientific = exponent < -4 or exponent >= 6;
                if (scientific) break :blk s[0..e];
                break :blk try std.fmt.float.render(&buffer, value, .{ .mode = .decimal, .precision = @intCast(5 - exponent) });
            },
        };
        var end = rendered.len;
        if (self == .general6 and std.mem.indexOfScalar(u8, rendered, '.') != null) {
            while (end > 0 and rendered[end - 1] == '0') end -= 1;
            if (end > 0 and rendered[end - 1] == '.') end -= 1;
        }
        const plain = rendered[0..end];
        const signed: usize = if (plain.len > 0 and plain[0] == '-') 1 else 0;
        const integer_end = std.mem.indexOfScalar(u8, plain, '.') orelse plain.len;
        var out: std.ArrayList(u8) = .empty;
        errdefer out.deinit(a);
        for (plain, 0..) |c, i| {
            if (grouping == .thousands and !scientific and i > signed and i < integer_end and (integer_end - i) % 3 == 0) try out.append(a, ',');
            try out.append(a, c);
        }
        if (scientific) {
            try out.appendSlice(a, if (exponent < 0) "e-" else "e+");
            const magnitude: u32 = @intCast(if (exponent < 0) -exponent else exponent);
            if (magnitude < 10) try out.append(a, '0');
            var digits: [16]u8 = undefined;
            try out.appendSlice(a, try std.fmt.bufPrint(&digits, "{d}", .{magnitude}));
        }
        return out.toOwnedSlice(a);
    }
};

test "formula formats render fixed decimals significant digits and explicit grouping" {
    const a = std.testing.allocator;
    const Case = struct { format: Format, value: f64, grouping: Grouping = .none, expected: []const u8 };
    for ([_]Case{
        .{ .format = .general6, .value = 67.5, .expected = "67.5" },
        .{ .format = .fixed2, .value = 266, .expected = "266.00" },
        .{ .format = .general6, .value = 659100, .grouping = .thousands, .expected = "659,100" },
        .{ .format = .general6, .value = 999999.9, .expected = "1e+06" },
        .{ .format = .general6, .value = 0.00001, .expected = "1e-05" },
        .{ .format = .general6, .value = 0, .expected = "0" },
        .{ .format = .fixed2, .value = -1234.5, .grouping = .thousands, .expected = "-1,234.50" },
    }) |case| {
        const bytes = try case.format.render(a, case.value, case.grouping);
        defer a.free(bytes);
        try std.testing.expectEqualStrings(case.expected, bytes);
    }
    try std.testing.expectError(error.InvalidFormulaNumber, Format.general6.render(a, std.math.inf(f64), .none));
    try std.testing.expectError(error.UnsupportedFormulaFormat, Format.parse(&.{ '%', 0, 'n', 0 }));
}
