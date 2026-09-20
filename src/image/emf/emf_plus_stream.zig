const std = @import("std");
const comment_record = @import("comment_record.zig");
const record = @import("emf_plus_record.zig");
const header_record = @import("emf_plus_header.zig");
const private_comment = @import("emf_plus_comment.zig");
const object_record = @import("emf_plus_object.zig");
const serializable_object = @import("emf_plus_serializable_object.zig");
const image_effect_guid = @import("emf_plus_image_effect_guid.zig");
const clear_record = @import("emf_plus_clear.zig");
const draw_arc_record = @import("emf_plus_draw_arc.zig");
const draw_beziers_record = @import("emf_plus_draw_beziers.zig");
const draw_closed_curve_record = @import("emf_plus_draw_closed_curve.zig");
const draw_curve_record = @import("emf_plus_draw_curve.zig");
const draw_driver_string_record = @import("emf_plus_draw_driver_string.zig");
const draw_ellipse_record = @import("emf_plus_draw_ellipse.zig");
const draw_image_record = @import("emf_plus_draw_image.zig");
const draw_image_points_record = @import("emf_plus_draw_image_points.zig");
const draw_lines_record = @import("emf_plus_draw_lines.zig");
const draw_path_record = @import("emf_plus_draw_path.zig");
const draw_pie_record = @import("emf_plus_draw_pie.zig");
const draw_rects_record = @import("emf_plus_draw_rects.zig");
const draw_string_record = @import("emf_plus_draw_string.zig");
const set_rendering_origin_record = @import("emf_plus_set_rendering_origin.zig");
const set_anti_alias_mode_record = @import("emf_plus_set_anti_alias_mode.zig");
const set_text_rendering_hint_record = @import("emf_plus_set_text_rendering_hint.zig");
const set_text_contrast_record = @import("emf_plus_set_text_contrast.zig");
const set_interpolation_mode_record = @import("emf_plus_set_interpolation_mode.zig");
const set_pixel_offset_mode_record = @import("emf_plus_set_pixel_offset_mode.zig");
const set_compositing_mode_record = @import("emf_plus_set_compositing_mode.zig");
const set_compositing_quality_record = @import("emf_plus_set_compositing_quality.zig");
const begin_container_record = @import("emf_plus_begin_container.zig");
const begin_container_no_params_record = @import("emf_plus_begin_container_no_params.zig");
const end_container_record = @import("emf_plus_end_container.zig");
const set_ts_clip_record = @import("emf_plus_set_ts_clip.zig");
const set_ts_graphics_record = @import("emf_plus_set_ts_graphics.zig");
const multiply_world_transform_record = @import("emf_plus_multiply_world_transform.zig");
const set_world_transform_record = @import("emf_plus_set_world_transform.zig");
const reset_world_transform_record = @import("emf_plus_reset_world_transform.zig");
const translate_world_transform_record = @import("emf_plus_translate_world_transform.zig");
const scale_world_transform_record = @import("emf_plus_scale_world_transform.zig");
const rotate_world_transform_record = @import("emf_plus_rotate_world_transform.zig");
const set_page_transform_record = @import("emf_plus_set_page_transform.zig");
const save_record = @import("emf_plus_save.zig");
const restore_record = @import("emf_plus_restore.zig");
const graphics_state_stack = @import("emf_plus_graphics_state_stack.zig");

pub const Report = struct {
    comments: usize = 0,
    records: usize = 0,
    header: ?header_record.Header = null,
    end_of_file_records: usize = 0,
    get_dc_records: usize = 0,
    private_comments: usize = 0,
    private_data_bytes: usize = 0,
    objects: object_record.Report = .{},
    serializable_objects: usize = 0,
    image_effects: [image_effect_guid.effect_count]usize = .{0} ** image_effect_guid.effect_count,
    clear_records: usize = 0,
    draw_arc_records: usize = 0,
    draw_beziers_records: usize = 0,
    draw_closed_curve_records: usize = 0,
    draw_curve_records: usize = 0,
    draw_driver_string_records: usize = 0,
    draw_ellipse_records: usize = 0,
    draw_image_records: usize = 0,
    draw_image_points_records: usize = 0,
    draw_lines_records: usize = 0,
    draw_path_records: usize = 0,
    draw_pie_records: usize = 0,
    draw_rects_records: usize = 0,
    draw_string_records: usize = 0,
    set_rendering_origin_records: usize = 0,
    set_anti_alias_mode_records: usize = 0,
    set_text_rendering_hint_records: usize = 0,
    set_text_contrast_records: usize = 0,
    set_interpolation_mode_records: usize = 0,
    set_pixel_offset_mode_records: usize = 0,
    set_compositing_mode_records: usize = 0,
    set_compositing_quality_records: usize = 0,
    set_compositing_quality_windows_fallback_records: usize = 0,
    begin_container_records: usize = 0,
    begin_container_discouraged_page_unit_records: usize = 0,
    begin_container_no_params_records: usize = 0,
    end_container_records: usize = 0,
    set_ts_clip_records: usize = 0,
    set_ts_graphics_records: usize = 0,
    multiply_world_transform_records: usize = 0,
    set_world_transform_records: usize = 0,
    reset_world_transform_records: usize = 0,
    translate_world_transform_records: usize = 0,
    scale_world_transform_records: usize = 0,
    rotate_world_transform_records: usize = 0,
    set_page_transform_records: usize = 0,
    set_page_transform_discouraged_page_unit_records: usize = 0,
    save_records: usize = 0,
    restore_records: usize = 0,
    graphics_state_max_depth: usize = 0,
};

