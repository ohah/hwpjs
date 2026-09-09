const std = @import("std");
const t = std.testing;
const Rules = @import("sequential_symbols.zig").Rules;
const Kind = @import("sequential_symbols.zig").Kind;
const frame_parser = @import("frame.zig");

test "JPEG sequential DC AC symbol byte matrices distinguish 8 and 12 bit precision" {
    for ([_]u8{ 8, 12 }) |precision| {
        const bytes = [_]u8{ precision, 0, 1, 0, 1, 1, 9, 17, 0 };
        const rules = try Rules.forFrame(try frame_parser.parse(0xc1, &bytes, .{}));
        for (0..256) |n| {
            const symbol: u8 = @intCast(n);
            if (n <= precision + 3) {
                try t.expectEqual(symbol, try rules.dc(symbol));
            } else try t.expectError(error.InvalidJpegDcCategory, rules.dc(symbol));
            const width = symbol % 16;
            if (n == 0 or n == 240) {
                const ac = try rules.ac(symbol);
                try t.expectEqual(if (n == 0) Kind.end_of_block else Kind.zero_run, ac.kind);
                try t.expectEqual(@as(u8, if (n == 0) 0 else 16), ac.zeros);
                try t.expectEqual(@as(u8, 0), ac.width);
            } else if (width > 0 and width <= precision + 2) {
                const ac = try rules.ac(symbol);
                try t.expectEqual(Kind.coefficient, ac.kind);
                try t.expectEqual(symbol / 16, ac.zeros);
                try t.expectEqual(width, ac.width);
            } else try t.expectError(error.InvalidJpegAcSymbol, rules.ac(symbol));
        }
    }
}

test "JPEG sequential symbol rules reject progressive lossless and arithmetic processes" {
    const bytes = [_]u8{ 8, 0, 1, 0, 1, 1, 9, 17, 0 };
    for ([_]u8{ 0xc2, 0xc3, 0xc9, 0xca, 0xcb }) |code| try t.expectError(error.UnsupportedJpegSequentialProcess, Rules.forFrame(try frame_parser.parse(code, &bytes, .{})));
    _ = try Rules.forFrame(try frame_parser.parse(0xc0, &bytes, .{}));
}
