pub const Operation = enum(u8) {
    source_over = 0,
};

pub const AlphaFormat = enum(u8) {
    constant = 0,
    source_alpha = 1,
};

pub const BlendFunction = struct {
    operation: Operation,
    flags: u8,
    source_constant_alpha: u8,
    alpha_format: AlphaFormat,
};

pub fn parse(bytes: *const [4]u8) !BlendFunction {
    const operation: Operation = switch (bytes[0]) {
        0 => .source_over,
        else => return error.UnsupportedEmfBlendOperation,
    };
    const alpha_format: AlphaFormat = switch (bytes[3]) {
        0 => .constant,
        1 => .source_alpha,
        else => return error.UnsupportedEmfAlphaFormat,
    };
    return .{
        .operation = operation,
        // MS-EMF requires zero on the wire but explicitly says playback MUST
        // ignore this byte, so preserve it instead of rejecting producers.
        .flags = bytes[1],
        .source_constant_alpha = bytes[2],
        .alpha_format = alpha_format,
    };
}

test "BLENDFUNCTION parses defined operation and both alpha formats" {
    const constant = try parse(&.{ 0, 0, 0x7f, 0 });
    try @import("std").testing.expectEqual(Operation.source_over, constant.operation);
    try @import("std").testing.expectEqual(@as(u8, 0x7f), constant.source_constant_alpha);
    try @import("std").testing.expectEqual(AlphaFormat.constant, constant.alpha_format);

    const per_pixel = try parse(&.{ 0, 0xa5, 0xff, 1 });
    try @import("std").testing.expectEqual(@as(u8, 0xa5), per_pixel.flags);
    try @import("std").testing.expectEqual(AlphaFormat.source_alpha, per_pixel.alpha_format);
}

test "BLENDFUNCTION rejects undefined operation and alpha format" {
    const t = @import("std").testing;
    try t.expectError(error.UnsupportedEmfBlendOperation, parse(&.{ 1, 0, 0xff, 0 }));
    try t.expectError(error.UnsupportedEmfAlphaFormat, parse(&.{ 0, 0, 0xff, 2 }));
    try t.expectError(error.UnsupportedEmfAlphaFormat, parse(&.{ 0, 0, 0xff, 0x80 }));
}