pub const State = struct {
    report: Report = .{},
    ended: bool = false,
    object_state: object_record.State = .{},

    pub fn consume(self: *State, comment: comment_record.Comment, emf_record_index: usize) !bool {
        return self.consumeInner(comment, emf_record_index, null);
    }

    pub fn consumeTracked(self: *State, stack: *graphics_state_stack.Stack, comment: comment_record.Comment, emf_record_index: usize) !bool {
        if (comment.classification != .emf_plus) return false;
        var pending_stack = try stack.clone();
        errdefer pending_stack.deinit();
        const consumed = try self.consumeInner(comment, emf_record_index, &pending_stack);
        stack.deinit();
        stack.* = pending_stack;
        return consumed;
    }

    fn consumeInner(self: *State, comment: comment_record.Comment, emf_record_index: usize, stack: ?*graphics_state_stack.Stack) !bool {
        if (comment.classification != .emf_plus) return false;
        if (self.ended) return error.EmfPlusRecordAfterEndOfFile;

        var iterator: record.Iterator = .{ .bytes = comment.parameters };
        var records_in_comment: usize = 0;
        var pending = self.*;
        while (try iterator.next()) |value| {
            records_in_comment += 1;
            pending.report.records = std.math.add(usize, pending.report.records, 1) catch return error.LimitExceeded;
            if (pending.report.header == null) {
                if (emf_record_index != 2 or value.kind != .header) return error.MissingInitialEmfPlusHeader;
                pending.report.header = try header_record.parse(value);
            } else if (value.kind == .header) return error.DuplicateEmfPlusHeader;

            switch (value.kind) {
                .end_of_file => {
                    if (value.size != 12 or value.data_size != 0) return error.InvalidEmfPlusEndOfFileSize;
                    pending.report.end_of_file_records += 1;
                    pending.ended = true;
                    if (iterator.offset != comment.parameters.len) return error.EmfPlusRecordAfterEndOfFile;
                },
                .get_dc => {
                    if (value.size != 12 or value.data_size != 0) return error.InvalidEmfPlusGetDcSize;
                    pending.report.get_dc_records += 1;
                },
                .multi_format_start, .multi_format_section, .multi_format_end => return error.ReservedEmfPlusRecordType,
                else => {},
            }
            _ = try pending.object_state.consume(value);
            if (value.kind == .serializable_object) {
                const parsed = try serializable_object.parse(value);
                pending.report.serializable_objects = std.math.add(usize, pending.report.serializable_objects, 1) catch return error.LimitExceeded;
                const effect_index: usize = @intFromEnum(parsed.kind);
                pending.report.image_effects[effect_index] = std.math.add(usize, pending.report.image_effects[effect_index], 1) catch return error.LimitExceeded;
            }
            if (value.kind == .clear) {
                _ = try clear_record.parse(value);
                pending.report.clear_records = std.math.add(usize, pending.report.clear_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .draw_arc) {
                const parsed = try draw_arc_record.parse(value);
                const object_type = pending.object_state.table[parsed.pen_id] orelse return error.MissingEmfPlusDrawArcPen;
                if (object_type != .pen) return error.InvalidEmfPlusDrawArcPenType;
                pending.report.draw_arc_records = std.math.add(usize, pending.report.draw_arc_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .draw_beziers) {
                const parsed = try draw_beziers_record.parse(value, .{});
                const object_type = pending.object_state.table[parsed.pen_id] orelse return error.MissingEmfPlusDrawBeziersPen;
                if (object_type != .pen) return error.InvalidEmfPlusDrawBeziersPenType;
                pending.report.draw_beziers_records = std.math.add(usize, pending.report.draw_beziers_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .draw_closed_curve) {
                const parsed = try draw_closed_curve_record.parse(value, .{});
                const object_type = pending.object_state.table[parsed.pen_id] orelse return error.MissingEmfPlusDrawClosedCurvePen;
                if (object_type != .pen) return error.InvalidEmfPlusDrawClosedCurvePenType;
                pending.report.draw_closed_curve_records = std.math.add(usize, pending.report.draw_closed_curve_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .draw_curve) {
                const parsed = try draw_curve_record.parse(value, .{});
                const object_type = pending.object_state.table[parsed.pen_id] orelse return error.MissingEmfPlusDrawCurvePen;
                if (object_type != .pen) return error.InvalidEmfPlusDrawCurvePenType;
                pending.report.draw_curve_records = std.math.add(usize, pending.report.draw_curve_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .draw_driver_string) {
                const parsed = try draw_driver_string_record.parse(value, .{});
                const font_type = pending.object_state.table[parsed.font_id] orelse return error.MissingEmfPlusDrawDriverStringFont;
                if (font_type != .font) return error.InvalidEmfPlusDrawDriverStringFontType;
                switch (parsed.brush) {
                    .color => {},
                    .brush_id => |id| {
                        const brush_type = pending.object_state.table[id] orelse return error.MissingEmfPlusDrawDriverStringBrush;
                        if (brush_type != .brush) return error.InvalidEmfPlusDrawDriverStringBrushType;
                    },
                }
                pending.report.draw_driver_string_records = std.math.add(usize, pending.report.draw_driver_string_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .draw_ellipse) {
                const parsed = try draw_ellipse_record.parse(value);
                const object_type = pending.object_state.table[parsed.pen_id] orelse return error.MissingEmfPlusDrawEllipsePen;
                if (object_type != .pen) return error.InvalidEmfPlusDrawEllipsePenType;
                pending.report.draw_ellipse_records = std.math.add(usize, pending.report.draw_ellipse_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .draw_image) {
                const parsed = try draw_image_record.parse(value);
                const image_type = pending.object_state.table[parsed.image_id] orelse return error.MissingEmfPlusDrawImageImage;
                if (image_type != .image) return error.InvalidEmfPlusDrawImageImageType;
                if (parsed.image_attributes.object_id) |id| {
                    const attributes_type = pending.object_state.table[id] orelse return error.MissingEmfPlusDrawImageAttributes;
                    if (attributes_type != .image_attributes) return error.InvalidEmfPlusDrawImageAttributesType;
                }
                pending.report.draw_image_records = std.math.add(usize, pending.report.draw_image_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .draw_image_points) {
                const parsed = try draw_image_points_record.parse(value);
                if (parsed.has_effect and pending.report.serializable_objects == 0)
                    return error.MissingEmfPlusDrawImagePointsEffect;
                const image_type = pending.object_state.table[parsed.image_id] orelse return error.MissingEmfPlusDrawImagePointsImage;
                if (image_type != .image) return error.InvalidEmfPlusDrawImagePointsImageType;
                if (parsed.image_attributes.object_id) |id| {
                    const attributes_type = pending.object_state.table[id] orelse return error.MissingEmfPlusDrawImagePointsAttributes;
                    if (attributes_type != .image_attributes) return error.InvalidEmfPlusDrawImagePointsAttributesType;
                }
                pending.report.draw_image_points_records = std.math.add(usize, pending.report.draw_image_points_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .draw_lines) {
                const parsed = try draw_lines_record.parse(value, .{});
                const object_type = pending.object_state.table[parsed.pen_id] orelse return error.MissingEmfPlusDrawLinesPen;
                if (object_type != .pen) return error.InvalidEmfPlusDrawLinesPenType;
                pending.report.draw_lines_records = std.math.add(usize, pending.report.draw_lines_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .draw_path) {
                const parsed = try draw_path_record.parse(value);
                const path_type = pending.object_state.table[parsed.path_id] orelse return error.MissingEmfPlusDrawPathPath;
                if (path_type != .path) return error.InvalidEmfPlusDrawPathPathType;
                const pen_type = pending.object_state.table[parsed.pen_id] orelse return error.MissingEmfPlusDrawPathPen;
                if (pen_type != .pen) return error.InvalidEmfPlusDrawPathPenType;
                pending.report.draw_path_records = std.math.add(usize, pending.report.draw_path_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .draw_pie) {
                const parsed = try draw_pie_record.parse(value);
                const object_type = pending.object_state.table[parsed.pen_id] orelse return error.MissingEmfPlusDrawPiePen;
                if (object_type != .pen) return error.InvalidEmfPlusDrawPiePenType;
                pending.report.draw_pie_records = std.math.add(usize, pending.report.draw_pie_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .draw_rects) {
                const parsed = try draw_rects_record.parse(value, .{});
                const object_type = pending.object_state.table[parsed.pen_id] orelse return error.MissingEmfPlusDrawRectsPen;
                if (object_type != .pen) return error.InvalidEmfPlusDrawRectsPenType;
                pending.report.draw_rects_records = std.math.add(usize, pending.report.draw_rects_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .draw_string) {
                const parsed = try draw_string_record.parse(value, .{});
                const font_type = pending.object_state.table[parsed.font_id] orelse return error.MissingEmfPlusDrawStringFont;
                if (font_type != .font) return error.InvalidEmfPlusDrawStringFontType;
                switch (parsed.brush) {
                    .color => {},
                    .brush_id => |id| {
                        const brush_type = pending.object_state.table[id] orelse return error.MissingEmfPlusDrawStringBrush;
                        if (brush_type != .brush) return error.InvalidEmfPlusDrawStringBrushType;
                    },
                }
                if (parsed.format.object_id) |id| {
                    const format_type = pending.object_state.table[id] orelse return error.MissingEmfPlusDrawStringFormat;
                    if (format_type != .string_format) return error.InvalidEmfPlusDrawStringFormatType;
                }
                pending.report.draw_string_records = std.math.add(usize, pending.report.draw_string_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .set_rendering_origin) {
                _ = try set_rendering_origin_record.parse(value);
                pending.report.set_rendering_origin_records = std.math.add(usize, pending.report.set_rendering_origin_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .set_anti_alias_mode) {
                _ = try set_anti_alias_mode_record.parse(value);
                pending.report.set_anti_alias_mode_records = std.math.add(usize, pending.report.set_anti_alias_mode_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .set_text_rendering_hint) {
                _ = try set_text_rendering_hint_record.parse(value);
                pending.report.set_text_rendering_hint_records = std.math.add(usize, pending.report.set_text_rendering_hint_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .set_text_contrast) {
                _ = try set_text_contrast_record.parse(value);
                pending.report.set_text_contrast_records = std.math.add(usize, pending.report.set_text_contrast_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .set_interpolation_mode) {
                _ = try set_interpolation_mode_record.parse(value);
                pending.report.set_interpolation_mode_records = std.math.add(usize, pending.report.set_interpolation_mode_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .set_pixel_offset_mode) {
                _ = try set_pixel_offset_mode_record.parse(value);
                pending.report.set_pixel_offset_mode_records = std.math.add(usize, pending.report.set_pixel_offset_mode_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .set_compositing_mode) {
                _ = try set_compositing_mode_record.parse(value);
                pending.report.set_compositing_mode_records = std.math.add(usize, pending.report.set_compositing_mode_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .set_compositing_quality) {
                const parsed = try set_compositing_quality_record.parse(value);
                pending.report.set_compositing_quality_records = std.math.add(usize, pending.report.set_compositing_quality_records, 1) catch return error.LimitExceeded;
                switch (parsed.quality) {
                    .defined => {},
                    .invalid_windows_default => pending.report.set_compositing_quality_windows_fallback_records = std.math.add(usize, pending.report.set_compositing_quality_windows_fallback_records, 1) catch return error.LimitExceeded,
                }
            }
            if (value.kind == .save) {
                const parsed = try save_record.parse(value);
                pending.report.save_records = std.math.add(usize, pending.report.save_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| try tracked.push(.save, parsed.stack_index);
            }
            if (value.kind == .begin_container) {
                const parsed = try begin_container_record.parse(value);
                pending.report.begin_container_records = std.math.add(usize, pending.report.begin_container_records, 1) catch return error.LimitExceeded;
                if (parsed.discouraged_page_unit)
                    pending.report.begin_container_discouraged_page_unit_records = std.math.add(usize, pending.report.begin_container_discouraged_page_unit_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| try tracked.push(.container, parsed.stack_index);
            }
            if (value.kind == .begin_container_no_params) {
                const parsed = try begin_container_no_params_record.parse(value);
                pending.report.begin_container_no_params_records = std.math.add(usize, pending.report.begin_container_no_params_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| try tracked.push(.container, parsed.stack_index);
            }
            if (value.kind == .restore) {
                const parsed = try restore_record.parse(value);
                pending.report.restore_records = std.math.add(usize, pending.report.restore_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| try tracked.close(.save, parsed.stack_index);
            }
            if (value.kind == .end_container) {
                const parsed = try end_container_record.parse(value);
                pending.report.end_container_records = std.math.add(usize, pending.report.end_container_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| try tracked.close(.container, parsed.stack_index);
            }
            if (value.kind == .set_ts_clip) {
                _ = try set_ts_clip_record.parse(value);
                pending.report.set_ts_clip_records = std.math.add(usize, pending.report.set_ts_clip_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .set_ts_graphics) {
                _ = try set_ts_graphics_record.parse(value, .{});
                pending.report.set_ts_graphics_records = std.math.add(usize, pending.report.set_ts_graphics_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .multiply_world_transform) {
                _ = try multiply_world_transform_record.parse(value);
                pending.report.multiply_world_transform_records = std.math.add(usize, pending.report.multiply_world_transform_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .set_world_transform) {
                _ = try set_world_transform_record.parse(value);
                pending.report.set_world_transform_records = std.math.add(usize, pending.report.set_world_transform_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .reset_world_transform) {
                _ = try reset_world_transform_record.parse(value);
                pending.report.reset_world_transform_records = std.math.add(usize, pending.report.reset_world_transform_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .translate_world_transform) {
                _ = try translate_world_transform_record.parse(value);
                pending.report.translate_world_transform_records = std.math.add(usize, pending.report.translate_world_transform_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .scale_world_transform) {
                _ = try scale_world_transform_record.parse(value);
                pending.report.scale_world_transform_records = std.math.add(usize, pending.report.scale_world_transform_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .rotate_world_transform) {
                _ = try rotate_world_transform_record.parse(value);
                pending.report.rotate_world_transform_records = std.math.add(usize, pending.report.rotate_world_transform_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .set_page_transform) {
                const parsed = try set_page_transform_record.parse(value);
                pending.report.set_page_transform_records = std.math.add(usize, pending.report.set_page_transform_records, 1) catch return error.LimitExceeded;
                if (parsed.discouraged_page_unit)
                    pending.report.set_page_transform_discouraged_page_unit_records = std.math.add(usize, pending.report.set_page_transform_discouraged_page_unit_records, 1) catch return error.LimitExceeded;
            }
            if (private_comment.parse(value)) |parsed| {
                pending.report.private_comments = std.math.add(usize, pending.report.private_comments, 1) catch return error.LimitExceeded;
                pending.report.private_data_bytes = std.math.add(usize, pending.report.private_data_bytes, parsed.private_data.len) catch return error.LimitExceeded;
            }
        }
        if (records_in_comment == 0) return error.EmptyEmfPlusComment;
        pending.report.comments = std.math.add(usize, pending.report.comments, 1) catch return error.LimitExceeded;
        if (stack) |tracked| pending.report.graphics_state_max_depth = tracked.max_depth;
        pending.report.objects = pending.object_state.report;
        self.* = pending;
        return true;
    }

    pub fn finish(self: State) !void {
        if (self.report.header != null and !self.ended) return error.MissingEmfPlusEndOfFile;
        try self.object_state.finish();
    }

    pub fn finishTracked(self: State, stack: graphics_state_stack.Stack) !void {
        try self.finish();
        try stack.finish();
    }
};

fn testComment(parameters: []const u8) comment_record.Comment {
    return .{
        .data_size = @intCast(parameters.len + 4),
        .data = parameters,
        .leading_dword = 0x2b464d45,
        .identifier = .emf_plus,
        .classification = .emf_plus,
        .parameters = parameters,
        .alignment_padding = &.{},
        .trailing_data = &.{},
    };
}

fn writeHeader(bytes: []u8) void {
    std.mem.writeInt(u16, bytes[0..2], 0x4001, .little);
    std.mem.writeInt(u32, bytes[4..8], 28, .little);
    std.mem.writeInt(u32, bytes[8..12], 16, .little);
    std.mem.writeInt(u32, bytes[12..16], 0xdbc01001, .little);
    std.mem.writeInt(u32, bytes[20..24], 96, .little);
    std.mem.writeInt(u32, bytes[24..28], 96, .little);
}

fn writeEmptyRecord(bytes: []u8, kind: u16) void {
    std.mem.writeInt(u16, bytes[0..2], kind, .little);
    std.mem.writeInt(u32, bytes[4..8], 12, .little);
}

fn writeStackIndexRecord(bytes: []u8, kind: u16, flags: u16, stack_index: u32) void {
    std.mem.writeInt(u16, bytes[0..2], kind, .little);
    std.mem.writeInt(u16, bytes[2..4], flags, .little);
    std.mem.writeInt(u32, bytes[4..8], 16, .little);
    std.mem.writeInt(u32, bytes[8..12], 4, .little);
    std.mem.writeInt(u32, bytes[12..16], stack_index, .little);
}

fn writeBeginContainer(bytes: []u8, flags: u16, stack_index: u32) void {
    std.debug.assert(bytes.len == 48);
    @memset(bytes, 0);
    std.mem.writeInt(u16, bytes[0..2], 0x4027, .little);
    std.mem.writeInt(u16, bytes[2..4], flags, .little);
    std.mem.writeInt(u32, bytes[4..8], 48, .little);
    std.mem.writeInt(u32, bytes[8..12], 36, .little);
    for (0..8) |index|
        std.mem.writeInt(u32, bytes[12 + index * 4 ..][0..4], @bitCast(@as(f32, @floatFromInt(index + 1))), .little);
    std.mem.writeInt(u32, bytes[44..48], stack_index, .little);
}

test "EMF+ stream spans comments while every record remains locally complete" {
    var first = [_]u8{0} ** 40;
    writeHeader(first[0..28]);
    writeEmptyRecord(first[28..40], 0x4004);
    var last = [_]u8{0} ** 12;
    writeEmptyRecord(&last, 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&first), 2));
    try std.testing.expect(!try state.consume(.{
        .data_size = 0,
        .data = &.{},
        .leading_dword = null,
        .identifier = null,
        .classification = .private,
        .parameters = &.{},
        .alignment_padding = &.{},
        .trailing_data = &.{},
    }, 3));
    try std.testing.expect(try state.consume(testComment(&last), 4));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 2), state.report.comments);
    try std.testing.expectEqual(@as(usize, 3), state.report.records);
    try std.testing.expectEqual(@as(usize, 1), state.report.get_dc_records);
    try std.testing.expectEqual(@as(usize, 1), state.report.end_of_file_records);
}

test "EMF+ stream enforces initial and terminal records atomically" {
    var header = [_]u8{0} ** 28;
    writeHeader(&header);
    var eof = [_]u8{0} ** 12;
    writeEmptyRecord(&eof, 0x4002);
    var comment = [_]u8{0} ** 12;
    writeEmptyRecord(&comment, 0x4003);

    var state: State = .{};
    try std.testing.expectError(error.EmptyEmfPlusComment, state.consume(testComment(&.{}), 2));
    try std.testing.expectEqual(@as(usize, 0), state.report.records);
    try std.testing.expectError(error.MissingInitialEmfPlusHeader, state.consume(testComment(&header), 3));
    try std.testing.expectEqual(@as(?header_record.Header, null), state.report.header);
    try std.testing.expectError(error.MissingInitialEmfPlusHeader, state.consume(testComment(&comment), 2));
    try std.testing.expectEqual(@as(usize, 0), state.report.records);

    try std.testing.expect(try state.consume(testComment(&header), 2));
    try std.testing.expectError(error.DuplicateEmfPlusHeader, state.consume(testComment(&header), 3));
    try std.testing.expectEqual(@as(usize, 1), state.report.records);
    try std.testing.expectError(error.MissingEmfPlusEndOfFile, state.finish());
    try std.testing.expect(try state.consume(testComment(&eof), 3));
    try std.testing.expectError(error.EmfPlusRecordAfterEndOfFile, state.consume(testComment(&comment), 4));
    try std.testing.expectEqual(@as(usize, 2), state.report.records);
}

test "EMF+ EOF must be the final record in its comment" {
    var bytes = [_]u8{0} ** 52;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4002);
    writeEmptyRecord(bytes[40..52], 0x4003);
    var state: State = .{};
    try std.testing.expectError(error.EmfPlusRecordAfterEndOfFile, state.consume(testComment(&bytes), 2));
    try std.testing.expectEqual(@as(usize, 0), state.report.records);
}

test "EMF+ fixed control records ignore flags but require exact empty payloads" {
    var header = [_]u8{0} ** 28;
    writeHeader(&header);
    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&header), 2));

    var get_dc = [_]u8{0} ** 12;
    writeEmptyRecord(&get_dc, 0x4004);
    std.mem.writeInt(u16, get_dc[2..4], 0xffff, .little);
    try std.testing.expect(try state.consume(testComment(&get_dc), 3));

    var bad_get_dc = [_]u8{0} ** 16;
    writeEmptyRecord(bad_get_dc[0..12], 0x4004);
    std.mem.writeInt(u32, bad_get_dc[4..8], 16, .little);
    std.mem.writeInt(u32, bad_get_dc[8..12], 4, .little);
    try std.testing.expectError(error.InvalidEmfPlusGetDcSize, state.consume(testComment(&bad_get_dc), 4));
    try std.testing.expectEqual(@as(usize, 2), state.report.records);

    var eof = [_]u8{0} ** 12;
    writeEmptyRecord(&eof, 0x4002);
    std.mem.writeInt(u16, eof[2..4], 0xffff, .little);
    try std.testing.expect(try state.consume(testComment(&eof), 4));

    var second: State = .{};
    try std.testing.expect(try second.consume(testComment(&header), 2));
    var bad_eof = [_]u8{0} ** 16;
    writeEmptyRecord(bad_eof[0..12], 0x4002);
    std.mem.writeInt(u32, bad_eof[4..8], 16, .little);
    std.mem.writeInt(u32, bad_eof[8..12], 4, .little);
    try std.testing.expectError(error.InvalidEmfPlusEndOfFileSize, second.consume(testComment(&bad_eof), 3));
    try std.testing.expectEqual(@as(usize, 1), second.report.records);
}

test "EMF+ stream counts private comments without interpreting their data" {
    var bytes = [_]u8{0} ** 48;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x4003, .little);
    std.mem.writeInt(u16, bytes[30..32], 0xffff, .little);
    std.mem.writeInt(u32, bytes[32..36], 20, .little);
    std.mem.writeInt(u32, bytes[36..40], 8, .little);
    bytes[40..48].* = .{ 0, 1, 2, 3, 0xfc, 0xfd, 0xfe, 0xff };
    var eof = [_]u8{0} ** 12;
    writeEmptyRecord(&eof, 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try std.testing.expect(try state.consume(testComment(&eof), 3));
    try std.testing.expectEqual(@as(usize, 1), state.report.private_comments);
    try std.testing.expectEqual(@as(usize, 8), state.report.private_data_bytes);
}

test "EMF+ stream rejects all reserved multi-format record types atomically" {
    var header = [_]u8{0} ** 28;
    writeHeader(&header);
    for ([_]u16{ 0x4005, 0x4006, 0x4007 }) |kind| {
        var reserved = [_]u8{0} ** 12;
        writeEmptyRecord(&reserved, kind);
        var state: State = .{};
        try std.testing.expect(try state.consume(testComment(&header), 2));
        try std.testing.expectError(error.ReservedEmfPlusRecordType, state.consume(testComment(&reserved), 3));
        try std.testing.expectEqual(@as(usize, 1), state.report.records);
        try std.testing.expectEqual(@as(usize, 1), state.report.comments);
        try std.testing.expectError(error.MissingEmfPlusEndOfFile, state.finish());
    }
}

test "EMF+ private comment aggregate overflow leaves the entire state unchanged" {
    var bytes = [_]u8{0} ** 44;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x4003, .little);
    std.mem.writeInt(u32, bytes[32..36], 16, .little);
    std.mem.writeInt(u32, bytes[36..40], 4, .little);
    bytes[40..44].* = .{ 1, 2, 3, 4 };

    var count_overflow: State = .{};
    count_overflow.report.private_comments = std.math.maxInt(usize);
    try std.testing.expectError(error.LimitExceeded, count_overflow.consume(testComment(&bytes), 2));
    try std.testing.expectEqual(@as(?header_record.Header, null), count_overflow.report.header);
    try std.testing.expectEqual(@as(usize, 0), count_overflow.report.records);
    try std.testing.expectEqual(std.math.maxInt(usize), count_overflow.report.private_comments);

    var bytes_overflow: State = .{};
    bytes_overflow.report.private_data_bytes = std.math.maxInt(usize) - 3;
    try std.testing.expectError(error.LimitExceeded, bytes_overflow.consume(testComment(&bytes), 2));
    try std.testing.expectEqual(@as(?header_record.Header, null), bytes_overflow.report.header);
    try std.testing.expectEqual(@as(usize, 0), bytes_overflow.report.records);
    try std.testing.expectEqual(std.math.maxInt(usize) - 3, bytes_overflow.report.private_data_bytes);
}

test "EMF+ multipart object crosses comments and ignores intervening non-object records" {
    var first = [_]u8{0} ** 48;
    writeHeader(first[0..28]);
    std.mem.writeInt(u16, first[28..30], 0x4008, .little);
    std.mem.writeInt(u16, first[30..32], 0x8507, .little);
    std.mem.writeInt(u32, first[32..36], 20, .little);
    std.mem.writeInt(u32, first[36..40], 8, .little);
    std.mem.writeInt(u32, first[40..44], 8, .little);
    first[44..48].* = .{ 1, 2, 3, 4 };

    var second = [_]u8{0} ** 44;
    writeEmptyRecord(second[0..12], 0x4004);
    std.mem.writeInt(u16, second[12..14], 0x4008, .little);
    std.mem.writeInt(u16, second[14..16], 0x0507, .little);
    std.mem.writeInt(u32, second[16..20], 20, .little);
    std.mem.writeInt(u32, second[20..24], 8, .little);
    std.mem.writeInt(u32, second[24..28], 8, .little);
    second[28..32].* = .{ 5, 6, 7, 8 };
    writeEmptyRecord(second[32..44], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&first), 2));
    try std.testing.expect(try state.consume(testComment(&second), 3));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 2), state.report.objects.records);
    try std.testing.expectEqual(@as(usize, 1), state.report.objects.completed);
    try std.testing.expectEqual(@as(usize, 2), state.report.objects.multipart_fragments);
    try std.testing.expectEqual(@as(usize, 8), state.report.objects.object_data_bytes);
    try std.testing.expectEqual(object_record.ObjectType.image, state.object_state.table[7].?);
}

test "EMF+ EOF cannot complete a pending multipart object" {
    var bytes = [_]u8{0} ** 60;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x4008, .little);
    std.mem.writeInt(u16, bytes[30..32], 0x8100, .little);
    std.mem.writeInt(u32, bytes[32..36], 20, .little);
    std.mem.writeInt(u32, bytes[36..40], 8, .little);
    std.mem.writeInt(u32, bytes[40..44], 8, .little);
    bytes[44..48].* = .{ 1, 2, 3, 4 };
    writeEmptyRecord(bytes[48..60], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try std.testing.expectError(error.TruncatedEmfPlusObject, state.finish());
    try std.testing.expectEqual(@as(usize, 0), state.report.objects.completed);
    try std.testing.expectEqual(@as(usize, 0), state.report.objects.live_objects);
}

test "EMF+ stream validates and counts serializable image effects" {
    var bytes = [_]u8{0} ** 80;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x4038, .little);
    std.mem.writeInt(u16, bytes[30..32], 0xffff, .little);
    std.mem.writeInt(u32, bytes[32..36], 40, .little);
    std.mem.writeInt(u32, bytes[36..40], 28, .little);
    bytes[40..56].* = image_effect_guid.tint;
    std.mem.writeInt(u32, bytes[56..60], 8, .little);
    std.mem.writeInt(u32, bytes[60..64], @bitCast(@as(i32, -180)), .little);
    std.mem.writeInt(u32, bytes[64..68], 100, .little);
    writeEmptyRecord(bytes[68..80], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.serializable_objects);
    try std.testing.expectEqual(@as(usize, 1), state.report.image_effects[@intFromEnum(image_effect_guid.Kind.tint)]);
    for (state.report.image_effects, 0..) |count, i|
        if (i != @intFromEnum(image_effect_guid.Kind.tint)) try std.testing.expectEqual(@as(usize, 0), count);
}

test "EMF+ serializable aggregate overflow leaves the whole comment unchanged" {
    var bytes = [_]u8{0} ** 68;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x4038, .little);
    std.mem.writeInt(u32, bytes[32..36], 40, .little);
    std.mem.writeInt(u32, bytes[36..40], 28, .little);
    bytes[40..56].* = image_effect_guid.tint;
    std.mem.writeInt(u32, bytes[56..60], 8, .little);

    var count_overflow: State = .{};
    count_overflow.report.serializable_objects = std.math.maxInt(usize);
    const before_count = count_overflow;
    try std.testing.expectError(error.LimitExceeded, count_overflow.consume(testComment(&bytes), 2));
    try std.testing.expectEqualDeep(before_count, count_overflow);

    var effect_overflow: State = .{};
    effect_overflow.report.image_effects[@intFromEnum(image_effect_guid.Kind.tint)] = std.math.maxInt(usize);
    const before_effect = effect_overflow;
    try std.testing.expectError(error.LimitExceeded, effect_overflow.consume(testComment(&bytes), 2));
    try std.testing.expectEqualDeep(before_effect, effect_overflow);
}

test "EMF+ stream validates and counts Clear records atomically" {
    var bytes = [_]u8{0} ** 56;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x4009, .little);
    std.mem.writeInt(u16, bytes[30..32], 0xffff, .little);
    std.mem.writeInt(u32, bytes[32..36], 16, .little);
    std.mem.writeInt(u32, bytes[36..40], 4, .little);
    bytes[40..44].* = .{ 0x11, 0x22, 0x33, 0x44 };
    writeEmptyRecord(bytes[44..56], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.clear_records);

    var malformed = bytes;
    std.mem.writeInt(u16, malformed[28..30], 0x4009, .little);
    std.mem.writeInt(u32, malformed[32..36], 12, .little);
    std.mem.writeInt(u32, malformed[36..40], 0, .little);
    var malformed_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusClearSize, malformed_state.consume(testComment(malformed[0..40]), 2));
    try std.testing.expectEqualDeep(State{}, malformed_state);

    var overflow: State = .{};
    overflow.report.clear_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..44]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream resolves DrawArc Pen references and remains atomic" {
    var bytes = [_]u8{0} ** 88;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4008);
    std.mem.writeInt(u16, bytes[30..32], 0x0205, .little);
    std.mem.writeInt(u16, bytes[40..42], 0x4012, .little);
    std.mem.writeInt(u16, bytes[42..44], 0x0005, .little);
    std.mem.writeInt(u32, bytes[44..48], 36, .little);
    std.mem.writeInt(u32, bytes[48..52], 24, .little);
    std.mem.writeInt(u32, bytes[52..56], @bitCast(@as(f32, 90.0)), .little);
    std.mem.writeInt(u32, bytes[56..60], @bitCast(@as(f32, -180.0)), .little);
    writeEmptyRecord(bytes[76..88], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.draw_arc_records);
    try std.testing.expectEqual(object_record.ObjectType.pen, state.object_state.table[5].?);

    var missing = bytes;
    std.mem.writeInt(u16, missing[42..44], 0x0006, .little);
    var missing_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusDrawArcPen, missing_state.consume(testComment(&missing), 2));
    try std.testing.expectEqualDeep(State{}, missing_state);

    var wrong_type = bytes;
    std.mem.writeInt(u16, wrong_type[30..32], 0x0505, .little);
    var wrong_type_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusDrawArcPenType, wrong_type_state.consume(testComment(&wrong_type), 2));
    try std.testing.expectEqualDeep(State{}, wrong_type_state);

    var invalid_id = bytes;
    std.mem.writeInt(u16, invalid_id[42..44], 0x0040, .little);
    var invalid_id_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusObjectId, invalid_id_state.consume(testComment(&invalid_id), 2));
    try std.testing.expectEqualDeep(State{}, invalid_id_state);

    var overflow: State = .{};
    overflow.report.draw_arc_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..76]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream resolves DrawPie Pen references and remains atomic" {
    var bytes = [_]u8{0} ** 88;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4008);
    std.mem.writeInt(u16, bytes[30..32], 0x0205, .little);
    std.mem.writeInt(u16, bytes[40..42], 0x4011, .little);
    std.mem.writeInt(u16, bytes[42..44], 0x0005, .little);
    std.mem.writeInt(u32, bytes[44..48], 36, .little);
    std.mem.writeInt(u32, bytes[48..52], 24, .little);
    std.mem.writeInt(u32, bytes[52..56], @bitCast(@as(f32, 90.0)), .little);
    std.mem.writeInt(u32, bytes[56..60], @bitCast(@as(f32, -180.0)), .little);
    writeEmptyRecord(bytes[76..88], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.draw_pie_records);
    try std.testing.expectEqual(object_record.ObjectType.pen, state.object_state.table[5].?);

    var missing = bytes;
    std.mem.writeInt(u16, missing[42..44], 0x0006, .little);
    var missing_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusDrawPiePen, missing_state.consume(testComment(&missing), 2));
    try std.testing.expectEqualDeep(State{}, missing_state);

    var wrong_type = bytes;
    std.mem.writeInt(u16, wrong_type[30..32], 0x0505, .little);
    var wrong_type_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusDrawPiePenType, wrong_type_state.consume(testComment(&wrong_type), 2));
    try std.testing.expectEqualDeep(State{}, wrong_type_state);

    var invalid_id = bytes;
    std.mem.writeInt(u16, invalid_id[42..44], 0x0040, .little);
    var invalid_id_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusObjectId, invalid_id_state.consume(testComment(&invalid_id), 2));
    try std.testing.expectEqualDeep(State{}, invalid_id_state);

    var overflow: State = .{};
    overflow.report.draw_pie_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..76]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream resolves DrawRects Pen references and remains atomic" {
    var bytes = [_]u8{0} ** 76;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4008);
    std.mem.writeInt(u16, bytes[30..32], 0x0205, .little);
    std.mem.writeInt(u16, bytes[40..42], 0x400b, .little);
    std.mem.writeInt(u16, bytes[42..44], 0x4005, .little);
    std.mem.writeInt(u32, bytes[44..48], 24, .little);
    std.mem.writeInt(u32, bytes[48..52], 12, .little);
    std.mem.writeInt(u32, bytes[52..56], 1, .little);
    writeEmptyRecord(bytes[64..76], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.draw_rects_records);

    var missing = bytes;
    std.mem.writeInt(u16, missing[42..44], 0x4006, .little);
    var missing_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusDrawRectsPen, missing_state.consume(testComment(&missing), 2));
    try std.testing.expectEqualDeep(State{}, missing_state);

    var wrong_type = bytes;
    std.mem.writeInt(u16, wrong_type[30..32], 0x0505, .little);
    var wrong_type_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusDrawRectsPenType, wrong_type_state.consume(testComment(&wrong_type), 2));
    try std.testing.expectEqualDeep(State{}, wrong_type_state);

    var overflow: State = .{};
    overflow.report.draw_rects_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..64]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream resolves DrawString Font Brush and optional StringFormat references atomically" {
    var bytes = [_]u8{0} ** 120;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4008);
    std.mem.writeInt(u16, bytes[30..32], 0x0605, .little);
    writeEmptyRecord(bytes[40..52], 0x4008);
    std.mem.writeInt(u16, bytes[42..44], 0x0107, .little);
    writeEmptyRecord(bytes[52..64], 0x4008);
    std.mem.writeInt(u16, bytes[54..56], 0x0709, .little);
    std.mem.writeInt(u16, bytes[64..66], 0x401c, .little);
    std.mem.writeInt(u16, bytes[66..68], 0x0005, .little);
    std.mem.writeInt(u32, bytes[68..72], 44, .little);
    std.mem.writeInt(u32, bytes[72..76], 32, .little);
    std.mem.writeInt(u32, bytes[76..80], 7, .little);
    std.mem.writeInt(u32, bytes[80..84], 9, .little);
    std.mem.writeInt(u32, bytes[84..88], 2, .little);
    bytes[104..108].* = .{ 'A', 0, 'B', 0 };
    writeEmptyRecord(bytes[108..120], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.draw_string_records);

    var literal = bytes;
    std.mem.writeInt(u16, literal[66..68], 0x8005, .little);
    std.mem.writeInt(u32, literal[76..80], 0xff010203, .little);
    std.mem.writeInt(u32, literal[80..84], 64, .little);
    std.mem.writeInt(u16, literal[42..44], 0x0607, .little);
    std.mem.writeInt(u16, literal[54..56], 0x0109, .little);
    var literal_state: State = .{};
    try std.testing.expect(try literal_state.consume(testComment(&literal), 2));
    try literal_state.finish();
    try std.testing.expectEqual(@as(usize, 1), literal_state.report.draw_string_records);

    var missing_font = bytes;
    std.mem.writeInt(u16, missing_font[66..68], 0x0006, .little);
    var missing_font_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusDrawStringFont, missing_font_state.consume(testComment(&missing_font), 2));
    try std.testing.expectEqualDeep(State{}, missing_font_state);

    var wrong_font = bytes;
    std.mem.writeInt(u16, wrong_font[30..32], 0x0105, .little);
    var wrong_font_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusDrawStringFontType, wrong_font_state.consume(testComment(&wrong_font), 2));
    try std.testing.expectEqualDeep(State{}, wrong_font_state);

    var missing_brush = bytes;
    std.mem.writeInt(u32, missing_brush[76..80], 8, .little);
    var missing_brush_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusDrawStringBrush, missing_brush_state.consume(testComment(&missing_brush), 2));
    try std.testing.expectEqualDeep(State{}, missing_brush_state);

    var wrong_brush = bytes;
    std.mem.writeInt(u16, wrong_brush[42..44], 0x0607, .little);
    var wrong_brush_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusDrawStringBrushType, wrong_brush_state.consume(testComment(&wrong_brush), 2));
    try std.testing.expectEqualDeep(State{}, wrong_brush_state);

    var missing_format = bytes;
    std.mem.writeInt(u32, missing_format[80..84], 8, .little);
    var missing_format_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusDrawStringFormat, missing_format_state.consume(testComment(&missing_format), 2));
    try std.testing.expectEqualDeep(State{}, missing_format_state);

    var wrong_format = bytes;
    std.mem.writeInt(u16, wrong_format[54..56], 0x0109, .little);
    var wrong_format_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusDrawStringFormatType, wrong_format_state.consume(testComment(&wrong_format), 2));
    try std.testing.expectEqualDeep(State{}, wrong_format_state);

    var overflow: State = .{};
    overflow.report.draw_string_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..108]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream validates and counts SetRenderingOrigin records atomically" {
    var bytes = [_]u8{0} ** 60;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x401d, .little);
    std.mem.writeInt(u16, bytes[30..32], 0xffff, .little);
    std.mem.writeInt(u32, bytes[32..36], 20, .little);
    std.mem.writeInt(u32, bytes[36..40], 8, .little);
    std.mem.writeInt(i32, bytes[40..44], -123456789, .little);
    std.mem.writeInt(i32, bytes[44..48], 987654321, .little);
    writeEmptyRecord(bytes[48..60], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.set_rendering_origin_records);

    var malformed = bytes;
    std.mem.writeInt(u32, malformed[32..36], 16, .little);
    std.mem.writeInt(u32, malformed[36..40], 4, .little);
    var malformed_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusSetRenderingOriginSize, malformed_state.consume(testComment(malformed[0..44]), 2));
    try std.testing.expectEqualDeep(State{}, malformed_state);

    var overflow: State = .{};
    overflow.report.set_rendering_origin_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..48]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream validates and counts SetAntiAliasMode records atomically" {
    var bytes = [_]u8{0} ** 52;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x401e);
    std.mem.writeInt(u16, bytes[30..32], 0xff0b, .little);
    writeEmptyRecord(bytes[40..52], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.set_anti_alias_mode_records);

    var invalid_mode = bytes;
    std.mem.writeInt(u16, invalid_mode[30..32], 0xff0c, .little);
    var invalid_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusSmoothingMode, invalid_state.consume(testComment(&invalid_mode), 2));
    try std.testing.expectEqualDeep(State{}, invalid_state);

    var overflow: State = .{};
    overflow.report.set_anti_alias_mode_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..40]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream validates and counts SetTextRenderingHint records atomically" {
    var bytes = [_]u8{0} ** 52;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x401f);
    std.mem.writeInt(u16, bytes[30..32], 0xff05, .little);
    writeEmptyRecord(bytes[40..52], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.set_text_rendering_hint_records);

    var invalid_hint = bytes;
    std.mem.writeInt(u16, invalid_hint[30..32], 0xff06, .little);
    var invalid_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusTextRenderingHint, invalid_state.consume(testComment(&invalid_hint), 2));
    try std.testing.expectEqualDeep(State{}, invalid_state);

    var overflow: State = .{};
    overflow.report.set_text_rendering_hint_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..40]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream validates and counts SetTextContrast records atomically" {
    var bytes = [_]u8{0} ** 52;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4020);
    std.mem.writeInt(u16, bytes[30..32], 0xf3e8, .little);
    writeEmptyRecord(bytes[40..52], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.set_text_contrast_records);

    var invalid_contrast = bytes;
    std.mem.writeInt(u16, invalid_contrast[30..32], 999, .little);
    var invalid_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusTextContrast, invalid_state.consume(testComment(&invalid_contrast), 2));
    try std.testing.expectEqualDeep(State{}, invalid_state);

    var overflow: State = .{};
    overflow.report.set_text_contrast_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..40]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream validates and counts SetInterpolationMode records atomically" {
    var bytes = [_]u8{0} ** 52;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4021);
    std.mem.writeInt(u16, bytes[30..32], 0xff07, .little);
    writeEmptyRecord(bytes[40..52], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.set_interpolation_mode_records);

    var invalid_mode = bytes;
    std.mem.writeInt(u16, invalid_mode[30..32], 0xff08, .little);
    var invalid_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusInterpolationMode, invalid_state.consume(testComment(&invalid_mode), 2));
    try std.testing.expectEqualDeep(State{}, invalid_state);

    var overflow: State = .{};
    overflow.report.set_interpolation_mode_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..40]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream validates and counts SetPixelOffsetMode records atomically" {
    var bytes = [_]u8{0} ** 52;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4022);
    std.mem.writeInt(u16, bytes[30..32], 0xff03, .little);
    writeEmptyRecord(bytes[40..52], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.set_pixel_offset_mode_records);

    var invalid_mode = bytes;
    std.mem.writeInt(u16, invalid_mode[30..32], 0xff05, .little);
    var invalid_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusPixelOffsetMode, invalid_state.consume(testComment(&invalid_mode), 2));
    try std.testing.expectEqualDeep(State{}, invalid_state);

    var overflow: State = .{};
    overflow.report.set_pixel_offset_mode_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..40]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream validates and counts SetCompositingMode records atomically" {
    var bytes = [_]u8{0} ** 52;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4023);
    std.mem.writeInt(u16, bytes[30..32], 0xff01, .little);
    writeEmptyRecord(bytes[40..52], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.set_compositing_mode_records);

    var invalid_mode = bytes;
    std.mem.writeInt(u16, invalid_mode[30..32], 0xff02, .little);
    var invalid_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusCompositingMode, invalid_state.consume(testComment(&invalid_mode), 2));
    try std.testing.expectEqualDeep(State{}, invalid_state);

    var overflow: State = .{};
    overflow.report.set_compositing_mode_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..40]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream validates and counts SetCompositingQuality records atomically" {
    var bytes = [_]u8{0} ** 52;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4024);
    std.mem.writeInt(u16, bytes[30..32], 0xff02, .little);
    writeEmptyRecord(bytes[40..52], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.set_compositing_quality_records);
    try std.testing.expectEqual(@as(usize, 0), state.report.set_compositing_quality_windows_fallback_records);

    var windows_fallback = bytes;
    std.mem.writeInt(u16, windows_fallback[30..32], 0xff00, .little);
    var fallback_state: State = .{};
    try std.testing.expect(try fallback_state.consume(testComment(&windows_fallback), 2));
    try fallback_state.finish();
    try std.testing.expectEqual(@as(usize, 1), fallback_state.report.set_compositing_quality_records);
    try std.testing.expectEqual(@as(usize, 1), fallback_state.report.set_compositing_quality_windows_fallback_records);

    var malformed = [_]u8{0} ** 44;
    writeHeader(malformed[0..28]);
    writeEmptyRecord(malformed[28..40], 0x4024);
    std.mem.writeInt(u32, malformed[32..36], 16, .little);
    std.mem.writeInt(u32, malformed[36..40], 4, .little);
    var invalid_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusSetCompositingQualitySize, invalid_state.consume(testComment(&malformed), 2));
    try std.testing.expectEqualDeep(State{}, invalid_state);

    var overflow: State = .{};
    overflow.report.set_compositing_quality_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..40]), 2));
    try std.testing.expectEqualDeep(before, overflow);

    var fallback_overflow: State = .{};
    fallback_overflow.report.set_compositing_quality_windows_fallback_records = std.math.maxInt(usize);
    const fallback_before = fallback_overflow;
    try std.testing.expectError(error.LimitExceeded, fallback_overflow.consume(testComment(&windows_fallback), 2));
    try std.testing.expectEqualDeep(fallback_before, fallback_overflow);
}

