//! Explicit Native experiment. No default profile or public ABI capability.
const std = @import("std");
pub const Profile = @import("create_profile.zig").Profile;
pub const Request = struct {
    target: @import("../edit/equation_create_request.zig").Target,
    expected_text_utf16le: []const u8,
    box: @import("../edit/equation_create_request.zig").Box,
    data: @import("../../hwpx/chart_create_data.zig").Data,
    rendered: @import("create_rendered_resources.zig").Payload,
    profile: Profile,
};
pub fn validate(r: Request) !void {
    try @import("create_profile.zig").validate(r.data, r.profile);
    if (r.box.width == 0 or r.box.height == 0 or r.box.width > std.math.maxInt(i32) or r.box.height > std.math.maxInt(i32)) return error.InvalidChartCreateBox;
    if (r.expected_text_utf16le.len % 2 != 0) return error.InvalidChartCreateExpectedText;
    if (r.target.binding == null) return error.SourceBindingMismatch;
    switch (r.profile) {
        .spec24_registered_png_presentation_v1, .spec24_registered_png_presentation_line_v1 => {},
    }
}
