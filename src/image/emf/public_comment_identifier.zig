const std = @import("std");

pub const Identifier = enum(u32) {
    windows_metafile = 0x80000001,
    begin_group = 0x00000002,
    end_group = 0x00000003,
    multi_formats = 0x40000004,
    unicode_string = 0x00000040,
    unicode_end = 0x00000080,
};

pub const Classification = union(enum) {
    windows_metafile,
    begin_group,
    end_group,
    multi_formats,
    reserved: Identifier,
    unknown: u32,
};

pub fn classify(raw: u32) Classification {
    const known = std.enums.fromInt(Identifier, raw) orelse return .{ .unknown = raw };
    return switch (known) {
        .windows_metafile => .windows_metafile,
        .begin_group => .begin_group,
        .end_group => .end_group,
        .multi_formats => .multi_formats,
        .unicode_string, .unicode_end => .{ .reserved = known },
    };
}

test "public comment identifiers distinguish defined reserved and extensible values" {
    try std.testing.expect(classify(0x80000001) == .windows_metafile);
    try std.testing.expect(classify(0x00000002) == .begin_group);
    try std.testing.expect(classify(0x00000003) == .end_group);
    try std.testing.expect(classify(0x40000004) == .multi_formats);
    try std.testing.expectEqual(Identifier.unicode_string, classify(0x00000040).reserved);
    try std.testing.expectEqual(Identifier.unicode_end, classify(0x00000080).reserved);
    try std.testing.expectEqual(@as(u32, 0), classify(0).unknown);
    try std.testing.expectEqual(std.math.maxInt(u32), classify(std.math.maxInt(u32)).unknown);
}