test "EMF+ stream validates and counts Save records atomically" {
    var bytes = [_]u8{0} ** 56;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x4025, .little);
    std.mem.writeInt(u16, bytes[30..32], 0xffff, .little);
    std.mem.writeInt(u32, bytes[32..36], 16, .little);
    std.mem.writeInt(u32, bytes[36..40], 4, .little);
    std.mem.writeInt(u32, bytes[40..44], 0x01020304, .little);
    writeEmptyRecord(bytes[44..56], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.save_records);

    var malformed = bytes;
    std.mem.writeInt(u32, malformed[36..40], 0, .little);
    std.mem.writeInt(u32, malformed[32..36], 12, .little);
    var invalid_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusSaveSize, invalid_state.consume(testComment(malformed[0..40]), 2));
    try std.testing.expectEqualDeep(State{}, invalid_state);

    var overflow: State = .{};
    overflow.report.save_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..44]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ Save/Restore tracked stream restores a target and all newer saves" {
    var bytes = [_]u8{0} ** 88;
    writeHeader(bytes[0..28]);
    writeStackIndexRecord(bytes[28..44], 0x4025, 0xffff, 10);
    writeStackIndexRecord(bytes[44..60], 0x4025, 0xabcd, 20);
    writeStackIndexRecord(bytes[60..76], 0x4026, 0x9876, 10);
    writeEmptyRecord(bytes[76..88], 0x4002);

    var state: State = .{};
    var stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer stack.deinit();
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&bytes), 2));
    try state.finishTracked(stack);
    try std.testing.expectEqual(@as(usize, 2), state.report.save_records);
    try std.testing.expectEqual(@as(usize, 1), state.report.restore_records);
    try std.testing.expectEqual(@as(usize, 2), state.report.graphics_state_max_depth);
    try std.testing.expectEqual(@as(usize, 0), stack.entries.items.len);

    var overflow_state: State = .{};
    overflow_state.report.restore_records = std.math.maxInt(usize);
    const overflow_before = overflow_state;
    var overflow_stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer overflow_stack.deinit();
    try std.testing.expectError(error.LimitExceeded, overflow_state.consumeTracked(&overflow_stack, testComment(bytes[0..76]), 2));
    try std.testing.expectEqualDeep(overflow_before, overflow_state);
    try std.testing.expectEqual(@as(usize, 0), overflow_stack.entries.items.len);
}

