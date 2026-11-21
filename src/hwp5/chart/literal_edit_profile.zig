//! Only exact own serializer output is admitted. Display support is not edit authority.
pub const Profile = enum {
    spec24_clustered_column_literals_v1,
    spec24_standard_line_literals_v1,
    spec24_clustered_horizontal_bar_literals_v1,
    spec24_standard_pie_literals_v1,
};
pub const capability_version: u32 = 4;
pub fn createProfile(profile: Profile) @import("create_profile.zig").Profile {
    return switch (profile) {
        .spec24_clustered_column_literals_v1 => .spec24_registered_png_presentation_v1,
        .spec24_standard_line_literals_v1 => .spec24_registered_png_presentation_line_v1,
        .spec24_standard_pie_literals_v1 => .spec24_registered_png_presentation_pie_v1,
        .spec24_clustered_horizontal_bar_literals_v1 => .spec24_registered_png_presentation_horizontal_bar_v1,
    };
}
