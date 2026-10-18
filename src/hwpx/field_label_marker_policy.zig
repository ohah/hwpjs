//! Label-only admission; never extend structural field-kind permission.
const std = @import("std");
const Marker = @import("field_markers.zig").Marker;

pub fn isMemo(marker: Marker) bool {
    const begin = marker.begin orelse return false;
    return std.mem.eql(u8, begin.type_raw orelse "", "MEMO");
}

pub fn supported(marker: Marker, allow_memo: bool) bool {
    const begin = marker.begin orelse return false;
    const kind = begin.type_raw orelse return false;
    if (marker.unexpected_children != 0) return false;
    if (@import("field_text_kind.zig").supported(kind)) return marker.sub_list_children == 0;
    return allow_memo and isMemo(marker) and begin.editable == true and begin.other_attributes == 0 and
        marker.parameters_children == 1 and marker.sub_list_children == 1 and marker.meta_tag_children == 0;
}

test "HWPX memo label policy excludes structural admission and unknown metadata" {
    const valid: Marker = .{ .section_ordinal = 0, .element_index = 0, .parent_element_index = 0, .parent_uri = "", .parent_local_name = "ctrl", .kind = .begin, .raw_xml = "", .begin = .{ .type_raw = "MEMO", .editable = true }, .parameters_children = 1, .sub_list_children = 1 };
    try std.testing.expect(supported(valid, true));
    try std.testing.expect(!supported(valid, false));
    try std.testing.expect(!@import("field_text_kind.zig").supported("MEMO"));
    for (0..8) |index| {
        var changed = valid;
        switch (index) {
            0 => changed.begin.?.editable = false,
            1 => changed.begin.?.editable = null,
            2 => changed.sub_list_children = 0,
            3 => changed.sub_list_children = 2,
            4 => changed.parameters_children = 0,
            5 => changed.unexpected_children = 1,
            6 => changed.begin.?.other_attributes = 1,
            7 => changed.meta_tag_children = 1,
            else => unreachable,
        }
        try std.testing.expect(!supported(changed, true));
    }
}