test "EMF+ BeginContainer is parsed counted and removed by an older Restore" {
    var closed = [_]u8{0} ** 120;
    writeHeader(closed[0..28]);
    writeStackIndexRecord(closed[28..44], 0x4025, 0, 10);
    writeBeginContainer(closed[44..92], 2, 20);
    writeStackIndexRecord(closed[92..108], 0x4026, 0, 10);
    writeEmptyRecord(closed[108..120], 0x4002);
    var state: State = .{};
    var stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer stack.deinit();
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&closed), 2));
    try state.finishTracked(stack);
    try std.testing.expectEqual(@as(usize, 1), state.report.begin_container_records);
    try std.testing.expectEqual(@as(usize, 0), state.report.begin_container_discouraged_page_unit_records);
    try std.testing.expectEqual(@as(usize, 2), state.report.graphics_state_max_depth);

    var discouraged = closed;
    std.mem.writeInt(u16, discouraged[46..48], 0, .little);
    var discouraged_state: State = .{};
    var discouraged_stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer discouraged_stack.deinit();
    try std.testing.expect(try discouraged_state.consumeTracked(&discouraged_stack, testComment(&discouraged), 2));
    try discouraged_state.finishTracked(discouraged_stack);
    try std.testing.expectEqual(@as(usize, 1), discouraged_state.report.begin_container_discouraged_page_unit_records);

    var unclosed = [_]u8{0} ** 88;
    writeHeader(unclosed[0..28]);
    writeBeginContainer(unclosed[28..76], 2, 20);
    writeEmptyRecord(unclosed[76..88], 0x4002);
    var unclosed_state: State = .{};
    var unclosed_stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer unclosed_stack.deinit();
    try std.testing.expect(try unclosed_state.consumeTracked(&unclosed_stack, testComment(&unclosed), 2));
    try std.testing.expectEqual(@as(usize, 1), unclosed_stack.entries.items.len);
    try std.testing.expectEqual(graphics_state_stack.EntryKind.container, unclosed_stack.entries.items[0].kind);
    try std.testing.expectEqual(@as(u32, 20), unclosed_stack.entries.items[0].stack_index);
    try std.testing.expectError(error.UnclosedEmfPlusGraphicsStateStack, unclosed_state.finishTracked(unclosed_stack));

    var malformed = closed;
    std.mem.writeInt(u16, malformed[46..48], 0x0102, .little);
    var malformed_state: State = .{};
    var malformed_stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer malformed_stack.deinit();
    try std.testing.expectError(error.InvalidEmfPlusBeginContainerReservedFlags, malformed_state.consumeTracked(&malformed_stack, testComment(&malformed), 2));
    try std.testing.expectEqualDeep(State{}, malformed_state);
    try std.testing.expectEqual(@as(usize, 0), malformed_stack.entries.items.len);

    var count_overflow: State = .{};
    count_overflow.report.begin_container_records = std.math.maxInt(usize);
    const count_before = count_overflow;
    var count_stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer count_stack.deinit();
    try std.testing.expectError(error.LimitExceeded, count_overflow.consumeTracked(&count_stack, testComment(&closed), 2));
    try std.testing.expectEqualDeep(count_before, count_overflow);
    try std.testing.expectEqual(@as(usize, 0), count_stack.entries.items.len);

    var warning_overflow: State = .{};
    warning_overflow.report.begin_container_discouraged_page_unit_records = std.math.maxInt(usize);
    const warning_before = warning_overflow;
    var warning_stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer warning_stack.deinit();
    try std.testing.expectError(error.LimitExceeded, warning_overflow.consumeTracked(&warning_stack, testComment(&discouraged), 2));
    try std.testing.expectEqualDeep(warning_before, warning_overflow);
    try std.testing.expectEqual(@as(usize, 0), warning_stack.entries.items.len);
}

