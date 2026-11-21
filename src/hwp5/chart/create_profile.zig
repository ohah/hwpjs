//! Explicit HWP5 carrier profiles; legacy bytes and sizing remain unchanged.
const std = @import("std");
const data_module = @import("../../hwpx/chart_create_data.zig");
const chart_profiles = @import("../../hwpx/chart_create_profile.zig");
pub const Profile = enum {
    spec24_registered_png_presentation_v1,
    spec24_registered_png_presentation_line_v1,
    spec24_registered_png_presentation_horizontal_bar_v1,
    spec24_registered_png_presentation_pie_v1,
};
pub const version = 4;

pub fn decode(name: []const u8) !Profile {
    if (std.mem.eql(u8, name, "spec24-registered-png-presentation-v1"))
        return .spec24_registered_png_presentation_v1;
    if (std.mem.eql(u8, name, "spec24-registered-png-presentation-line-v1"))
        return .spec24_registered_png_presentation_line_v1;
    if (std.mem.eql(u8, name, "spec24-registered-png-presentation-horizontal-bar-v1"))
        return .spec24_registered_png_presentation_horizontal_bar_v1;
    if (std.mem.eql(u8, name, "spec24-registered-png-presentation-pie-v1"))
        return .spec24_registered_png_presentation_pie_v1;
    return error.UnsupportedChartCreateProfile;
}

pub fn chartProfile(profile: Profile) ?chart_profiles.Profile {
    return switch (profile) {
        .spec24_registered_png_presentation_v1 => null,
        .spec24_registered_png_presentation_pie_v1 => .{ .kind = .pieChart },
        .spec24_registered_png_presentation_horizontal_bar_v1 => .{ .kind = .barChart, .bar_direction = .bar, .grouping = .clustered },
        .spec24_registered_png_presentation_line_v1 => .{ .kind = .lineChart, .grouping = .standard },
    };
}
pub fn validate(data: data_module.Data, profile: Profile) !void {
    try data_module.validateFor(data, chartProfile(profile));
    if (profile == .spec24_registered_png_presentation_pie_v1)
        try @import("create_pie_admission.zig").validate(data.series[0].values);
    // A markerless one-category chart has no visible line segment.
    if (profile == .spec24_registered_png_presentation_line_v1 and data.categories.len < 2)
        return error.InvalidChartCreateShape;
}
pub fn create(a: std.mem.Allocator, data: data_module.Data, profile: Profile) ![]u8 {
    try validate(data, profile);
    return @import("../../hwpx/chart_create_xml.zig").createFor(a, data, chartProfile(profile));
}
