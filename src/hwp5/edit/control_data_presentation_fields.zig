//! Observed retention layouts; numeric item IDs are not invented semantic names.
pub const Profile = enum { classic, expanded_gradient };
pub const Layout = struct { profile: Profile, presentation_count: u16, fill_count: u16 };
const layouts = [_]Layout{
    .{ .profile = .classic, .presentation_count = 3, .fill_count = 15 },
    .{ .profile = .expanded_gradient, .presentation_count = 6, .fill_count = 14 },
};
pub fn select(count: u16) !Layout {
    for (layouts) |layout| if (layout.presentation_count == count) return layout;
    return error.UnsupportedControlData;
}
pub fn presentationKind(profile: Profile, id: u16) !u16 {
    if (id == 0x4000) return 9;
    return switch (profile) {
        .classic => if (id == 0x4002) 9 else error.UnsupportedControlData,
        .expanded_gradient => switch (id) {
            0x4002, 0x4003 => 5,
            0x4004, 0x4005 => 9,
            else => error.UnsupportedControlData,
        },
    };
}
pub fn fillKind(profile: Profile, id: u16) !u16 {
    return switch (id) {
        0x4001 => 9,
        0x4002...0x4007 => 5,
        0x4008, 0x4009 => 0x8001,
        0x400a => 6,
        else => switch (profile) {
            .classic => switch (id) {
                0x4020, 0x4024 => 5,
                0x4021, 0x4022 => 2,
                0x401e => 0x8002,
                else => error.UnsupportedControlData,
            },
            .expanded_gradient => switch (id) {
                0x400b, 0x402f, 0x4030, 0x4031 => 6,
                else => error.UnsupportedControlData,
            },
        },
    };
}

test "presentation retention layouts reject unknown counts and cross-profile fields" {
    const std = @import("std");
    try std.testing.expectEqual(Profile.classic, (try select(3)).profile);
    try std.testing.expectEqual(@as(u16, 15), (try select(3)).fill_count);
    try std.testing.expectEqual(Profile.expanded_gradient, (try select(6)).profile);
    try std.testing.expectEqual(@as(u16, 14), (try select(6)).fill_count);
    for ([_]u16{ 0, 1, 2, 4, 5, 7, 65535 }) |count|
        try std.testing.expectError(error.UnsupportedControlData, select(count));
    try std.testing.expectEqual(@as(u16, 9), try presentationKind(.classic, 0x4002));
    try std.testing.expectEqual(@as(u16, 5), try presentationKind(.expanded_gradient, 0x4002));
    for ([_]u16{ 0x4003, 0x4004, 0x4005 }) |id|
        try std.testing.expectError(error.UnsupportedControlData, presentationKind(.classic, id));
    for ([_]u16{ 0x4020, 0x4024, 0x4021, 0x4022, 0x401e }) |id|
        try std.testing.expectError(error.UnsupportedControlData, fillKind(.expanded_gradient, id));
    for ([_]u16{ 0x400b, 0x402f, 0x4030, 0x4031 }) |id| {
        try std.testing.expectEqual(@as(u16, 6), try fillKind(.expanded_gradient, id));
        try std.testing.expectError(error.UnsupportedControlData, fillKind(.classic, id));
    }
    for ([_]Profile{ .classic, .expanded_gradient }) |profile| {
        try std.testing.expectError(error.UnsupportedControlData, presentationKind(profile, 0x4040));
        try std.testing.expectError(error.UnsupportedControlData, fillKind(profile, 0x4040));
    }
}