test "EMF+ BeginContainerNoParams is parsed counted and shares the Container stack" {
    var bytes = [_]u8{0} ** 72;
    writeHeader(bytes[0..28]);
    writeStackIndexRecord(bytes[28..44], 0x4025, 0, 10);
    writeStackIndexRecord(bytes[44..60], 0x4028, 0xffff, 0x01020304);
    writeEmptyRecord(bytes[60..72], 0x4002);

    var unclosed_state: State = .{};
    var unclosed_stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer unclosed_stack.deinit();
    try std.testing.expect(try unclosed_state.consumeTracked(&unclosed_stack, testComment(&bytes), 2));
    try std.testing.expectEqual(@as(usize, 1), unclosed_state.report.begin_container_no_params_records);
    try std.testing.expectEqual(@as(usize, 2), unclosed_state.report.graphics_state_max_depth);
    try std.testing.expectEqual(@as(usize, 2), unclosed_stack.entries.items.len);
    try std.testing.expectEqual(graphics_state_stack.EntryKind.container, unclosed_stack.entries.items[1].kind);
    try std.testing.expectEqual(@as(u32, 0x01020304), unclosed_stack.entries.items[1].stack_index);
    try std.testing.expectError(error.UnclosedEmfPlusGraphicsStateStack, unclosed_state.finishTracked(unclosed_stack));

    var closed = [_]u8{0} ** 88;
    @memcpy(closed[0..60], bytes[0..60]);
    writeStackIndexRecord(closed[60..76], 0x4026, 0, 10);
    writeEmptyRecord(closed[76..88], 0x4002);
    var state: State = .{};
    var stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer stack.deinit();
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&closed), 2));
    try state.finishTracked(stack);
    try std.testing.expectEqual(@as(usize, 1), state.report.begin_container_no_params_records);
    try std.testing.expectEqual(@as(usize, 0), stack.entries.items.len);

    var malformed = closed;
    std.mem.writeInt(u32, malformed[52..56], 0, .little);
    std.mem.writeInt(u32, malformed[48..52], 12, .little);
    var malformed_state: State = .{};
    var malformed_stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer malformed_stack.deinit();
    try std.testing.expectError(error.InvalidEmfPlusBeginContainerNoParamsSize, malformed_state.consumeTracked(&malformed_stack, testComment(malformed[0..56]), 2));
    try std.testing.expectEqualDeep(State{}, malformed_state);
    try std.testing.expectEqual(@as(usize, 0), malformed_stack.entries.items.len);

    var overflow: State = .{};
    overflow.report.begin_container_no_params_records = std.math.maxInt(usize);
    const before = overflow;
    var overflow_stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer overflow_stack.deinit();
    try std.testing.expectError(error.LimitExceeded, overflow.consumeTracked(&overflow_stack, testComment(&closed), 2));
    try std.testing.expectEqualDeep(before, overflow);
    try std.testing.expectEqual(@as(usize, 0), overflow_stack.entries.items.len);
}

