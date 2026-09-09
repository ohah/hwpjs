// Independent minimal 1x1 gray JPEGs for HWP adapter tests.
const jfif = [_]u8{ 255, 224, 0, 16 } ++ "JFIF\x00".* ++ .{ 1, 2, 0, 0, 1, 0, 1, 0, 0 };
const q = [_]u8{ 255, 219, 0, 67, 0 } ++ [_]u8{8} ** 64;
const h = [_]u8{ 255, 196, 0, 38, 0, 1 } ++ [_]u8{0} ** 15 ++ .{ 1, 16, 1 } ++ [_]u8{0} ** 15 ++ .{0};
const dimensions = [_]u8{ 0, 11, 8, 0, 1, 0, 1, 1, 1, 17, 0 };
const prefix = [_]u8{ 255, 216 } ++ jfif ++ q ++ h;
pub const sequential = prefix ++ .{ 255, 192 } ++ dimensions ++ .{ 255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 0x5f, 255, 217 };
const progressive_prefix = prefix ++ .{ 255, 194 } ++ dimensions ++ .{ 255, 218, 0, 8, 1, 1, 0, 0, 0, 0, 0x7f };
pub const partial = progressive_prefix ++ .{ 255, 217 };
pub const progressive = progressive_prefix ++ .{ 255, 218, 0, 8, 1, 1, 0, 1, 63, 0, 0x7f, 255, 217 };
