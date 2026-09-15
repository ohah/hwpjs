pub const RecordType = enum(u16) {
    header = 0x4001,
    end_of_file = 0x4002,
    comment = 0x4003,
    get_dc = 0x4004,
    multi_format_start = 0x4005,
    multi_format_section = 0x4006,
    multi_format_end = 0x4007,
    object = 0x4008,
    clear = 0x4009,
    fill_rects = 0x400a,
    draw_rects = 0x400b,
    fill_polygon = 0x400c,
    draw_lines = 0x400d,
    fill_ellipse = 0x400e,
    draw_ellipse = 0x400f,
    fill_pie = 0x4010,
    draw_pie = 0x4011,
    draw_arc = 0x4012,
    fill_region = 0x4013,
    fill_path = 0x4014,
    draw_path = 0x4015,
    fill_closed_curve = 0x4016,
    draw_closed_curve = 0x4017,
    draw_curve = 0x4018,
    draw_beziers = 0x4019,
    draw_image = 0x401a,
    draw_image_points = 0x401b,
    draw_string = 0x401c,
    set_rendering_origin = 0x401d,
    set_anti_alias_mode = 0x401e,
    set_text_rendering_hint = 0x401f,
    set_text_contrast = 0x4020,
    set_interpolation_mode = 0x4021,
    set_pixel_offset_mode = 0x4022,
    set_compositing_mode = 0x4023,
    set_compositing_quality = 0x4024,
    save = 0x4025,
    restore = 0x4026,
    begin_container = 0x4027,
    begin_container_no_params = 0x4028,
    end_container = 0x4029,
    set_world_transform = 0x402a,
    reset_world_transform = 0x402b,
    multiply_world_transform = 0x402c,
    translate_world_transform = 0x402d,
    scale_world_transform = 0x402e,
    rotate_world_transform = 0x402f,
    set_page_transform = 0x4030,
    reset_clip = 0x4031,
    set_clip_rect = 0x4032,
    set_clip_path = 0x4033,
    set_clip_region = 0x4034,
    offset_clip = 0x4035,
    draw_driver_string = 0x4036,
    stroke_fill_path = 0x4037,
    serializable_object = 0x4038,
    set_ts_graphics = 0x4039,
    set_ts_clip = 0x403a,
};

pub fn parse(raw: u16) !RecordType {
    if (raw < @intFromEnum(RecordType.header) or raw > @intFromEnum(RecordType.set_ts_clip))
        return error.InvalidEmfPlusRecordType;
    return @enumFromInt(raw);
}

test "EMF+ record type accepts the complete contiguous official range" {
    const testing = @import("std").testing;
    var raw: u32 = @intFromEnum(RecordType.header);
    while (raw <= @intFromEnum(RecordType.set_ts_clip)) : (raw += 1)
        try testing.expectEqual(@as(u16, @intCast(raw)), @intFromEnum(try parse(@intCast(raw))));
    try testing.expectError(error.InvalidEmfPlusRecordType, parse(0x4000));
    try testing.expectError(error.InvalidEmfPlusRecordType, parse(0x403b));
    try testing.expectError(error.InvalidEmfPlusRecordType, parse(0xffff));
}