test "EMF+ Save/Restore tracked stream rolls back stack and report on missing and late failures" {
    var header = [_]u8{0} ** 28;
    writeHeader(&header);
    var state: State = .{};
    var stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer stack.deinit();
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&header), 2));

    var missing = [_]u8{0} ** 16;
    writeStackIndexRecord(&missing, 0x4026, 0xffff, 7);
    const before_missing = state;
    try std.testing.expectError(error.MissingEmfPlusSavedGraphicsState, state.consumeTracked(&stack, testComment(&missing), 3));
    try std.testing.expectEqualDeep(before_missing, state);
    try std.testing.expectEqual(@as(usize, 0), stack.entries.items.len);

    var malformed_restore = [_]u8{0} ** 12;
    writeEmptyRecord(&malformed_restore, 0x4026);
    const before_malformed = state;
    try std.testing.expectError(error.InvalidEmfPlusRestoreSize, state.consumeTracked(&stack, testComment(&malformed_restore), 3));
    try std.testing.expectEqualDeep(before_malformed, state);
    try std.testing.expectEqual(@as(usize, 0), stack.entries.items.len);

    var late = [_]u8{0} ** 17;
    writeStackIndexRecord(late[0..16], 0x4025, 0, 7);
    late[16] = 0xff;
    const before_late = state;
    try std.testing.expectError(error.TruncatedEmfPlusRecordHeader, state.consumeTracked(&stack, testComment(&late), 3));
    try std.testing.expectEqualDeep(before_late, state);
    try std.testing.expectEqual(@as(usize, 0), stack.entries.items.len);

    var save = [_]u8{0} ** 28;
    writeStackIndexRecord(save[0..16], 0x4025, 0, 9);
    writeEmptyRecord(save[16..28], 0x4002);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&save), 3));
    try std.testing.expectError(error.UnclosedEmfPlusGraphicsStateStack, state.finishTracked(stack));
}

test "EMF+ EndContainer closes its target and every newer mixed state" {
    var bytes = [_]u8{0} ** 104;
    writeHeader(bytes[0..28]);
    writeStackIndexRecord(bytes[28..44], 0x4028, 0, 1);
    writeStackIndexRecord(bytes[44..60], 0x4025, 0, 2);
    writeStackIndexRecord(bytes[60..76], 0x4028, 0xffff, 3);
    writeStackIndexRecord(bytes[76..92], 0x4029, 0xabcd, 1);
    writeEmptyRecord(bytes[92..104], 0x4002);
    var state: State = .{};
    var stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer stack.deinit();
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&bytes), 2));
    try state.finishTracked(stack);
    try std.testing.expectEqual(@as(usize, 2), state.report.begin_container_no_params_records);
    try std.testing.expectEqual(@as(usize, 1), state.report.end_container_records);
    try std.testing.expectEqual(@as(usize, 3), state.report.graphics_state_max_depth);
    try std.testing.expectEqual(@as(usize, 0), stack.entries.items.len);

    var nested = [_]u8{0} ** 136;
    writeHeader(nested[0..28]);
    writeBeginContainer(nested[28..76], 2, 4);
    writeStackIndexRecord(nested[76..92], 0x4028, 0, 5);
    writeStackIndexRecord(nested[92..108], 0x4029, 0, 5);
    writeStackIndexRecord(nested[108..124], 0x4029, 0, 4);
    writeEmptyRecord(nested[124..136], 0x4002);
    var nested_state: State = .{};
    var nested_stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer nested_stack.deinit();
    try std.testing.expect(try nested_state.consumeTracked(&nested_stack, testComment(&nested), 2));
    try nested_state.finishTracked(nested_stack);
    try std.testing.expectEqual(@as(usize, 1), nested_state.report.begin_container_records);
    try std.testing.expectEqual(@as(usize, 1), nested_state.report.begin_container_no_params_records);
    try std.testing.expectEqual(@as(usize, 2), nested_state.report.end_container_records);
    try std.testing.expectEqual(@as(usize, 2), nested_state.report.graphics_state_max_depth);

    var open = [_]u8{0} ** 44;
    writeHeader(open[0..28]);
    writeStackIndexRecord(open[28..44], 0x4028, 0, 9);
    var rollback_state: State = .{};
    var rollback_stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer rollback_stack.deinit();
    try std.testing.expect(try rollback_state.consumeTracked(&rollback_stack, testComment(&open), 2));
    var late = [_]u8{0} ** 17;
    writeStackIndexRecord(late[0..16], 0x4029, 0, 9);
    late[16] = 0xff;
    const rollback_before = rollback_state;
    try std.testing.expectError(error.TruncatedEmfPlusRecordHeader, rollback_state.consumeTracked(&rollback_stack, testComment(&late), 3));
    try std.testing.expectEqualDeep(rollback_before, rollback_state);
    try std.testing.expectEqual(@as(usize, 1), rollback_stack.entries.items.len);
    try std.testing.expectEqual(graphics_state_stack.EntryKind.container, rollback_stack.entries.items[0].kind);
    try std.testing.expectEqual(@as(u32, 9), rollback_stack.entries.items[0].stack_index);

    var missing = [_]u8{0} ** 44;
    writeHeader(missing[0..28]);
    writeStackIndexRecord(missing[28..44], 0x4029, 0, 1);
    var missing_state: State = .{};
    var missing_stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer missing_stack.deinit();
    try std.testing.expectError(error.MissingEmfPlusGraphicsContainer, missing_state.consumeTracked(&missing_stack, testComment(&missing), 2));
    try std.testing.expectEqualDeep(State{}, missing_state);
    try std.testing.expectEqual(@as(usize, 0), missing_stack.entries.items.len);

    var wrong_kind = [_]u8{0} ** 60;
    writeHeader(wrong_kind[0..28]);
    writeStackIndexRecord(wrong_kind[28..44], 0x4025, 0, 1);
    writeStackIndexRecord(wrong_kind[44..60], 0x4029, 0, 1);
    var wrong_kind_state: State = .{};
    var wrong_kind_stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer wrong_kind_stack.deinit();
    try std.testing.expectError(error.MissingEmfPlusGraphicsContainer, wrong_kind_state.consumeTracked(&wrong_kind_stack, testComment(&wrong_kind), 2));
    try std.testing.expectEqualDeep(State{}, wrong_kind_state);
    try std.testing.expectEqual(@as(usize, 0), wrong_kind_stack.entries.items.len);

    var malformed = bytes;
    std.mem.writeInt(u32, malformed[84..88], 0, .little);
    std.mem.writeInt(u32, malformed[80..84], 12, .little);
    var malformed_state: State = .{};
    var malformed_stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer malformed_stack.deinit();
    try std.testing.expectError(error.InvalidEmfPlusEndContainerSize, malformed_state.consumeTracked(&malformed_stack, testComment(malformed[0..88]), 2));
    try std.testing.expectEqualDeep(State{}, malformed_state);
    try std.testing.expectEqual(@as(usize, 0), malformed_stack.entries.items.len);

    var overflow: State = .{};
    overflow.report.end_container_records = std.math.maxInt(usize);
    const before = overflow;
    var overflow_stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer overflow_stack.deinit();
    try std.testing.expectError(error.LimitExceeded, overflow.consumeTracked(&overflow_stack, testComment(&bytes), 2));
    try std.testing.expectEqualDeep(before, overflow);
    try std.testing.expectEqual(@as(usize, 0), overflow_stack.entries.items.len);
}

fn trackedAllocationExercise(allocator: std.mem.Allocator) !void {
    var first = [_]u8{0} ** 60;
    writeHeader(first[0..28]);
    writeStackIndexRecord(first[28..44], 0x4025, 0, 1);
    writeStackIndexRecord(first[44..60], 0x4028, 0, 2);
    var last = [_]u8{0} ** 44;
    writeStackIndexRecord(last[0..16], 0x4029, 0, 2);
    writeStackIndexRecord(last[16..32], 0x4026, 0, 1);
    writeEmptyRecord(last[32..44], 0x4002);

    var state: State = .{};
    var stack = graphics_state_stack.Stack.init(allocator);
    defer stack.deinit();
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&first), 2));
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&last), 3));
    try state.finishTracked(stack);
}

test "EMF+ Save Container End and Restore tracked stream survives every graphics stack allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, trackedAllocationExercise, .{});
}

