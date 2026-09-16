pub const metafile_signature: u20 = 0xdbc01;

pub const GraphicsVersion = struct {
    raw: u32,
    version: u12,
};

pub fn parse(raw: u32) !GraphicsVersion {
    if (raw >> 12 != metafile_signature) return error.InvalidEmfPlusMetafileSignature;
    return .{ .raw = raw, .version = @truncate(raw) };
}

test "EMF+ graphics version validates only the signature and preserves vendor versions" {
    const known = try parse(0xdbc01001);
    try @import("std").testing.expectEqual(@as(u12, 1), known.version);

    const vendor = try parse(0xdbc01abc);
    try @import("std").testing.expectEqual(@as(u32, 0xdbc01abc), vendor.raw);
    try @import("std").testing.expectEqual(@as(u12, 0xabc), vendor.version);

    try @import("std").testing.expectError(error.InvalidEmfPlusMetafileSignature, parse(0xdbc00001));
    try @import("std").testing.expectError(error.InvalidEmfPlusMetafileSignature, parse(0xebc01001));
}
