const record_type = @import("emf_plus_record_type.zig");

pub const Policy = enum {
    wire_validated,
    opaque_preserved,
    forbidden,
};

pub fn policy(kind: record_type.RecordType) Policy {
    return switch (kind) {
        .multi_format_start, .multi_format_section, .multi_format_end => .forbidden,
        .stroke_fill_path => .opaque_preserved,
        .header,
        .end_of_file,
        .comment,
        .get_dc,
        .object,
        .clear,
        .fill_rects,
        .draw_rects,
        .fill_polygon,
        .draw_lines,
        .fill_ellipse,
        .draw_ellipse,
        .fill_pie,
        .draw_pie,
        .draw_arc,
        .fill_region,
        .fill_path,
        .draw_path,
        .fill_closed_curve,
        .draw_closed_curve,
        .draw_curve,
        .draw_beziers,
        .draw_image,
        .draw_image_points,
        .draw_string,
        .set_rendering_origin,
        .set_anti_alias_mode,
        .set_text_rendering_hint,
        .set_text_contrast,
        .set_interpolation_mode,
        .set_pixel_offset_mode,
        .set_compositing_mode,
        .set_compositing_quality,
        .save,
        .restore,
        .begin_container,
        .begin_container_no_params,
        .end_container,
        .set_world_transform,
        .reset_world_transform,
        .multiply_world_transform,
        .translate_world_transform,
        .scale_world_transform,
        .rotate_world_transform,
        .set_page_transform,
        .reset_clip,
        .set_clip_rect,
        .set_clip_path,
        .set_clip_region,
        .offset_clip,
        .draw_driver_string,
        .serializable_object,
        .set_ts_graphics,
        .set_ts_clip,
        => .wire_validated,
    };
}

const std = @import("std");

test "EMF+ record support exhaustively classifies the official contiguous range" {
    var counts = [_]usize{0} ** std.meta.fields(Policy).len;
    var raw: u32 = @intFromEnum(record_type.RecordType.header);
    while (raw <= @intFromEnum(record_type.RecordType.set_ts_clip)) : (raw += 1) {
        const kind = try record_type.parse(@intCast(raw));
        const actual = policy(kind);
        const expected: Policy = if (raw >= 0x4005 and raw <= 0x4007)
            .forbidden
        else if (raw == 0x4037)
            .opaque_preserved
        else
            .wire_validated;
        try std.testing.expectEqual(expected, actual);
        counts[@intFromEnum(actual)] += 1;
    }
    try std.testing.expectEqual(@as(usize, 54), counts[@intFromEnum(Policy.wire_validated)]);
    try std.testing.expectEqual(@as(usize, 1), counts[@intFromEnum(Policy.opaque_preserved)]);
    try std.testing.expectEqual(@as(usize, 3), counts[@intFromEnum(Policy.forbidden)]);
}