test "EMF+ stream resolves DrawBeziers Pen references and remains atomic" {
    var bytes = [_]u8{0} ** 100;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4008);
    std.mem.writeInt(u16, bytes[30..32], 0x0205, .little);
    std.mem.writeInt(u16, bytes[40..42], 0x4019, .little);
    std.mem.writeInt(u16, bytes[42..44], 0x0005, .little);
    std.mem.writeInt(u32, bytes[44..48], 48, .little);
    std.mem.writeInt(u32, bytes[48..52], 36, .little);
    std.mem.writeInt(u32, bytes[52..56], 4, .little);
    for (0..8) |index|
        std.mem.writeInt(u32, bytes[56 + index * 4 ..][0..4], @bitCast(@as(f32, @floatFromInt(index))), .little);
    writeEmptyRecord(bytes[88..100], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.draw_beziers_records);
    try std.testing.expectEqual(object_record.ObjectType.pen, state.object_state.table[5].?);

    var missing = bytes;
    std.mem.writeInt(u16, missing[42..44], 0x0006, .little);
    var missing_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusDrawBeziersPen, missing_state.consume(testComment(&missing), 2));
    try std.testing.expectEqualDeep(State{}, missing_state);

    var wrong_type = bytes;
    std.mem.writeInt(u16, wrong_type[30..32], 0x0505, .little);
    var wrong_type_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusDrawBeziersPenType, wrong_type_state.consume(testComment(&wrong_type), 2));
    try std.testing.expectEqualDeep(State{}, wrong_type_state);

    var overflow: State = .{};
    overflow.report.draw_beziers_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..88]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream resolves DrawClosedCurve Pen references and remains atomic" {
    var bytes = [_]u8{0} ** 84;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4008);
    std.mem.writeInt(u16, bytes[30..32], 0x0205, .little);
    std.mem.writeInt(u16, bytes[40..42], 0x4017, .little);
    std.mem.writeInt(u16, bytes[42..44], 0x4005, .little);
    std.mem.writeInt(u32, bytes[44..48], 32, .little);
    std.mem.writeInt(u32, bytes[48..52], 20, .little);
    std.mem.writeInt(u32, bytes[52..56], @bitCast(@as(f32, 0.5)), .little);
    std.mem.writeInt(u32, bytes[56..60], 3, .little);
    for (0..6) |index|
        std.mem.writeInt(i16, bytes[60 + index * 2 ..][0..2], @intCast(index), .little);
    writeEmptyRecord(bytes[72..84], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.draw_closed_curve_records);
    try std.testing.expectEqual(object_record.ObjectType.pen, state.object_state.table[5].?);

    var missing = bytes;
    std.mem.writeInt(u16, missing[42..44], 0x4006, .little);
    var missing_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusDrawClosedCurvePen, missing_state.consume(testComment(&missing), 2));
    try std.testing.expectEqualDeep(State{}, missing_state);

    var wrong_type = bytes;
    std.mem.writeInt(u16, wrong_type[30..32], 0x0505, .little);
    var wrong_type_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusDrawClosedCurvePenType, wrong_type_state.consume(testComment(&wrong_type), 2));
    try std.testing.expectEqualDeep(State{}, wrong_type_state);

    var overflow: State = .{};
    overflow.report.draw_closed_curve_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..72]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream resolves DrawCurve Pen references and remains atomic" {
    var bytes = [_]u8{0} ** 88;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4008);
    std.mem.writeInt(u16, bytes[30..32], 0x0205, .little);
    std.mem.writeInt(u16, bytes[40..42], 0x4018, .little);
    std.mem.writeInt(u16, bytes[42..44], 0x4005, .little);
    std.mem.writeInt(u32, bytes[44..48], 36, .little);
    std.mem.writeInt(u32, bytes[48..52], 24, .little);
    std.mem.writeInt(u32, bytes[52..56], @bitCast(@as(f32, 0.5)), .little);
    std.mem.writeInt(u32, bytes[56..60], 0, .little);
    std.mem.writeInt(u32, bytes[60..64], 1, .little);
    std.mem.writeInt(u32, bytes[64..68], 2, .little);
    for (0..4) |index|
        std.mem.writeInt(i16, bytes[68 + index * 2 ..][0..2], @intCast(index), .little);
    writeEmptyRecord(bytes[76..88], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.draw_curve_records);
    try std.testing.expectEqual(object_record.ObjectType.pen, state.object_state.table[5].?);

    var missing = bytes;
    std.mem.writeInt(u16, missing[42..44], 0x4006, .little);
    var missing_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusDrawCurvePen, missing_state.consume(testComment(&missing), 2));
    try std.testing.expectEqualDeep(State{}, missing_state);

    var wrong_type = bytes;
    std.mem.writeInt(u16, wrong_type[30..32], 0x0505, .little);
    var wrong_type_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusDrawCurvePenType, wrong_type_state.consume(testComment(&wrong_type), 2));
    try std.testing.expectEqualDeep(State{}, wrong_type_state);

    var overflow: State = .{};
    overflow.report.draw_curve_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..76]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream resolves DrawDriverString Font and conditional Brush references atomically" {
    var bytes = [_]u8{0} ** 92;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4008);
    std.mem.writeInt(u16, bytes[30..32], 0x0605, .little);
    writeEmptyRecord(bytes[40..52], 0x4008);
    std.mem.writeInt(u16, bytes[42..44], 0x0107, .little);
    std.mem.writeInt(u16, bytes[52..54], 0x4036, .little);
    std.mem.writeInt(u16, bytes[54..56], 0x0005, .little);
    std.mem.writeInt(u32, bytes[56..60], 28, .little);
    std.mem.writeInt(u32, bytes[60..64], 16, .little);
    std.mem.writeInt(u32, bytes[64..68], 7, .little);
    writeEmptyRecord(bytes[80..92], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.draw_driver_string_records);
    try std.testing.expectEqual(object_record.ObjectType.font, state.object_state.table[5].?);
    try std.testing.expectEqual(object_record.ObjectType.brush, state.object_state.table[7].?);

    var literal = bytes;
    std.mem.writeInt(u16, literal[54..56], 0x8005, .little);
    std.mem.writeInt(u32, literal[64..68], 0xffffffff, .little);
    std.mem.writeInt(u16, literal[42..44], 0x0607, .little);
    var literal_state: State = .{};
    try std.testing.expect(try literal_state.consume(testComment(&literal), 2));
    try literal_state.finish();
    try std.testing.expectEqual(@as(usize, 1), literal_state.report.draw_driver_string_records);

    var missing_font = bytes;
    std.mem.writeInt(u16, missing_font[54..56], 0x0006, .little);
    var missing_font_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusDrawDriverStringFont, missing_font_state.consume(testComment(&missing_font), 2));
    try std.testing.expectEqualDeep(State{}, missing_font_state);

    var wrong_font = bytes;
    std.mem.writeInt(u16, wrong_font[30..32], 0x0105, .little);
    var wrong_font_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusDrawDriverStringFontType, wrong_font_state.consume(testComment(&wrong_font), 2));
    try std.testing.expectEqualDeep(State{}, wrong_font_state);

    var missing_brush = bytes;
    std.mem.writeInt(u32, missing_brush[64..68], 8, .little);
    var missing_brush_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusDrawDriverStringBrush, missing_brush_state.consume(testComment(&missing_brush), 2));
    try std.testing.expectEqualDeep(State{}, missing_brush_state);

    var wrong_brush = bytes;
    std.mem.writeInt(u16, wrong_brush[42..44], 0x0607, .little);
    var wrong_brush_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusDrawDriverStringBrushType, wrong_brush_state.consume(testComment(&wrong_brush), 2));
    try std.testing.expectEqualDeep(State{}, wrong_brush_state);

    var overflow: State = .{};
    overflow.report.draw_driver_string_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..80]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream resolves DrawEllipse Pen references and remains atomic" {
    var bytes = [_]u8{0} ** 72;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4008);
    std.mem.writeInt(u16, bytes[30..32], 0x0205, .little);
    std.mem.writeInt(u16, bytes[40..42], 0x400f, .little);
    std.mem.writeInt(u16, bytes[42..44], 0x4005, .little);
    std.mem.writeInt(u32, bytes[44..48], 20, .little);
    std.mem.writeInt(u32, bytes[48..52], 8, .little);
    writeEmptyRecord(bytes[60..72], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.draw_ellipse_records);

    var missing = bytes;
    std.mem.writeInt(u16, missing[42..44], 0x4006, .little);
    var missing_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusDrawEllipsePen, missing_state.consume(testComment(&missing), 2));
    try std.testing.expectEqualDeep(State{}, missing_state);

    var wrong_type = bytes;
    std.mem.writeInt(u16, wrong_type[30..32], 0x0605, .little);
    var wrong_type_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusDrawEllipsePenType, wrong_type_state.consume(testComment(&wrong_type), 2));
    try std.testing.expectEqualDeep(State{}, wrong_type_state);

    var overflow: State = .{};
    overflow.report.draw_ellipse_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..60]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream resolves DrawImage and optional ImageAttributes references atomically" {
    var bytes = [_]u8{0} ** 108;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4008);
    std.mem.writeInt(u16, bytes[30..32], 0x0505, .little);
    writeEmptyRecord(bytes[40..52], 0x4008);
    std.mem.writeInt(u16, bytes[42..44], 0x0807, .little);
    std.mem.writeInt(u16, bytes[52..54], 0x401a, .little);
    std.mem.writeInt(u16, bytes[54..56], 0x4005, .little);
    std.mem.writeInt(u32, bytes[56..60], 44, .little);
    std.mem.writeInt(u32, bytes[60..64], 32, .little);
    std.mem.writeInt(u32, bytes[64..68], 7, .little);
    std.mem.writeInt(u32, bytes[68..72], 2, .little);
    writeEmptyRecord(bytes[96..108], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.draw_image_records);

    var absent_attributes = bytes;
    std.mem.writeInt(u32, absent_attributes[64..68], 0xffff_ffff, .little);
    std.mem.writeInt(u16, absent_attributes[42..44], 0x0607, .little);
    var absent_state: State = .{};
    try std.testing.expect(try absent_state.consume(testComment(&absent_attributes), 2));
    try absent_state.finish();
    try std.testing.expectEqual(@as(usize, 1), absent_state.report.draw_image_records);

    var missing_image = bytes;
    std.mem.writeInt(u16, missing_image[54..56], 0x4006, .little);
    var missing_image_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusDrawImageImage, missing_image_state.consume(testComment(&missing_image), 2));
    try std.testing.expectEqualDeep(State{}, missing_image_state);

    var wrong_image = bytes;
    std.mem.writeInt(u16, wrong_image[30..32], 0x0605, .little);
    var wrong_image_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusDrawImageImageType, wrong_image_state.consume(testComment(&wrong_image), 2));
    try std.testing.expectEqualDeep(State{}, wrong_image_state);

    var missing_attributes = bytes;
    std.mem.writeInt(u32, missing_attributes[64..68], 8, .little);
    var missing_attributes_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusDrawImageAttributes, missing_attributes_state.consume(testComment(&missing_attributes), 2));
    try std.testing.expectEqualDeep(State{}, missing_attributes_state);

    var wrong_attributes = bytes;
    std.mem.writeInt(u16, wrong_attributes[42..44], 0x0607, .little);
    var wrong_attributes_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusDrawImageAttributesType, wrong_attributes_state.consume(testComment(&wrong_attributes), 2));
    try std.testing.expectEqualDeep(State{}, wrong_attributes_state);

    var overflow: State = .{};
    overflow.report.draw_image_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..96]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream resolves DrawImagePoints image attributes and preceding effect atomically" {
    var bytes = [_]u8{0} ** 152;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4008);
    std.mem.writeInt(u16, bytes[30..32], 0x0505, .little);
    writeEmptyRecord(bytes[40..52], 0x4008);
    std.mem.writeInt(u16, bytes[42..44], 0x0807, .little);
    std.mem.writeInt(u16, bytes[52..54], 0x4038, .little);
    std.mem.writeInt(u32, bytes[56..60], 40, .little);
    std.mem.writeInt(u32, bytes[60..64], 28, .little);
    bytes[64..80].* = image_effect_guid.tint;
    std.mem.writeInt(u32, bytes[80..84], 8, .little);
    std.mem.writeInt(u16, bytes[92..94], 0x401b, .little);
    std.mem.writeInt(u16, bytes[94..96], 0x6805, .little);
    std.mem.writeInt(u32, bytes[96..100], 48, .little);
    std.mem.writeInt(u32, bytes[100..104], 36, .little);
    std.mem.writeInt(u32, bytes[104..108], 7, .little);
    std.mem.writeInt(u32, bytes[108..112], 2, .little);
    std.mem.writeInt(u32, bytes[128..132], 3, .little);
    bytes[132..140].* = .{ 1, 2, 3, 4, 5, 6, 0xaa, 0xbb };
    writeEmptyRecord(bytes[140..152], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.draw_image_points_records);

    var split_state: State = .{};
    try std.testing.expect(try split_state.consume(testComment(bytes[0..92]), 2));
    try std.testing.expect(try split_state.consume(testComment(bytes[92..152]), 3));
    try split_state.finish();
    try std.testing.expectEqual(@as(usize, 1), split_state.report.draw_image_points_records);

    var missing_effect = [_]u8{0} ** 112;
    @memcpy(missing_effect[0..52], bytes[0..52]);
    @memcpy(missing_effect[52..100], bytes[92..140]);
    @memcpy(missing_effect[100..112], bytes[140..152]);
    var missing_effect_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusDrawImagePointsEffect, missing_effect_state.consume(testComment(&missing_effect), 2));
    try std.testing.expectEqualDeep(State{}, missing_effect_state);

    var absent_attributes = bytes;
    std.mem.writeInt(u32, absent_attributes[104..108], 0xffff_ffff, .little);
    std.mem.writeInt(u16, absent_attributes[42..44], 0x0607, .little);
    var absent_state: State = .{};
    try std.testing.expect(try absent_state.consume(testComment(&absent_attributes), 2));
    try absent_state.finish();

    var missing_image = bytes;
    std.mem.writeInt(u16, missing_image[94..96], 0x6806, .little);
    var missing_image_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusDrawImagePointsImage, missing_image_state.consume(testComment(&missing_image), 2));
    try std.testing.expectEqualDeep(State{}, missing_image_state);

    var wrong_image = bytes;
    std.mem.writeInt(u16, wrong_image[30..32], 0x0605, .little);
    var wrong_image_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusDrawImagePointsImageType, wrong_image_state.consume(testComment(&wrong_image), 2));
    try std.testing.expectEqualDeep(State{}, wrong_image_state);

    var missing_attributes = bytes;
    std.mem.writeInt(u32, missing_attributes[104..108], 8, .little);
    var missing_attributes_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusDrawImagePointsAttributes, missing_attributes_state.consume(testComment(&missing_attributes), 2));
    try std.testing.expectEqualDeep(State{}, missing_attributes_state);

    var wrong_attributes = bytes;
    std.mem.writeInt(u16, wrong_attributes[42..44], 0x0607, .little);
    var wrong_attributes_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusDrawImagePointsAttributesType, wrong_attributes_state.consume(testComment(&wrong_attributes), 2));
    try std.testing.expectEqualDeep(State{}, wrong_attributes_state);

    var overflow: State = .{};
    overflow.report.serializable_objects = 1;
    overflow.report.draw_image_points_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..140]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream resolves DrawLines Pen references and remains atomic" {
    var bytes = [_]u8{0} ** 76;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4008);
    std.mem.writeInt(u16, bytes[30..32], 0x0205, .little);
    std.mem.writeInt(u16, bytes[40..42], 0x400d, .little);
    std.mem.writeInt(u16, bytes[42..44], 0x6005, .little);
    std.mem.writeInt(u32, bytes[44..48], 24, .little);
    std.mem.writeInt(u32, bytes[48..52], 12, .little);
    std.mem.writeInt(u32, bytes[52..56], 2, .little);
    writeEmptyRecord(bytes[64..76], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.draw_lines_records);

    var missing = bytes;
    std.mem.writeInt(u16, missing[42..44], 0x6006, .little);
    var missing_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusDrawLinesPen, missing_state.consume(testComment(&missing), 2));
    try std.testing.expectEqualDeep(State{}, missing_state);

    var wrong_type = bytes;
    std.mem.writeInt(u16, wrong_type[30..32], 0x0605, .little);
    var wrong_type_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusDrawLinesPenType, wrong_type_state.consume(testComment(&wrong_type), 2));
    try std.testing.expectEqualDeep(State{}, wrong_type_state);

    var overflow: State = .{};
    overflow.report.draw_lines_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..64]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream resolves DrawPath Path and Pen references atomically" {
    var bytes = [_]u8{0} ** 80;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4008);
    std.mem.writeInt(u16, bytes[30..32], 0x0305, .little);
    writeEmptyRecord(bytes[40..52], 0x4008);
    std.mem.writeInt(u16, bytes[42..44], 0x0206, .little);
    std.mem.writeInt(u16, bytes[52..54], 0x4015, .little);
    std.mem.writeInt(u16, bytes[54..56], 0x0005, .little);
    std.mem.writeInt(u32, bytes[56..60], 16, .little);
    std.mem.writeInt(u32, bytes[60..64], 4, .little);
    std.mem.writeInt(u32, bytes[64..68], 6, .little);
    writeEmptyRecord(bytes[68..80], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.draw_path_records);

    var missing_path = bytes;
    std.mem.writeInt(u16, missing_path[54..56], 0x0007, .little);
    var missing_path_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusDrawPathPath, missing_path_state.consume(testComment(&missing_path), 2));
    try std.testing.expectEqualDeep(State{}, missing_path_state);

    var wrong_path = bytes;
    std.mem.writeInt(u16, wrong_path[30..32], 0x0205, .little);
    var wrong_path_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusDrawPathPathType, wrong_path_state.consume(testComment(&wrong_path), 2));
    try std.testing.expectEqualDeep(State{}, wrong_path_state);

    var missing_pen = bytes;
    std.mem.writeInt(u32, missing_pen[64..68], 7, .little);
    var missing_pen_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusDrawPathPen, missing_pen_state.consume(testComment(&missing_pen), 2));
    try std.testing.expectEqualDeep(State{}, missing_pen_state);

    var wrong_pen = bytes;
    std.mem.writeInt(u16, wrong_pen[42..44], 0x0306, .little);
    var wrong_pen_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusDrawPathPenType, wrong_pen_state.consume(testComment(&wrong_pen), 2));
    try std.testing.expectEqualDeep(State{}, wrong_pen_state);

    var overflow: State = .{};
    overflow.report.draw_path_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..68]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream validates SetTSClip and rolls report back atomically" {
    var bytes = [_]u8{0} ** 56;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x403a, .little);
    std.mem.writeInt(u16, bytes[30..32], 0x8001, .little);
    std.mem.writeInt(u32, bytes[32..36], 16, .little);
    std.mem.writeInt(u32, bytes[36..40], 4, .little);
    bytes[40..44].* = .{ 0x81, 0x82, 0x83, 0x84 };
    writeEmptyRecord(bytes[44..56], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.set_ts_clip_records);

    var malformed = bytes;
    malformed[42] = 0;
    var malformed_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusSetTSClipCoordinate, malformed_state.consume(testComment(&malformed), 2));
    try std.testing.expectEqualDeep(State{}, malformed_state);

    var overflow: State = .{};
    overflow.report.set_ts_clip_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..44]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream validates SetTSGraphics and rolls report back atomically" {
    var bytes = [_]u8{0} ** 88;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x4039, .little);
    std.mem.writeInt(u32, bytes[32..36], 48, .little);
    std.mem.writeInt(u32, bytes[36..40], 36, .little);
    bytes[43] = 1;
    writeEmptyRecord(bytes[76..88], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.set_ts_graphics_records);

    var malformed = bytes;
    malformed[50] = 5;
    var malformed_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusFilterType, malformed_state.consume(testComment(&malformed), 2));
    try std.testing.expectEqualDeep(State{}, malformed_state);

    var overflow: State = .{};
    overflow.report.set_ts_graphics_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..76]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream validates MultiplyWorldTransform and rolls report back atomically" {
    var bytes = [_]u8{0} ** 76;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x402c, .little);
    std.mem.writeInt(u16, bytes[30..32], 0x2000, .little);
    std.mem.writeInt(u32, bytes[32..36], 36, .little);
    std.mem.writeInt(u32, bytes[36..40], 24, .little);
    writeEmptyRecord(bytes[64..76], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.multiply_world_transform_records);

    var malformed = [_]u8{0} ** 72;
    @memcpy(malformed[0..28], bytes[0..28]);
    std.mem.writeInt(u16, malformed[28..30], 0x402c, .little);
    std.mem.writeInt(u32, malformed[32..36], 32, .little);
    std.mem.writeInt(u32, malformed[36..40], 20, .little);
    writeEmptyRecord(malformed[60..72], 0x4002);
    var malformed_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusMultiplyWorldTransformSize, malformed_state.consume(testComment(&malformed), 2));
    try std.testing.expectEqualDeep(State{}, malformed_state);

    var overflow: State = .{};
    overflow.report.multiply_world_transform_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..64]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream validates SetWorldTransform and rolls report back atomically" {
    var bytes = [_]u8{0} ** 76;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x402a, .little);
    std.mem.writeInt(u16, bytes[30..32], 0xffff, .little);
    std.mem.writeInt(u32, bytes[32..36], 36, .little);
    std.mem.writeInt(u32, bytes[36..40], 24, .little);
    writeEmptyRecord(bytes[64..76], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.set_world_transform_records);

    var malformed = [_]u8{0} ** 72;
    @memcpy(malformed[0..28], bytes[0..28]);
    std.mem.writeInt(u16, malformed[28..30], 0x402a, .little);
    std.mem.writeInt(u32, malformed[32..36], 32, .little);
    std.mem.writeInt(u32, malformed[36..40], 20, .little);
    writeEmptyRecord(malformed[60..72], 0x4002);
    var malformed_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusSetWorldTransformSize, malformed_state.consume(testComment(&malformed), 2));
    try std.testing.expectEqualDeep(State{}, malformed_state);

    var overflow: State = .{};
    overflow.report.set_world_transform_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..64]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream validates ResetWorldTransform and rolls report back atomically" {
    var bytes = [_]u8{0} ** 52;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x402b);
    std.mem.writeInt(u16, bytes[30..32], 0xffff, .little);
    writeEmptyRecord(bytes[40..52], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.reset_world_transform_records);

    var malformed = [_]u8{0} ** 56;
    @memcpy(malformed[0..28], bytes[0..28]);
    std.mem.writeInt(u16, malformed[28..30], 0x402b, .little);
    std.mem.writeInt(u32, malformed[32..36], 16, .little);
    std.mem.writeInt(u32, malformed[36..40], 4, .little);
    writeEmptyRecord(malformed[44..56], 0x4002);
    var malformed_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusResetWorldTransformSize, malformed_state.consume(testComment(&malformed), 2));
    try std.testing.expectEqualDeep(State{}, malformed_state);

    var overflow: State = .{};
    overflow.report.reset_world_transform_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..40]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream validates TranslateWorldTransform and rolls report back atomically" {
    var bytes = [_]u8{0} ** 60;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x402d, .little);
    std.mem.writeInt(u16, bytes[30..32], 0x2000, .little);
    std.mem.writeInt(u32, bytes[32..36], 20, .little);
    std.mem.writeInt(u32, bytes[36..40], 8, .little);
    std.mem.writeInt(u32, bytes[40..44], 0x80000000, .little);
    std.mem.writeInt(u32, bytes[44..48], 0x7fc00001, .little);
    writeEmptyRecord(bytes[48..60], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.translate_world_transform_records);

    var malformed = [_]u8{0} ** 56;
    @memcpy(malformed[0..28], bytes[0..28]);
    std.mem.writeInt(u16, malformed[28..30], 0x402d, .little);
    std.mem.writeInt(u32, malformed[32..36], 16, .little);
    std.mem.writeInt(u32, malformed[36..40], 4, .little);
    writeEmptyRecord(malformed[44..56], 0x4002);
    var malformed_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusTranslateWorldTransformSize, malformed_state.consume(testComment(&malformed), 2));
    try std.testing.expectEqualDeep(State{}, malformed_state);

    var overflow: State = .{};
    overflow.report.translate_world_transform_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..48]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream validates ScaleWorldTransform and rolls report back atomically" {
    var bytes = [_]u8{0} ** 60;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x402e, .little);
    std.mem.writeInt(u16, bytes[30..32], 0x2000, .little);
    std.mem.writeInt(u32, bytes[32..36], 20, .little);
    std.mem.writeInt(u32, bytes[36..40], 8, .little);
    std.mem.writeInt(u32, bytes[40..44], 0x80000000, .little);
    std.mem.writeInt(u32, bytes[44..48], 0x7fc00001, .little);
    writeEmptyRecord(bytes[48..60], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.scale_world_transform_records);

    var malformed = [_]u8{0} ** 56;
    @memcpy(malformed[0..28], bytes[0..28]);
    std.mem.writeInt(u16, malformed[28..30], 0x402e, .little);
    std.mem.writeInt(u32, malformed[32..36], 16, .little);
    std.mem.writeInt(u32, malformed[36..40], 4, .little);
    writeEmptyRecord(malformed[44..56], 0x4002);
    var malformed_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusScaleWorldTransformSize, malformed_state.consume(testComment(&malformed), 2));
    try std.testing.expectEqualDeep(State{}, malformed_state);

    var overflow: State = .{};
    overflow.report.scale_world_transform_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..48]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream validates RotateWorldTransform and rolls report back atomically" {
    var bytes = [_]u8{0} ** 56;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x402f, .little);
    std.mem.writeInt(u16, bytes[30..32], 0x2000, .little);
    std.mem.writeInt(u32, bytes[32..36], 16, .little);
    std.mem.writeInt(u32, bytes[36..40], 4, .little);
    std.mem.writeInt(u32, bytes[40..44], 0x7fc00001, .little);
    writeEmptyRecord(bytes[44..56], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.rotate_world_transform_records);

    var malformed = [_]u8{0} ** 60;
    @memcpy(malformed[0..28], bytes[0..28]);
    std.mem.writeInt(u16, malformed[28..30], 0x402f, .little);
    std.mem.writeInt(u32, malformed[32..36], 20, .little);
    std.mem.writeInt(u32, malformed[36..40], 8, .little);
    writeEmptyRecord(malformed[48..60], 0x4002);
    var malformed_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusRotateWorldTransformSize, malformed_state.consume(testComment(&malformed), 2));
    try std.testing.expectEqualDeep(State{}, malformed_state);

    var overflow: State = .{};
    overflow.report.rotate_world_transform_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..44]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream validates SetPageTransform warnings and rolls report back atomically" {
    var bytes = [_]u8{0} ** 56;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x4030, .little);
    std.mem.writeInt(u16, bytes[30..32], 2, .little);
    std.mem.writeInt(u32, bytes[32..36], 16, .little);
    std.mem.writeInt(u32, bytes[36..40], 4, .little);
    std.mem.writeInt(u32, bytes[40..44], 0x7fc00001, .little);
    writeEmptyRecord(bytes[44..56], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.set_page_transform_records);
    try std.testing.expectEqual(@as(usize, 0), state.report.set_page_transform_discouraged_page_unit_records);

    var discouraged = bytes;
    std.mem.writeInt(u16, discouraged[30..32], 0, .little);
    var discouraged_state: State = .{};
    try std.testing.expect(try discouraged_state.consume(testComment(&discouraged), 2));
    try discouraged_state.finish();
    try std.testing.expectEqual(@as(usize, 1), discouraged_state.report.set_page_transform_discouraged_page_unit_records);

    var malformed = bytes;
    std.mem.writeInt(u16, malformed[30..32], 0x0102, .little);
    var malformed_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusSetPageTransformReservedFlags, malformed_state.consume(testComment(&malformed), 2));
    try std.testing.expectEqualDeep(State{}, malformed_state);

    var count_overflow: State = .{};
    count_overflow.report.set_page_transform_records = std.math.maxInt(usize);
    const count_before = count_overflow;
    try std.testing.expectError(error.LimitExceeded, count_overflow.consume(testComment(bytes[0..44]), 2));
    try std.testing.expectEqualDeep(count_before, count_overflow);

    var warning_overflow: State = .{};
    warning_overflow.report.set_page_transform_discouraged_page_unit_records = std.math.maxInt(usize);
    const warning_before = warning_overflow;
    try std.testing.expectError(error.LimitExceeded, warning_overflow.consume(testComment(discouraged[0..44]), 2));
    try std.testing.expectEqualDeep(warning_before, warning_overflow);
}
