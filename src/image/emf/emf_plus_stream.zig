const std = @import("std");
const comment_record = @import("comment_record.zig");
const record = @import("emf_plus_record.zig");
const record_support = @import("emf_plus_record_support.zig");
const header_record = @import("emf_plus_header.zig");
const private_comment = @import("emf_plus_comment.zig");
const object_record = @import("emf_plus_object.zig");
const serializable_object = @import("emf_plus_serializable_object.zig");
const image_effect_guid = @import("emf_plus_image_effect_guid.zig");
const clear_record = @import("emf_plus_clear.zig");
const fill_rects_record = @import("emf_plus_fill_rects.zig");
const fill_polygon_record = @import("emf_plus_fill_polygon.zig");
const fill_ellipse_record = @import("emf_plus_fill_ellipse.zig");
const fill_pie_record = @import("emf_plus_fill_pie.zig");
const fill_region_record = @import("emf_plus_fill_region.zig");
const fill_path_record = @import("emf_plus_fill_path.zig");
const fill_closed_curve_record = @import("emf_plus_fill_closed_curve.zig");
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
const reset_clip_record = @import("emf_plus_reset_clip.zig");
const set_clip_rect_record = @import("emf_plus_set_clip_rect.zig");
const set_clip_path_record = @import("emf_plus_set_clip_path.zig");
const set_clip_region_record = @import("emf_plus_set_clip_region.zig");
const offset_clip_record = @import("emf_plus_offset_clip.zig");
const stroke_fill_path_record = @import("emf_plus_stroke_fill_path.zig");
const save_record = @import("emf_plus_save.zig");
const restore_record = @import("emf_plus_restore.zig");
const graphics_state_stack = @import("emf_plus_graphics_state_stack.zig");
const transform_matrix = @import("emf_plus_transform_matrix.zig");
const container_transform = @import("emf_plus_container_transform.zig");
const page_transform = @import("emf_plus_page_transform.zig");
const clip_state = @import("emf_plus_clip_state.zig");
const property_state = @import("emf_plus_property_state.zig");
const ts_graphics_state = @import("emf_plus_ts_graphics_state.zig");

pub const Report = struct {
    comments: usize = 0,
    records: usize = 0,
    header: ?header_record.Header = null,
    end_of_file_records: usize = 0,
    get_dc_records: usize = 0,
    get_dc_emf_records: usize = 0,
    private_comments: usize = 0,
    private_data_bytes: usize = 0,
    objects: object_record.Report = .{},
    serializable_objects: usize = 0,
    image_effects: [image_effect_guid.effect_count]usize = .{0} ** image_effect_guid.effect_count,
    clear_records: usize = 0,
    fill_rects_records: usize = 0,
    fill_polygon_records: usize = 0,
    fill_ellipse_records: usize = 0,
    fill_pie_records: usize = 0,
    fill_region_records: usize = 0,
    fill_path_records: usize = 0,
    fill_closed_curve_records: usize = 0,
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
    begin_container_transform_records: usize = 0,
    begin_container_unknown_transform_records: usize = 0,
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
    reset_clip_records: usize = 0,
    set_clip_rect_records: usize = 0,
    set_clip_path_records: usize = 0,
    set_clip_region_records: usize = 0,
    offset_clip_records: usize = 0,
    opaque_stroke_fill_path_records: usize = 0,
    save_records: usize = 0,
    restore_records: usize = 0,
    graphics_state_max_depth: usize = 0,
    world_transform: ?transform_matrix.TransformMatrix = null,
    page_transform: ?page_transform.PageTransform = null,
    clip: ?clip_state.State = null,
    properties: ?property_state.State = null,
    terminal_server_clip_rectangles: ?u16 = null,
    terminal_server_graphics: ?ts_graphics_state.Summary = null,
};

pub const State = struct {
    report: Report = .{},
    ended: bool = false,
    process_emf_records: bool = false,
    object_state: object_record.State = .{},

    pub fn observeEmfRecord(self: *State) !bool {
        if (!self.process_emf_records) return false;
        self.report.get_dc_emf_records = std.math.add(usize, self.report.get_dc_emf_records, 1) catch return error.LimitExceeded;
        return true;
    }

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
            pending.process_emf_records = false;
            records_in_comment += 1;
            pending.report.records = std.math.add(usize, pending.report.records, 1) catch return error.LimitExceeded;
            if (pending.report.header == null) {
                if (emf_record_index != 2 or value.kind != .header) return error.MissingInitialEmfPlusHeader;
                const parsed_header = try header_record.parse(value);
                pending.report.header = parsed_header;
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
                    pending.report.get_dc_records = std.math.add(usize, pending.report.get_dc_records, 1) catch return error.LimitExceeded;
                    pending.process_emf_records = true;
                },
                else => {},
            }
            if (record_support.policy(value.kind) == .forbidden) return error.ReservedEmfPlusRecordType;
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
            if (value.kind == .fill_rects) {
                const parsed = try fill_rects_record.parse(value, .{});
                switch (parsed.brush) {
                    .color => {},
                    .brush_id => |id| {
                        const brush_type = pending.object_state.table[id] orelse return error.MissingEmfPlusFillRectsBrush;
                        if (brush_type != .brush) return error.InvalidEmfPlusFillRectsBrushType;
                    },
                }
                pending.report.fill_rects_records = std.math.add(usize, pending.report.fill_rects_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .fill_polygon) {
                const parsed = try fill_polygon_record.parse(value, .{});
                switch (parsed.brush) {
                    .color => {},
                    .brush_id => |id| {
                        const brush_type = pending.object_state.table[id] orelse return error.MissingEmfPlusFillPolygonBrush;
                        if (brush_type != .brush) return error.InvalidEmfPlusFillPolygonBrushType;
                    },
                }
                pending.report.fill_polygon_records = std.math.add(usize, pending.report.fill_polygon_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .fill_ellipse) {
                const parsed = try fill_ellipse_record.parse(value);
                switch (parsed.brush) {
                    .color => {},
                    .brush_id => |id| {
                        const brush_type = pending.object_state.table[id] orelse return error.MissingEmfPlusFillEllipseBrush;
                        if (brush_type != .brush) return error.InvalidEmfPlusFillEllipseBrushType;
                    },
                }
                pending.report.fill_ellipse_records = std.math.add(usize, pending.report.fill_ellipse_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .fill_pie) {
                const parsed = try fill_pie_record.parse(value);
                switch (parsed.brush) {
                    .color => {},
                    .brush_id => |id| {
                        const brush_type = pending.object_state.table[id] orelse return error.MissingEmfPlusFillPieBrush;
                        if (brush_type != .brush) return error.InvalidEmfPlusFillPieBrushType;
                    },
                }
                pending.report.fill_pie_records = std.math.add(usize, pending.report.fill_pie_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .fill_region) {
                const parsed = try fill_region_record.parse(value);
                const region_type = pending.object_state.table[parsed.region_id] orelse return error.MissingEmfPlusFillRegionRegion;
                if (region_type != .region) return error.InvalidEmfPlusFillRegionRegionType;
                switch (parsed.brush) {
                    .color => {},
                    .brush_id => |id| {
                        const brush_type = pending.object_state.table[id] orelse return error.MissingEmfPlusFillRegionBrush;
                        if (brush_type != .brush) return error.InvalidEmfPlusFillRegionBrushType;
                    },
                }
                pending.report.fill_region_records = std.math.add(usize, pending.report.fill_region_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .fill_path) {
                const parsed = try fill_path_record.parse(value);
                const path_type = pending.object_state.table[parsed.path_id] orelse return error.MissingEmfPlusFillPathPath;
                if (path_type != .path) return error.InvalidEmfPlusFillPathPathType;
                switch (parsed.brush) {
                    .color => {},
                    .brush_id => |id| {
                        const brush_type = pending.object_state.table[id] orelse return error.MissingEmfPlusFillPathBrush;
                        if (brush_type != .brush) return error.InvalidEmfPlusFillPathBrushType;
                    },
                }
                pending.report.fill_path_records = std.math.add(usize, pending.report.fill_path_records, 1) catch return error.LimitExceeded;
            }
            if (value.kind == .fill_closed_curve) {
                const parsed = try fill_closed_curve_record.parse(value, .{});
                switch (parsed.brush) {
                    .color => {},
                    .brush_id => |id| {
                        const brush_type = pending.object_state.table[id] orelse return error.MissingEmfPlusFillClosedCurveBrush;
                        if (brush_type != .brush) return error.InvalidEmfPlusFillClosedCurveBrushType;
                    },
                }
                pending.report.fill_closed_curve_records = std.math.add(usize, pending.report.fill_closed_curve_records, 1) catch return error.LimitExceeded;
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
                const parsed = try set_rendering_origin_record.parse(value);
                pending.report.set_rendering_origin_records = std.math.add(usize, pending.report.set_rendering_origin_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| tracked.current.properties.rendering_origin = .{ .x = parsed.x, .y = parsed.y };
            }
            if (value.kind == .set_anti_alias_mode) {
                const parsed = try set_anti_alias_mode_record.parse(value);
                pending.report.set_anti_alias_mode_records = std.math.add(usize, pending.report.set_anti_alias_mode_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| tracked.current.properties.anti_alias_mode = .{ .smoothing = parsed.smoothing, .anti_alias = parsed.anti_alias };
            }
            if (value.kind == .set_text_rendering_hint) {
                const parsed = try set_text_rendering_hint_record.parse(value);
                pending.report.set_text_rendering_hint_records = std.math.add(usize, pending.report.set_text_rendering_hint_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| tracked.current.properties.text_rendering_hint = parsed.hint;
            }
            if (value.kind == .set_text_contrast) {
                const parsed = try set_text_contrast_record.parse(value);
                pending.report.set_text_contrast_records = std.math.add(usize, pending.report.set_text_contrast_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| tracked.current.properties.text_contrast = parsed.text_contrast;
            }
            if (value.kind == .set_interpolation_mode) {
                const parsed = try set_interpolation_mode_record.parse(value);
                pending.report.set_interpolation_mode_records = std.math.add(usize, pending.report.set_interpolation_mode_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| tracked.current.properties.interpolation_mode = parsed.mode;
            }
            if (value.kind == .set_pixel_offset_mode) {
                const parsed = try set_pixel_offset_mode_record.parse(value);
                pending.report.set_pixel_offset_mode_records = std.math.add(usize, pending.report.set_pixel_offset_mode_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| tracked.current.properties.pixel_offset_mode = parsed.mode;
            }
            if (value.kind == .set_compositing_mode) {
                const parsed = try set_compositing_mode_record.parse(value);
                pending.report.set_compositing_mode_records = std.math.add(usize, pending.report.set_compositing_mode_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| tracked.current.properties.compositing_mode = parsed.mode;
            }
            if (value.kind == .set_compositing_quality) {
                const parsed = try set_compositing_quality_record.parse(value);
                pending.report.set_compositing_quality_records = std.math.add(usize, pending.report.set_compositing_quality_records, 1) catch return error.LimitExceeded;
                switch (parsed.quality) {
                    .defined => {},
                    .invalid_windows_default => pending.report.set_compositing_quality_windows_fallback_records = std.math.add(usize, pending.report.set_compositing_quality_windows_fallback_records, 1) catch return error.LimitExceeded,
                }
                if (stack) |tracked| tracked.current.properties.compositing_quality = parsed.quality;
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
                if (stack) |tracked| {
                    try tracked.push(.container, parsed.stack_index);
                    const emf_header = pending.report.header orelse unreachable;
                    if (container_transform.build(parsed.dest_rect, parsed.src_rect, parsed.page_unit, .{ .x = emf_header.logical_dpi_x, .y = emf_header.logical_dpi_y })) |matrix| {
                        if (tracked.current.world_transform) |current|
                            tracked.current.world_transform = current.multiplied(matrix, false);
                        pending.report.begin_container_transform_records = std.math.add(usize, pending.report.begin_container_transform_records, 1) catch return error.LimitExceeded;
                    } else {
                        tracked.current.world_transform = null;
                        pending.report.begin_container_unknown_transform_records = std.math.add(usize, pending.report.begin_container_unknown_transform_records, 1) catch return error.LimitExceeded;
                    }
                }
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
                const parsed = try set_ts_clip_record.parse(value);
                pending.report.set_ts_clip_records = std.math.add(usize, pending.report.set_ts_clip_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| {
                    try tracked.current.setTerminalServerClip(tracked.allocator, parsed.rects);
                    tracked.current.clip = if (parsed.num_rects == 0) .empty else .complex;
                }
            }
            if (value.kind == .set_ts_graphics) {
                const parsed = try set_ts_graphics_record.parse(value, .{});
                pending.report.set_ts_graphics_records = std.math.add(usize, pending.report.set_ts_graphics_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| try tracked.current.setTerminalServerGraphics(tracked.allocator, parsed);
            }
            if (value.kind == .multiply_world_transform) {
                const parsed = try multiply_world_transform_record.parse(value);
                pending.report.multiply_world_transform_records = std.math.add(usize, pending.report.multiply_world_transform_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| {
                    if (tracked.current.world_transform) |current|
                        tracked.current.world_transform = current.multiplied(parsed.matrix, parsed.post_multiply);
                }
            }
            if (value.kind == .set_world_transform) {
                const parsed = try set_world_transform_record.parse(value);
                pending.report.set_world_transform_records = std.math.add(usize, pending.report.set_world_transform_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| tracked.current.world_transform = parsed.matrix;
            }
            if (value.kind == .reset_world_transform) {
                _ = try reset_world_transform_record.parse(value);
                pending.report.reset_world_transform_records = std.math.add(usize, pending.report.reset_world_transform_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| tracked.current.world_transform = transform_matrix.TransformMatrix.identity;
            }
            if (value.kind == .translate_world_transform) {
                const parsed = try translate_world_transform_record.parse(value);
                pending.report.translate_world_transform_records = std.math.add(usize, pending.report.translate_world_transform_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| {
                    if (tracked.current.world_transform) |current|
                        tracked.current.world_transform = current.multiplied(transform_matrix.TransformMatrix.translation(parsed.dx, parsed.dy), parsed.post_multiply);
                }
            }
            if (value.kind == .scale_world_transform) {
                const parsed = try scale_world_transform_record.parse(value);
                pending.report.scale_world_transform_records = std.math.add(usize, pending.report.scale_world_transform_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| {
                    if (tracked.current.world_transform) |current|
                        tracked.current.world_transform = current.multiplied(transform_matrix.TransformMatrix.scaling(parsed.sx, parsed.sy), parsed.post_multiply);
                }
            }
            if (value.kind == .rotate_world_transform) {
                const parsed = try rotate_world_transform_record.parse(value);
                pending.report.rotate_world_transform_records = std.math.add(usize, pending.report.rotate_world_transform_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| {
                    if (tracked.current.world_transform) |current|
                        tracked.current.world_transform = current.multiplied(transform_matrix.TransformMatrix.rotation(parsed.angle), parsed.post_multiply);
                }
            }
            if (value.kind == .set_page_transform) {
                const parsed = try set_page_transform_record.parse(value);
                pending.report.set_page_transform_records = std.math.add(usize, pending.report.set_page_transform_records, 1) catch return error.LimitExceeded;
                if (parsed.discouraged_page_unit)
                    pending.report.set_page_transform_discouraged_page_unit_records = std.math.add(usize, pending.report.set_page_transform_discouraged_page_unit_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| {
                    const emf_header = pending.report.header orelse unreachable;
                    tracked.current.page_transform = page_transform.build(parsed.page_unit, parsed.page_scale, .{ .x = emf_header.logical_dpi_x, .y = emf_header.logical_dpi_y });
                }
            }
            if (value.kind == .reset_clip) {
                _ = try reset_clip_record.parse(value);
                pending.report.reset_clip_records = std.math.add(usize, pending.report.reset_clip_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| tracked.current.resetClip(tracked.allocator);
            }
            if (value.kind == .set_clip_rect) {
                const parsed = try set_clip_rect_record.parse(value);
                pending.report.set_clip_rect_records = std.math.add(usize, pending.report.set_clip_rect_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| tracked.current.combineClipRectangle(tracked.allocator, parsed.mode, parsed.rectangle);
            }
            if (value.kind == .set_clip_path) {
                const parsed = try set_clip_path_record.parse(value);
                const object_type = pending.object_state.table[parsed.path_id] orelse return error.MissingEmfPlusSetClipPathPath;
                if (object_type != .path) return error.InvalidEmfPlusSetClipPathPathType;
                pending.report.set_clip_path_records = std.math.add(usize, pending.report.set_clip_path_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| tracked.current.combineClipOpaque(tracked.allocator, parsed.mode);
            }
            if (value.kind == .set_clip_region) {
                const parsed = try set_clip_region_record.parse(value);
                const object_type = pending.object_state.table[parsed.region_id] orelse return error.MissingEmfPlusSetClipRegionRegion;
                if (object_type != .region) return error.InvalidEmfPlusSetClipRegionRegionType;
                pending.report.set_clip_region_records = std.math.add(usize, pending.report.set_clip_region_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| tracked.current.combineClipOpaque(tracked.allocator, parsed.mode);
            }
            if (value.kind == .offset_clip) {
                const parsed = try offset_clip_record.parse(value);
                pending.report.offset_clip_records = std.math.add(usize, pending.report.offset_clip_records, 1) catch return error.LimitExceeded;
                if (stack) |tracked| tracked.current.offsetClip(tracked.allocator, parsed.dx, parsed.dy);
            }
            if (value.kind == .stroke_fill_path) {
                _ = try stroke_fill_path_record.observe(value);
                pending.report.opaque_stroke_fill_path_records = std.math.add(usize, pending.report.opaque_stroke_fill_path_records, 1) catch return error.LimitExceeded;
            }
            if (private_comment.parse(value)) |parsed| {
                pending.report.private_comments = std.math.add(usize, pending.report.private_comments, 1) catch return error.LimitExceeded;
                pending.report.private_data_bytes = std.math.add(usize, pending.report.private_data_bytes, parsed.private_data.len) catch return error.LimitExceeded;
            }
        }
        if (records_in_comment == 0) return error.EmptyEmfPlusComment;
        pending.report.comments = std.math.add(usize, pending.report.comments, 1) catch return error.LimitExceeded;
        if (stack) |tracked| {
            pending.report.graphics_state_max_depth = tracked.max_depth;
            pending.report.world_transform = tracked.current.world_transform;
            pending.report.page_transform = tracked.current.page_transform;
            pending.report.clip = tracked.current.clip;
            pending.report.properties = tracked.current.properties;
            pending.report.terminal_server_clip_rectangles = if (tracked.current.terminal_server_clip) |state| @intCast(state.rectangles.len) else null;
            pending.report.terminal_server_graphics = if (tracked.current.terminal_server_graphics) |state| state.summary else null;
        }
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

fn writeSetPageTransform(bytes: []u8, flags: u16, page_scale_value: f32) void {
    std.debug.assert(bytes.len == 16);
    @memset(bytes, 0);
    std.mem.writeInt(u16, bytes[0..2], 0x4030, .little);
    std.mem.writeInt(u16, bytes[2..4], flags, .little);
    std.mem.writeInt(u32, bytes[4..8], 16, .little);
    std.mem.writeInt(u32, bytes[8..12], 4, .little);
    std.mem.writeInt(u32, bytes[12..16], @bitCast(page_scale_value), .little);
}

fn writeSetClipRect(bytes: []u8, flags: u16, rectangle: [4]f32) void {
    std.debug.assert(bytes.len == 28);
    @memset(bytes, 0);
    std.mem.writeInt(u16, bytes[0..2], 0x4032, .little);
    std.mem.writeInt(u16, bytes[2..4], flags, .little);
    std.mem.writeInt(u32, bytes[4..8], 28, .little);
    std.mem.writeInt(u32, bytes[8..12], 16, .little);
    for (rectangle, 0..) |value, index|
        std.mem.writeInt(u32, bytes[12 + index * 4 ..][0..4], @bitCast(value), .little);
}

fn writeOffsetClip(bytes: []u8, dx: f32, dy: f32) void {
    std.debug.assert(bytes.len == 20);
    @memset(bytes, 0);
    std.mem.writeInt(u16, bytes[0..2], 0x4035, .little);
    std.mem.writeInt(u32, bytes[4..8], 20, .little);
    std.mem.writeInt(u32, bytes[8..12], 8, .little);
    std.mem.writeInt(u32, bytes[12..16], @bitCast(dx), .little);
    std.mem.writeInt(u32, bytes[16..20], @bitCast(dy), .little);
}

fn writePropertyRecords(bytes: []u8, alternate: bool) void {
    std.debug.assert(bytes.len == 104);
    @memset(bytes, 0);
    std.mem.writeInt(u16, bytes[0..2], 0x401d, .little);
    std.mem.writeInt(u32, bytes[4..8], 20, .little);
    std.mem.writeInt(u32, bytes[8..12], 8, .little);
    std.mem.writeInt(i32, bytes[12..16], if (alternate) 3 else -1, .little);
    std.mem.writeInt(i32, bytes[16..20], if (alternate) 4 else 2, .little);
    const types = [_]u16{ 0x401e, 0x401f, 0x4020, 0x4021, 0x4022, 0x4023, 0x4024 };
    const initial_flags = [_]u16{ 0x000b, 0x0005, 2200, 0x0007, 0x0004, 0x0001, 0x00ff };
    const alternate_flags = [_]u16{ 0x0000, 0x0001, 1000, 0x0001, 0x0001, 0x0000, 0x0002 };
    for (types, 0..) |record_type, index| {
        const offset = 20 + index * 12;
        writeEmptyRecord(bytes[offset..][0..12], record_type);
        std.mem.writeInt(u16, bytes[offset + 2 ..][0..2], if (alternate) alternate_flags[index] else initial_flags[index], .little);
    }
}

fn writeTerminalServerGraphics(bytes: []u8, alternate: bool, with_palette: bool) void {
    const data_size: u32 = if (with_palette) 52 else 36;
    std.debug.assert(bytes.len == data_size + 12);
    @memset(bytes, 0);
    std.mem.writeInt(u16, bytes[0..2], 0x4039, .little);
    std.mem.writeInt(u16, bytes[2..4], if (with_palette) 1 else 0, .little);
    std.mem.writeInt(u32, bytes[4..8], data_size + 12, .little);
    std.mem.writeInt(u32, bytes[8..12], data_size, .little);
    bytes[12..16].* = if (alternate) .{ 1, 1, 0, 2 } else .{ 5, 5, 1, 5 };
    std.mem.writeInt(i16, bytes[16..18], if (alternate) 3 else -7, .little);
    std.mem.writeInt(i16, bytes[18..20], if (alternate) 4 else 9, .little);
    std.mem.writeInt(u16, bytes[20..22], if (alternate) 2 else 12, .little);
    bytes[22..24].* = if (alternate) .{ 2, 1 } else .{ 7, 4 };
    const matrix = if (alternate) [_]f32{ 7, 8, 9, 10, 11, 12 } else [_]f32{ 1, 2, 3, 4, 5, 6 };
    for (matrix, 0..) |value, index|
        std.mem.writeInt(u32, bytes[24 + index * 4 ..][0..4], @bitCast(value), .little);
    if (with_palette) {
        std.mem.writeInt(u32, bytes[48..52], 0, .little);
        std.mem.writeInt(u32, bytes[52..56], 2, .little);
        bytes[56..64].* = .{ 0x11, 0x22, 0x33, 0x44, 0xaa, 0xbb, 0xcc, 0xdd };
    }
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

test "EMF+ GetDC activates classic EMF observation until the next EMF+ record" {
    var header = [_]u8{0} ** 28;
    writeHeader(&header);
    var get_dc = [_]u8{0} ** 12;
    writeEmptyRecord(&get_dc, 0x4004);
    var eof = [_]u8{0} ** 12;
    writeEmptyRecord(&eof, 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&header), 2));
    try std.testing.expect(!(try state.observeEmfRecord()));
    try std.testing.expect(try state.consume(testComment(&get_dc), 3));
    try std.testing.expect(state.process_emf_records);
    try std.testing.expect(try state.observeEmfRecord());
    try std.testing.expect(try state.observeEmfRecord());
    try std.testing.expectEqual(@as(usize, 2), state.report.get_dc_emf_records);
    try std.testing.expect(try state.consume(testComment(&eof), 6));
    try std.testing.expect(!state.process_emf_records);
    try std.testing.expect(!(try state.observeEmfRecord()));
    try state.finish();

    var same_comment = [_]u8{0} ** 52;
    writeHeader(same_comment[0..28]);
    writeEmptyRecord(same_comment[28..40], 0x4004);
    writeEmptyRecord(same_comment[40..52], 0x4003);
    var same_state: State = .{};
    try std.testing.expect(try same_state.consume(testComment(&same_comment), 2));
    try std.testing.expect(!same_state.process_emf_records);
    try std.testing.expect(!(try same_state.observeEmfRecord()));

    var overflow: State = .{ .process_emf_records = true };
    overflow.report.get_dc_emf_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.observeEmfRecord());
    try std.testing.expectEqualDeep(before, overflow);

    var get_dc_overflow: State = .{};
    try std.testing.expect(try get_dc_overflow.consume(testComment(&header), 2));
    get_dc_overflow.report.get_dc_records = std.math.maxInt(usize);
    const before_get_dc = get_dc_overflow;
    try std.testing.expectError(error.LimitExceeded, get_dc_overflow.consume(testComment(&get_dc), 3));
    try std.testing.expectEqualDeep(before_get_dc, get_dc_overflow);
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

test "EMF+ tracked property state preserves all fields snapshots containers and rollback" {
    var header = [_]u8{0} ** 28;
    writeHeader(&header);
    var state: State = .{};
    var stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer stack.deinit();
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&header), 2));
    try std.testing.expectEqualDeep(property_state.State{}, state.report.properties.?);

    var initial = [_]u8{0} ** 104;
    writePropertyRecords(&initial, false);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&initial), 3));
    const expected: property_state.State = .{
        .rendering_origin = .{ .x = -1, .y = 2 },
        .anti_alias_mode = .{ .smoothing = .anti_alias_8x8, .anti_alias = true },
        .text_rendering_hint = .clear_type_grid_fit,
        .text_contrast = 2200,
        .interpolation_mode = .high_quality_bicubic,
        .pixel_offset_mode = .half,
        .compositing_mode = .source_copy,
        .compositing_quality = .{ .invalid_windows_default = 0xff },
    };
    try std.testing.expectEqualDeep(expected, stack.current.properties);
    try std.testing.expectEqualDeep(expected, state.report.properties.?);

    var save = [_]u8{0} ** 16;
    writeStackIndexRecord(&save, 0x4025, 0, 30);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&save), 4));
    var alternate = [_]u8{0} ** 104;
    writePropertyRecords(&alternate, true);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&alternate), 5));
    try std.testing.expectEqual(@as(i32, 3), stack.current.properties.rendering_origin.?.x);
    try std.testing.expectEqual(@as(u12, 1000), stack.current.properties.text_contrast.?);
    try std.testing.expectEqual(@import("emf_plus_compositing_quality.zig").CompositingQuality.high_speed, stack.current.properties.compositing_quality.?.defined);

    var restore = [_]u8{0} ** 16;
    writeStackIndexRecord(&restore, 0x4026, 0, 30);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&restore), 6));
    try std.testing.expectEqualDeep(expected, stack.current.properties);

    var begin = [_]u8{0} ** 16;
    writeStackIndexRecord(&begin, 0x4028, 0, 31);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&begin), 7));
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&alternate), 8));
    var end = [_]u8{0} ** 16;
    writeStackIndexRecord(&end, 0x4029, 0, 31);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&end), 9));
    try std.testing.expectEqualDeep(expected, stack.current.properties);
    try std.testing.expectEqualDeep(expected, state.report.properties.?);

    var malformed = [_]u8{0} ** 23;
    @memcpy(malformed[0..20], alternate[0..20]);
    malformed[20] = 0xaa;
    malformed[21] = 0xbb;
    malformed[22] = 0xcc;
    const before_state = state;
    const before_properties = stack.current.properties;
    try std.testing.expectError(error.TruncatedEmfPlusRecordHeader, state.consumeTracked(&stack, testComment(&malformed), 10));
    try std.testing.expectEqualDeep(before_state, state);
    try std.testing.expectEqualDeep(before_properties, stack.current.properties);
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
    try std.testing.expectEqual(@as(usize, 1), state.report.begin_container_transform_records);
    try std.testing.expectEqual(@as(usize, 0), state.report.begin_container_unknown_transform_records);
    try std.testing.expectEqualDeep(transform_matrix.TransformMatrix.identity, state.report.world_transform.?);
    try std.testing.expectEqual(@as(usize, 2), state.report.graphics_state_max_depth);

    var discouraged = closed;
    std.mem.writeInt(u16, discouraged[46..48], 0, .little);
    var discouraged_state: State = .{};
    var discouraged_stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer discouraged_stack.deinit();
    try std.testing.expect(try discouraged_state.consumeTracked(&discouraged_stack, testComment(&discouraged), 2));
    try discouraged_state.finishTracked(discouraged_stack);
    try std.testing.expectEqual(@as(usize, 1), discouraged_state.report.begin_container_discouraged_page_unit_records);
    try std.testing.expectEqual(@as(usize, 0), discouraged_state.report.begin_container_transform_records);
    try std.testing.expectEqual(@as(usize, 1), discouraged_state.report.begin_container_unknown_transform_records);

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
    try std.testing.expectEqualDeep(transform_matrix.TransformMatrix{
        .m11 = 3.0 / 7.0,
        .m12 = 0,
        .m21 = 0,
        .m22 = 0.5,
        .dx = -4,
        .dy = -4,
    }, unclosed_stack.current.world_transform.?);
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

    var transform_overflow: State = .{};
    transform_overflow.report.begin_container_transform_records = std.math.maxInt(usize);
    const transform_before = transform_overflow;
    var transform_stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer transform_stack.deinit();
    try std.testing.expectError(error.LimitExceeded, transform_overflow.consumeTracked(&transform_stack, testComment(&closed), 2));
    try std.testing.expectEqualDeep(transform_before, transform_overflow);
    try std.testing.expectEqual(@as(usize, 0), transform_stack.entries.items.len);
    try std.testing.expectEqualDeep(transform_matrix.TransformMatrix.identity, transform_stack.current.world_transform.?);

    var unknown_overflow: State = .{};
    unknown_overflow.report.begin_container_unknown_transform_records = std.math.maxInt(usize);
    const unknown_before = unknown_overflow;
    var unknown_stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer unknown_stack.deinit();
    try std.testing.expectError(error.LimitExceeded, unknown_overflow.consumeTracked(&unknown_stack, testComment(&discouraged), 2));
    try std.testing.expectEqualDeep(unknown_before, unknown_overflow);
    try std.testing.expectEqual(@as(usize, 0), unknown_stack.entries.items.len);
    try std.testing.expectEqualDeep(transform_matrix.TransformMatrix.identity, unknown_stack.current.world_transform.?);
}

test "EMF+ BeginContainer carries header DPI across comments and marks discouraged transforms unknown" {
    var header = [_]u8{0} ** 28;
    writeHeader(&header);
    std.mem.writeInt(u32, header[20..24], 144, .little);
    std.mem.writeInt(u32, header[24..28], 72, .little);
    var state: State = .{};
    var stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer stack.deinit();
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&header), 2));

    var initial = [_]u8{0} ** 36;
    std.mem.writeInt(u16, initial[0..2], 0x402a, .little);
    std.mem.writeInt(u32, initial[4..8], 36, .little);
    std.mem.writeInt(u32, initial[8..12], 24, .little);
    for ([_]f32{ 1, 0, 0, 1, 10, 20 }, 0..) |item, index|
        std.mem.writeInt(u32, initial[12 + index * 4 ..][0..4], @bitCast(item), .little);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&initial), 3));

    var begin = [_]u8{0} ** 48;
    writeBeginContainer(&begin, 3, 1);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&begin), 4));
    try std.testing.expectEqualDeep(transform_matrix.TransformMatrix{
        .m11 = 3.0 / 14.0,
        .m12 = 0,
        .m21 = 0,
        .m22 = 0.5,
        .dx = 1,
        .dy = 16,
    }, stack.current.world_transform.?);
    try std.testing.expectEqual(@as(usize, 1), state.report.begin_container_transform_records);

    var discouraged = [_]u8{0} ** 48;
    writeBeginContainer(&discouraged, 1, 2);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&discouraged), 5));
    try std.testing.expect(stack.current.world_transform == null);
    try std.testing.expect(state.report.world_transform == null);
    try std.testing.expectEqual(@as(usize, 1), state.report.begin_container_unknown_transform_records);

    var set = [_]u8{0} ** 36;
    std.mem.writeInt(u16, set[0..2], 0x402a, .little);
    std.mem.writeInt(u32, set[4..8], 36, .little);
    std.mem.writeInt(u32, set[8..12], 24, .little);
    for ([_]f32{ 2, 0, 0, 3, 5, 7 }, 0..) |item, index|
        std.mem.writeInt(u32, set[12 + index * 4 ..][0..4], @bitCast(item), .little);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&set), 6));
    try std.testing.expectEqualDeep(transform_matrix.TransformMatrix{
        .m11 = 2,
        .m12 = 0,
        .m21 = 0,
        .m22 = 3,
        .dx = 5,
        .dy = 7,
    }, stack.current.world_transform.?);

    var end_inner = [_]u8{0} ** 16;
    writeStackIndexRecord(&end_inner, 0x4029, 0, 2);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&end_inner), 7));
    try std.testing.expectEqualDeep(transform_matrix.TransformMatrix{
        .m11 = 3.0 / 14.0,
        .m12 = 0,
        .m21 = 0,
        .m22 = 0.5,
        .dx = 1,
        .dy = 16,
    }, stack.current.world_transform.?);

    var end_outer = [_]u8{0} ** 16;
    writeStackIndexRecord(&end_outer, 0x4029, 0, 1);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&end_outer), 8));
    try std.testing.expectEqualDeep(transform_matrix.TransformMatrix.translation(10, 20), stack.current.world_transform.?);
    try stack.finish();
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

test "EMF+ tracked SetTSClip owns rectangles snapshots containers clears and rolls back" {
    var header = [_]u8{0} ** 28;
    writeHeader(&header);
    var state: State = .{};
    var stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer stack.deinit();
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&header), 2));

    var first = [_]u8{0} ** 16;
    std.mem.writeInt(u16, first[0..2], 0x403a, .little);
    std.mem.writeInt(u16, first[2..4], 0x8001, .little);
    std.mem.writeInt(u32, first[4..8], 16, .little);
    std.mem.writeInt(u32, first[8..12], 4, .little);
    first[12..16].* = .{ 0x81, 0x82, 0x83, 0x84 };
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&first), 3));
    try std.testing.expectEqual(clip_state.State.complex, stack.current.clip);
    try std.testing.expectEqual(@as(?u16, 1), state.report.terminal_server_clip_rectangles);
    try std.testing.expect(stack.current.terminal_server_clip != null);
    try std.testing.expectEqual(@import("emf_plus_ts_clip_rects.zig").Rect{ .left = 1, .top = 2, .right = 3, .bottom = 6 }, stack.current.terminal_server_clip.?.rectangles[0]);

    var save = [_]u8{0} ** 16;
    writeStackIndexRecord(&save, 0x4025, 0, 70);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&save), 4));
    var second = first;
    second[12..16].* = .{ 0x85, 0x86, 0x87, 0x88 };
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&second), 5));
    try std.testing.expect(stack.current.terminal_server_clip != null);
    try std.testing.expectEqual(@as(i32, 5), stack.current.terminal_server_clip.?.rectangles[0].left);
    var restore = [_]u8{0} ** 16;
    writeStackIndexRecord(&restore, 0x4026, 0, 70);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&restore), 6));
    try std.testing.expect(stack.current.terminal_server_clip != null);
    try std.testing.expectEqual(@as(i32, 1), stack.current.terminal_server_clip.?.rectangles[0].left);

    var begin = [_]u8{0} ** 16;
    writeStackIndexRecord(&begin, 0x4028, 0, 71);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&begin), 7));
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&second), 8));
    var end = [_]u8{0} ** 16;
    writeStackIndexRecord(&end, 0x4029, 0, 71);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&end), 9));
    try std.testing.expect(stack.current.terminal_server_clip != null);
    try std.testing.expectEqual(@as(i32, 1), stack.current.terminal_server_clip.?.rectangles[0].left);

    var malformed = [_]u8{0} ** 19;
    @memcpy(malformed[0..16], second[0..16]);
    malformed[16..19].* = .{ 0xaa, 0xbb, 0xcc };
    const report_before = state.report;
    try std.testing.expectError(error.TruncatedEmfPlusRecordHeader, state.consumeTracked(&stack, testComment(&malformed), 10));
    try std.testing.expectEqualDeep(report_before, state.report);
    try std.testing.expect(stack.current.terminal_server_clip != null);
    try std.testing.expectEqual(@as(i32, 1), stack.current.terminal_server_clip.?.rectangles[0].left);

    var empty = [_]u8{0} ** 12;
    writeEmptyRecord(&empty, 0x403a);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&empty), 11));
    try std.testing.expectEqual(clip_state.State.empty, stack.current.clip);
    try std.testing.expect(stack.current.terminal_server_clip != null);
    try std.testing.expectEqual(@as(usize, 0), stack.current.terminal_server_clip.?.rectangles.len);
    try std.testing.expectEqual(@as(?u16, 0), state.report.terminal_server_clip_rectangles);

    var reset = [_]u8{0} ** 12;
    writeEmptyRecord(&reset, 0x4031);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&reset), 12));
    try std.testing.expect(stack.current.terminal_server_clip == null);
    try std.testing.expectEqual(clip_state.State.infinite, stack.current.clip);
    try std.testing.expectEqual(@as(?u16, null), state.report.terminal_server_clip_rectangles);
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

test "EMF+ tracked SetTSGraphics owns palette snapshots containers and rolls back" {
    var header = [_]u8{0} ** 28;
    writeHeader(&header);
    var state: State = .{};
    var stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer stack.deinit();
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&header), 2));

    var initial = [_]u8{0} ** 64;
    writeTerminalServerGraphics(&initial, false, true);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&initial), 3));
    try std.testing.expect(stack.current.terminal_server_graphics != null);
    const expected = stack.current.terminal_server_graphics.?.summary;
    try std.testing.expectEqual(@as(i16, -7), expected.render_origin_x);
    try std.testing.expectEqual(@as(u16, 12), expected.text_contrast);
    try std.testing.expectEqual(@as(f32, 6), expected.world_to_device.dy);
    try std.testing.expectEqual(@as(?u32, 2), expected.palette_entries);
    try std.testing.expectEqualDeep(expected, state.report.terminal_server_graphics.?);
    try std.testing.expect(stack.current.terminal_server_graphics.?.palette != null);
    initial[56] = 0xff;
    try std.testing.expectEqual(@as(u8, 0x11), stack.current.terminal_server_graphics.?.palette.?.entry_bytes[0]);

    var save = [_]u8{0} ** 16;
    writeStackIndexRecord(&save, 0x4025, 0, 80);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&save), 4));
    var alternate = [_]u8{0} ** 48;
    writeTerminalServerGraphics(&alternate, true, false);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&alternate), 5));
    try std.testing.expectEqual(@as(i16, 3), stack.current.terminal_server_graphics.?.summary.render_origin_x);
    try std.testing.expect(stack.current.terminal_server_graphics.?.palette == null);
    var restore = [_]u8{0} ** 16;
    writeStackIndexRecord(&restore, 0x4026, 0, 80);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&restore), 6));
    try std.testing.expect(stack.current.terminal_server_graphics != null);
    try std.testing.expectEqualDeep(expected, stack.current.terminal_server_graphics.?.summary);
    try std.testing.expect(stack.current.terminal_server_graphics.?.palette != null);
    try std.testing.expectEqual(@as(u8, 0x11), stack.current.terminal_server_graphics.?.palette.?.entry_bytes[0]);

    var begin = [_]u8{0} ** 16;
    writeStackIndexRecord(&begin, 0x4028, 0, 81);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&begin), 7));
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&alternate), 8));
    var end = [_]u8{0} ** 16;
    writeStackIndexRecord(&end, 0x4029, 0, 81);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&end), 9));
    try std.testing.expect(stack.current.terminal_server_graphics != null);
    try std.testing.expectEqualDeep(expected, stack.current.terminal_server_graphics.?.summary);
    try std.testing.expect(stack.current.terminal_server_graphics.?.palette != null);

    var malformed = [_]u8{0} ** 51;
    @memcpy(malformed[0..48], &alternate);
    malformed[48..51].* = .{ 0xaa, 0xbb, 0xcc };
    const report_before = state.report;
    try std.testing.expectError(error.TruncatedEmfPlusRecordHeader, state.consumeTracked(&stack, testComment(&malformed), 10));
    try std.testing.expectEqualDeep(report_before, state.report);
    try std.testing.expect(stack.current.terminal_server_graphics != null);
    try std.testing.expectEqualDeep(expected, stack.current.terminal_server_graphics.?.summary);
    try std.testing.expectEqual(@as(u8, 0x11), stack.current.terminal_server_graphics.?.palette.?.entry_bytes[0]);
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

test "EMF+ tracked stream applies world transforms and Restore recovers the saved snapshot" {
    var bytes = [_]u8{0} ** 128;
    writeHeader(bytes[0..28]);

    std.mem.writeInt(u16, bytes[28..30], 0x402a, .little);
    std.mem.writeInt(u32, bytes[32..36], 36, .little);
    std.mem.writeInt(u32, bytes[36..40], 24, .little);
    for ([_]f32{ 2, 0, 0, 3, 5, 7 }, 0..) |item, index|
        std.mem.writeInt(u32, bytes[40 + index * 4 ..][0..4], @bitCast(item), .little);

    std.mem.writeInt(u16, bytes[64..66], 0x4025, .little);
    std.mem.writeInt(u32, bytes[68..72], 16, .little);
    std.mem.writeInt(u32, bytes[72..76], 4, .little);
    std.mem.writeInt(u32, bytes[76..80], 9, .little);

    std.mem.writeInt(u16, bytes[80..82], 0x402d, .little);
    std.mem.writeInt(u16, bytes[82..84], 0x2000, .little);
    std.mem.writeInt(u32, bytes[84..88], 20, .little);
    std.mem.writeInt(u32, bytes[88..92], 8, .little);
    std.mem.writeInt(u32, bytes[92..96], @bitCast(@as(f32, 11)), .little);
    std.mem.writeInt(u32, bytes[96..100], @bitCast(@as(f32, 13)), .little);

    std.mem.writeInt(u16, bytes[100..102], 0x4026, .little);
    std.mem.writeInt(u32, bytes[104..108], 16, .little);
    std.mem.writeInt(u32, bytes[108..112], 4, .little);
    std.mem.writeInt(u32, bytes[112..116], 9, .little);
    writeEmptyRecord(bytes[116..128], 0x4002);

    var state: State = .{};
    var stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer stack.deinit();
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&bytes), 2));
    try state.finishTracked(stack);
    try std.testing.expectEqualDeep(transform_matrix.TransformMatrix{
        .m11 = 2,
        .m12 = 0,
        .m21 = 0,
        .m22 = 3,
        .dx = 5,
        .dy = 7,
    }, state.report.world_transform.?);
    try std.testing.expectEqualDeep(state.report.world_transform.?, stack.current.world_transform.?);
    try std.testing.expectEqual(@as(usize, 1), state.report.graphics_state_max_depth);
}

test "EMF+ tracked stream rolls world transform back when a later record is malformed" {
    var header = [_]u8{0} ** 28;
    writeHeader(&header);
    var state: State = .{};
    var stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer stack.deinit();
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&header), 2));

    var bytes = [_]u8{0} ** 39;
    std.mem.writeInt(u16, bytes[0..2], 0x402a, .little);
    std.mem.writeInt(u32, bytes[4..8], 36, .little);
    std.mem.writeInt(u32, bytes[8..12], 24, .little);
    for ([_]f32{ 2, 0, 0, 3, 5, 7 }, 0..) |item, index|
        std.mem.writeInt(u32, bytes[12 + index * 4 ..][0..4], @bitCast(item), .little);
    bytes[36] = 0xaa;
    bytes[37] = 0xbb;
    bytes[38] = 0xcc;

    const before_state = state;
    const before_stack = stack.current;
    try std.testing.expectError(error.TruncatedEmfPlusRecordHeader, state.consumeTracked(&stack, testComment(&bytes), 3));
    try std.testing.expectEqualDeep(before_state, state);
    try std.testing.expectEqualDeep(before_stack, stack.current);
}

test "EMF+ tracked stream connects multiply scale rotate and reset to the current world transform" {
    var header = [_]u8{0} ** 28;
    writeHeader(&header);
    var state: State = .{};
    var stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer stack.deinit();
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&header), 2));

    var multiply = [_]u8{0} ** 36;
    std.mem.writeInt(u16, multiply[0..2], 0x402c, .little);
    std.mem.writeInt(u32, multiply[4..8], 36, .little);
    std.mem.writeInt(u32, multiply[8..12], 24, .little);
    for ([_]f32{ 2, 0, 0, 3, 5, 7 }, 0..) |item, index|
        std.mem.writeInt(u32, multiply[12 + index * 4 ..][0..4], @bitCast(item), .little);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&multiply), 3));
    try std.testing.expectEqualDeep(transform_matrix.TransformMatrix{
        .m11 = 2,
        .m12 = 0,
        .m21 = 0,
        .m22 = 3,
        .dx = 5,
        .dy = 7,
    }, stack.current.world_transform.?);

    var scale = [_]u8{0} ** 20;
    std.mem.writeInt(u16, scale[0..2], 0x402e, .little);
    std.mem.writeInt(u16, scale[2..4], 0x2000, .little);
    std.mem.writeInt(u32, scale[4..8], 20, .little);
    std.mem.writeInt(u32, scale[8..12], 8, .little);
    std.mem.writeInt(u32, scale[12..16], @bitCast(@as(f32, 4)), .little);
    std.mem.writeInt(u32, scale[16..20], @bitCast(@as(f32, 5)), .little);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&scale), 4));
    try std.testing.expectEqualDeep(transform_matrix.TransformMatrix{
        .m11 = 8,
        .m12 = 0,
        .m21 = 0,
        .m22 = 15,
        .dx = 20,
        .dy = 35,
    }, stack.current.world_transform.?);

    var rotate = [_]u8{0} ** 16;
    std.mem.writeInt(u16, rotate[0..2], 0x402f, .little);
    std.mem.writeInt(u16, rotate[2..4], 0x2000, .little);
    std.mem.writeInt(u32, rotate[4..8], 16, .little);
    std.mem.writeInt(u32, rotate[8..12], 4, .little);
    std.mem.writeInt(u32, rotate[12..16], @bitCast(@as(f32, 90)), .little);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&rotate), 5));
    try std.testing.expectApproxEqAbs(@as(f32, 0), stack.current.world_transform.?.m11, 0.00001);
    try std.testing.expectApproxEqAbs(@as(f32, 8), stack.current.world_transform.?.m12, 0.00001);
    try std.testing.expectApproxEqAbs(@as(f32, -15), stack.current.world_transform.?.m21, 0.00001);
    try std.testing.expectApproxEqAbs(@as(f32, 0), stack.current.world_transform.?.m22, 0.00001);
    try std.testing.expectApproxEqAbs(@as(f32, -35), stack.current.world_transform.?.dx, 0.00001);
    try std.testing.expectApproxEqAbs(@as(f32, 20), stack.current.world_transform.?.dy, 0.00001);

    var reset = [_]u8{0} ** 12;
    writeEmptyRecord(&reset, 0x402b);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&reset), 6));
    try std.testing.expectEqualDeep(transform_matrix.TransformMatrix.identity, stack.current.world_transform.?);
    try std.testing.expectEqualDeep(transform_matrix.TransformMatrix.identity, state.report.world_transform.?);

    var translate = [_]u8{0} ** 20;
    std.mem.writeInt(u16, translate[0..2], 0x402d, .little);
    std.mem.writeInt(u16, translate[2..4], 0x2000, .little);
    std.mem.writeInt(u32, translate[4..8], 20, .little);
    std.mem.writeInt(u32, translate[8..12], 8, .little);
    std.mem.writeInt(u32, translate[12..16], @bitCast(@as(f32, -2)), .little);
    std.mem.writeInt(u32, translate[16..20], @bitCast(@as(f32, 9)), .little);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&translate), 7));
    try std.testing.expectEqualDeep(transform_matrix.TransformMatrix.translation(-2, 9), stack.current.world_transform.?);
    try std.testing.expectEqualDeep(stack.current.world_transform.?, state.report.world_transform.?);
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

test "EMF+ tracked SetPageTransform resolves DPI snapshots Restore and rollback" {
    var header = [_]u8{0} ** 28;
    writeHeader(&header);
    std.mem.writeInt(u32, header[20..24], 96, .little);
    std.mem.writeInt(u32, header[24..28], 120, .little);
    var state: State = .{};
    var stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer stack.deinit();
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&header), 2));

    var inch = [_]u8{0} ** 16;
    writeSetPageTransform(&inch, 4, 2);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&inch), 3));
    try std.testing.expectEqualDeep(page_transform.PageTransform{
        .page_unit = .inch,
        .page_scale = 2,
        .device_scale = .{ .x = 192, .y = 240 },
    }, stack.current.page_transform);
    try std.testing.expectEqualDeep(stack.current.page_transform, state.report.page_transform.?);

    var save = [_]u8{0} ** 16;
    writeStackIndexRecord(&save, 0x4025, 0, 9);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&save), 4));

    var point = [_]u8{0} ** 16;
    writeSetPageTransform(&point, 3, 0.5);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&point), 5));
    try std.testing.expectApproxEqAbs(@as(f32, 2.0 / 3.0), stack.current.page_transform.device_scale.?.x, 0.000001);
    try std.testing.expectApproxEqAbs(@as(f32, 5.0 / 6.0), stack.current.page_transform.device_scale.?.y, 0.000001);

    var restore = [_]u8{0} ** 16;
    writeStackIndexRecord(&restore, 0x4026, 0, 9);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&restore), 6));
    try std.testing.expectEqualDeep(page_transform.PageTransform{
        .page_unit = .inch,
        .page_scale = 2,
        .device_scale = .{ .x = 192, .y = 240 },
    }, stack.current.page_transform);

    var malformed = [_]u8{0} ** 19;
    writeSetPageTransform(malformed[0..16], 2, 7);
    malformed[16] = 0xaa;
    malformed[17] = 0xbb;
    malformed[18] = 0xcc;
    const before_state = state;
    const before_page = stack.current.page_transform;
    try std.testing.expectError(error.TruncatedEmfPlusRecordHeader, state.consumeTracked(&stack, testComment(&malformed), 7));
    try std.testing.expectEqualDeep(before_state, state);
    try std.testing.expectEqualDeep(before_page, stack.current.page_transform);

    var display = [_]u8{0} ** 16;
    writeSetPageTransform(&display, 1, 3);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&display), 8));
    try std.testing.expectEqual(@import("emf_plus_unit_type.zig").UnitType.display, stack.current.page_transform.page_unit);
    try std.testing.expectEqual(@as(f32, 3), stack.current.page_transform.page_scale);
    try std.testing.expect(stack.current.page_transform.device_scale == null);
    try std.testing.expectEqualDeep(stack.current.page_transform, state.report.page_transform.?);

    var begin = [_]u8{0} ** 16;
    writeStackIndexRecord(&begin, 0x4028, 0, 10);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&begin), 9));
    var pixel = [_]u8{0} ** 16;
    writeSetPageTransform(&pixel, 2, 7);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&pixel), 10));
    try std.testing.expectEqual(@as(f32, 7), stack.current.page_transform.device_scale.?.x);
    var end = [_]u8{0} ** 16;
    writeStackIndexRecord(&end, 0x4029, 0, 10);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&end), 11));
    try std.testing.expectEqual(@import("emf_plus_unit_type.zig").UnitType.display, stack.current.page_transform.page_unit);
    try std.testing.expectEqual(@as(f32, 3), stack.current.page_transform.page_scale);
    try std.testing.expect(stack.current.page_transform.device_scale == null);
    try std.testing.expectEqualDeep(stack.current.page_transform, state.report.page_transform.?);
}

test "EMF+ stream validates ResetClip and rolls report back atomically" {
    var bytes = [_]u8{0} ** 52;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4031);
    std.mem.writeInt(u16, bytes[30..32], 0xffff, .little);
    writeEmptyRecord(bytes[40..52], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.reset_clip_records);

    var malformed = [_]u8{0} ** 56;
    @memcpy(malformed[0..28], bytes[0..28]);
    std.mem.writeInt(u16, malformed[28..30], 0x4031, .little);
    std.mem.writeInt(u32, malformed[32..36], 16, .little);
    std.mem.writeInt(u32, malformed[36..40], 4, .little);
    writeEmptyRecord(malformed[44..56], 0x4002);
    var malformed_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusResetClipSize, malformed_state.consume(testComment(&malformed), 2));
    try std.testing.expectEqualDeep(State{}, malformed_state);

    var overflow: State = .{};
    overflow.report.reset_clip_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..40]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ tracked clip state preserves abstract commands snapshots containers and rollback" {
    var header = [_]u8{0} ** 28;
    writeHeader(&header);
    var state: State = .{};
    var stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer stack.deinit();
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&header), 2));
    try std.testing.expectEqual(clip_state.State.infinite, state.report.clip.?);

    var replace = [_]u8{0} ** 28;
    writeSetClipRect(&replace, 0x0000, .{ 1, 2, 3, 4 });
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&replace), 3));
    const original = clip_state.State.complex;
    try std.testing.expectEqual(original, stack.current.clip);
    try std.testing.expectEqual(original, state.report.clip.?);

    var save = [_]u8{0} ** 16;
    writeStackIndexRecord(&save, 0x4025, 0, 20);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&save), 4));
    var offset = [_]u8{0} ** 20;
    writeOffsetClip(&offset, 5, -7);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&offset), 5));
    try std.testing.expectEqual(clip_state.State.complex, stack.current.clip);

    var intersect = [_]u8{0} ** 28;
    writeSetClipRect(&intersect, 0x0100, .{ 0, 0, 2, 2 });
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&intersect), 6));
    try std.testing.expectEqual(clip_state.State.complex, stack.current.clip);

    var restore = [_]u8{0} ** 16;
    writeStackIndexRecord(&restore, 0x4026, 0, 20);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&restore), 7));
    try std.testing.expectEqual(original, stack.current.clip);

    var begin = [_]u8{0} ** 16;
    writeStackIndexRecord(&begin, 0x4028, 0, 21);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&begin), 8));
    var reset = [_]u8{0} ** 12;
    writeEmptyRecord(&reset, 0x4031);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&reset), 9));
    try std.testing.expectEqual(clip_state.State.infinite, stack.current.clip);
    var end = [_]u8{0} ** 16;
    writeStackIndexRecord(&end, 0x4029, 0, 21);
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&end), 10));
    try std.testing.expectEqual(original, stack.current.clip);
    try std.testing.expectEqual(original, state.report.clip.?);

    var malformed = [_]u8{0} ** 23;
    writeOffsetClip(malformed[0..20], 100, 200);
    malformed[20] = 0xaa;
    malformed[21] = 0xbb;
    malformed[22] = 0xcc;
    const before_state = state;
    const before_clip = stack.current.clip;
    try std.testing.expectError(error.TruncatedEmfPlusRecordHeader, state.consumeTracked(&stack, testComment(&malformed), 11));
    try std.testing.expectEqualDeep(before_state, state);
    try std.testing.expectEqual(before_clip, stack.current.clip);
}

test "EMF+ stream validates SetClipRect and rolls report back atomically" {
    var bytes = [_]u8{0} ** 68;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x4032, .little);
    std.mem.writeInt(u16, bytes[30..32], 0xf5ff, .little);
    std.mem.writeInt(u32, bytes[32..36], 28, .little);
    std.mem.writeInt(u32, bytes[36..40], 16, .little);
    std.mem.writeInt(u32, bytes[40..44], 0x80000000, .little);
    std.mem.writeInt(u32, bytes[44..48], 0x7f800000, .little);
    std.mem.writeInt(u32, bytes[48..52], 0x7fc00001, .little);
    std.mem.writeInt(u32, bytes[52..56], 0xc0900000, .little);
    writeEmptyRecord(bytes[56..68], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.set_clip_rect_records);

    var malformed = [_]u8{0} ** 64;
    @memcpy(malformed[0..28], bytes[0..28]);
    std.mem.writeInt(u16, malformed[28..30], 0x4032, .little);
    std.mem.writeInt(u32, malformed[32..36], 24, .little);
    std.mem.writeInt(u32, malformed[36..40], 12, .little);
    writeEmptyRecord(malformed[52..64], 0x4002);
    var malformed_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusSetClipRectSize, malformed_state.consume(testComment(&malformed), 2));
    try std.testing.expectEqualDeep(State{}, malformed_state);

    var overflow: State = .{};
    overflow.report.set_clip_rect_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..56]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream resolves SetClipPath Path references atomically" {
    var bytes = [_]u8{0} ** 64;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4008);
    std.mem.writeInt(u16, bytes[30..32], 0x0305, .little);
    writeEmptyRecord(bytes[40..52], 0x4033);
    std.mem.writeInt(u16, bytes[42..44], 0xf005, .little);
    writeEmptyRecord(bytes[52..64], 0x4002);

    var state: State = .{};
    var stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer stack.deinit();
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&bytes), 2));
    try state.finishTracked(stack);
    try std.testing.expectEqual(@as(usize, 1), state.report.set_clip_path_records);
    try std.testing.expectEqualDeep(clip_state.State.complex, state.report.clip.?);

    var missing = bytes;
    std.mem.writeInt(u16, missing[42..44], 0xf506, .little);
    var missing_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusSetClipPathPath, missing_state.consume(testComment(&missing), 2));
    try std.testing.expectEqualDeep(State{}, missing_state);

    var wrong_type = bytes;
    std.mem.writeInt(u16, wrong_type[30..32], 0x0205, .little);
    var wrong_type_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusSetClipPathPathType, wrong_type_state.consume(testComment(&wrong_type), 2));
    try std.testing.expectEqualDeep(State{}, wrong_type_state);

    var invalid_mode = bytes;
    std.mem.writeInt(u16, invalid_mode[42..44], 0xf605, .little);
    var invalid_mode_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusCombineMode, invalid_mode_state.consume(testComment(&invalid_mode), 2));
    try std.testing.expectEqualDeep(State{}, invalid_mode_state);

    var overflow: State = .{};
    overflow.report.set_clip_path_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..52]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream resolves SetClipRegion Region references atomically" {
    var bytes = [_]u8{0} ** 64;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4008);
    std.mem.writeInt(u16, bytes[30..32], 0x0405, .little);
    writeEmptyRecord(bytes[40..52], 0x4034);
    std.mem.writeInt(u16, bytes[42..44], 0xf005, .little);
    writeEmptyRecord(bytes[52..64], 0x4002);

    var state: State = .{};
    var stack = graphics_state_stack.Stack.init(std.testing.allocator);
    defer stack.deinit();
    try std.testing.expect(try state.consumeTracked(&stack, testComment(&bytes), 2));
    try state.finishTracked(stack);
    try std.testing.expectEqual(@as(usize, 1), state.report.set_clip_region_records);
    try std.testing.expectEqualDeep(clip_state.State.complex, state.report.clip.?);

    var missing = bytes;
    std.mem.writeInt(u16, missing[42..44], 0xf506, .little);
    var missing_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusSetClipRegionRegion, missing_state.consume(testComment(&missing), 2));
    try std.testing.expectEqualDeep(State{}, missing_state);

    var wrong_type = bytes;
    std.mem.writeInt(u16, wrong_type[30..32], 0x0305, .little);
    var wrong_type_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusSetClipRegionRegionType, wrong_type_state.consume(testComment(&wrong_type), 2));
    try std.testing.expectEqualDeep(State{}, wrong_type_state);

    var invalid_mode = bytes;
    std.mem.writeInt(u16, invalid_mode[42..44], 0xf605, .little);
    var invalid_mode_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusCombineMode, invalid_mode_state.consume(testComment(&invalid_mode), 2));
    try std.testing.expectEqualDeep(State{}, invalid_mode_state);

    var overflow: State = .{};
    overflow.report.set_clip_region_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..52]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream validates OffsetClip and rolls report back atomically" {
    var bytes = [_]u8{0} ** 60;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x4035, .little);
    std.mem.writeInt(u16, bytes[30..32], 0xffff, .little);
    std.mem.writeInt(u32, bytes[32..36], 20, .little);
    std.mem.writeInt(u32, bytes[36..40], 8, .little);
    std.mem.writeInt(u32, bytes[40..44], 0x80000000, .little);
    std.mem.writeInt(u32, bytes[44..48], 0x7fc00001, .little);
    writeEmptyRecord(bytes[48..60], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.offset_clip_records);

    var malformed = [_]u8{0} ** 56;
    @memcpy(malformed[0..28], bytes[0..28]);
    std.mem.writeInt(u16, malformed[28..30], 0x4035, .little);
    std.mem.writeInt(u32, malformed[32..36], 16, .little);
    std.mem.writeInt(u32, malformed[36..40], 4, .little);
    writeEmptyRecord(malformed[44..56], 0x4002);
    var malformed_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusOffsetClipSize, malformed_state.consume(testComment(&malformed), 2));
    try std.testing.expectEqualDeep(State{}, malformed_state);

    var overflow: State = .{};
    overflow.report.offset_clip_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..48]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream observes undocumented StrokeFillPath atomically" {
    var bytes = [_]u8{0} ** 56;
    writeHeader(bytes[0..28]);
    std.mem.writeInt(u16, bytes[28..30], 0x4037, .little);
    std.mem.writeInt(u16, bytes[30..32], 0xa55a, .little);
    std.mem.writeInt(u32, bytes[32..36], 16, .little);
    std.mem.writeInt(u32, bytes[36..40], 4, .little);
    bytes[40..44].* = .{ 0x00, 0x7f, 0x80, 0xff };
    writeEmptyRecord(bytes[44..56], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.opaque_stroke_fill_path_records);

    var overflow: State = .{};
    overflow.report.opaque_stroke_fill_path_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..44]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream resolves FillRects conditional Brush references atomically" {
    var bytes = [_]u8{0} ** 80;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4008);
    std.mem.writeInt(u16, bytes[30..32], 0x0107, .little);
    std.mem.writeInt(u16, bytes[40..42], 0x400a, .little);
    std.mem.writeInt(u16, bytes[42..44], 0x4000, .little);
    std.mem.writeInt(u32, bytes[44..48], 28, .little);
    std.mem.writeInt(u32, bytes[48..52], 16, .little);
    std.mem.writeInt(u32, bytes[52..56], 7, .little);
    std.mem.writeInt(u32, bytes[56..60], 1, .little);
    for (0..4) |index| std.mem.writeInt(i16, bytes[60 + index * 2 ..][0..2], @intCast(index), .little);
    writeEmptyRecord(bytes[68..80], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.fill_rects_records);

    var literal = bytes;
    std.mem.writeInt(u16, literal[42..44], 0xc000, .little);
    std.mem.writeInt(u32, literal[52..56], 0xffffffff, .little);
    std.mem.writeInt(u16, literal[30..32], 0x0207, .little);
    var literal_state: State = .{};
    try std.testing.expect(try literal_state.consume(testComment(&literal), 2));
    try literal_state.finish();
    try std.testing.expectEqual(@as(usize, 1), literal_state.report.fill_rects_records);

    var missing = bytes;
    std.mem.writeInt(u32, missing[52..56], 8, .little);
    var missing_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusFillRectsBrush, missing_state.consume(testComment(&missing), 2));
    try std.testing.expectEqualDeep(State{}, missing_state);

    var wrong_type = bytes;
    std.mem.writeInt(u16, wrong_type[30..32], 0x0207, .little);
    var wrong_type_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusFillRectsBrushType, wrong_type_state.consume(testComment(&wrong_type), 2));
    try std.testing.expectEqualDeep(State{}, wrong_type_state);

    var overflow: State = .{};
    overflow.report.fill_rects_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..68]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream resolves FillPolygon conditional Brush references atomically" {
    var bytes = [_]u8{0} ** 80;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4008);
    std.mem.writeInt(u16, bytes[30..32], 0x0107, .little);
    std.mem.writeInt(u16, bytes[40..42], 0x400c, .little);
    std.mem.writeInt(u16, bytes[42..44], 0x4800, .little);
    std.mem.writeInt(u32, bytes[44..48], 28, .little);
    std.mem.writeInt(u32, bytes[48..52], 16, .little);
    std.mem.writeInt(u32, bytes[52..56], 7, .little);
    std.mem.writeInt(u32, bytes[56..60], 3, .little);
    bytes[60..68].* = .{ 1, 2, 3, 4, 5, 6, 0, 0 };
    writeEmptyRecord(bytes[68..80], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.fill_polygon_records);

    var literal = bytes;
    std.mem.writeInt(u16, literal[42..44], 0xc800, .little);
    std.mem.writeInt(u32, literal[52..56], 0xffffffff, .little);
    std.mem.writeInt(u16, literal[30..32], 0x0207, .little);
    var literal_state: State = .{};
    try std.testing.expect(try literal_state.consume(testComment(&literal), 2));
    try literal_state.finish();
    try std.testing.expectEqual(@as(usize, 1), literal_state.report.fill_polygon_records);

    var missing = bytes;
    std.mem.writeInt(u32, missing[52..56], 8, .little);
    var missing_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusFillPolygonBrush, missing_state.consume(testComment(&missing), 2));
    try std.testing.expectEqualDeep(State{}, missing_state);

    var wrong_type = bytes;
    std.mem.writeInt(u16, wrong_type[30..32], 0x0207, .little);
    var wrong_type_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusFillPolygonBrushType, wrong_type_state.consume(testComment(&wrong_type), 2));
    try std.testing.expectEqualDeep(State{}, wrong_type_state);

    var overflow: State = .{};
    overflow.report.fill_polygon_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..68]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream resolves FillEllipse conditional Brush references atomically" {
    var bytes = [_]u8{0} ** 76;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4008);
    std.mem.writeInt(u16, bytes[30..32], 0x0107, .little);
    std.mem.writeInt(u16, bytes[40..42], 0x400e, .little);
    std.mem.writeInt(u16, bytes[42..44], 0x4000, .little);
    std.mem.writeInt(u32, bytes[44..48], 24, .little);
    std.mem.writeInt(u32, bytes[48..52], 12, .little);
    std.mem.writeInt(u32, bytes[52..56], 7, .little);
    for (0..4) |index| std.mem.writeInt(i16, bytes[56 + index * 2 ..][0..2], @intCast(index), .little);
    writeEmptyRecord(bytes[64..76], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.fill_ellipse_records);

    var literal = bytes;
    std.mem.writeInt(u16, literal[42..44], 0xc000, .little);
    std.mem.writeInt(u32, literal[52..56], 0xffffffff, .little);
    std.mem.writeInt(u16, literal[30..32], 0x0207, .little);
    var literal_state: State = .{};
    try std.testing.expect(try literal_state.consume(testComment(&literal), 2));
    try literal_state.finish();
    try std.testing.expectEqual(@as(usize, 1), literal_state.report.fill_ellipse_records);

    var missing = bytes;
    std.mem.writeInt(u32, missing[52..56], 8, .little);
    var missing_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusFillEllipseBrush, missing_state.consume(testComment(&missing), 2));
    try std.testing.expectEqualDeep(State{}, missing_state);

    var wrong_type = bytes;
    std.mem.writeInt(u16, wrong_type[30..32], 0x0207, .little);
    var wrong_type_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusFillEllipseBrushType, wrong_type_state.consume(testComment(&wrong_type), 2));
    try std.testing.expectEqualDeep(State{}, wrong_type_state);

    var overflow: State = .{};
    overflow.report.fill_ellipse_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..64]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream resolves FillPie conditional Brush references atomically" {
    var bytes = [_]u8{0} ** 84;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4008);
    std.mem.writeInt(u16, bytes[30..32], 0x0107, .little);
    std.mem.writeInt(u16, bytes[40..42], 0x4010, .little);
    std.mem.writeInt(u16, bytes[42..44], 0x4000, .little);
    std.mem.writeInt(u32, bytes[44..48], 32, .little);
    std.mem.writeInt(u32, bytes[48..52], 20, .little);
    std.mem.writeInt(u32, bytes[52..56], 7, .little);
    std.mem.writeInt(u32, bytes[56..60], @bitCast(@as(f32, 450.0)), .little);
    std.mem.writeInt(u32, bytes[60..64], @bitCast(@as(f32, -720.0)), .little);
    for (0..4) |index| std.mem.writeInt(i16, bytes[64 + index * 2 ..][0..2], @intCast(index), .little);
    writeEmptyRecord(bytes[72..84], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.fill_pie_records);

    var literal = bytes;
    std.mem.writeInt(u16, literal[42..44], 0xc000, .little);
    std.mem.writeInt(u32, literal[52..56], 0xffffffff, .little);
    std.mem.writeInt(u16, literal[30..32], 0x0207, .little);
    var literal_state: State = .{};
    try std.testing.expect(try literal_state.consume(testComment(&literal), 2));
    try literal_state.finish();
    try std.testing.expectEqual(@as(usize, 1), literal_state.report.fill_pie_records);

    var missing = bytes;
    std.mem.writeInt(u32, missing[52..56], 8, .little);
    var missing_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusFillPieBrush, missing_state.consume(testComment(&missing), 2));
    try std.testing.expectEqualDeep(State{}, missing_state);

    var wrong_type = bytes;
    std.mem.writeInt(u16, wrong_type[30..32], 0x0207, .little);
    var wrong_type_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusFillPieBrushType, wrong_type_state.consume(testComment(&wrong_type), 2));
    try std.testing.expectEqualDeep(State{}, wrong_type_state);

    var overflow: State = .{};
    overflow.report.fill_pie_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..72]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream resolves FillRegion Region and conditional Brush references atomically" {
    var bytes = [_]u8{0} ** 80;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4008);
    std.mem.writeInt(u16, bytes[30..32], 0x0405, .little);
    writeEmptyRecord(bytes[40..52], 0x4008);
    std.mem.writeInt(u16, bytes[42..44], 0x0107, .little);
    std.mem.writeInt(u16, bytes[52..54], 0x4013, .little);
    std.mem.writeInt(u16, bytes[54..56], 5, .little);
    std.mem.writeInt(u32, bytes[56..60], 16, .little);
    std.mem.writeInt(u32, bytes[60..64], 4, .little);
    std.mem.writeInt(u32, bytes[64..68], 7, .little);
    writeEmptyRecord(bytes[68..80], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.fill_region_records);

    var literal = bytes;
    std.mem.writeInt(u16, literal[54..56], 0x8005, .little);
    std.mem.writeInt(u32, literal[64..68], 0xffffffff, .little);
    std.mem.writeInt(u16, literal[42..44], 0x0207, .little);
    var literal_state: State = .{};
    try std.testing.expect(try literal_state.consume(testComment(&literal), 2));
    try literal_state.finish();
    try std.testing.expectEqual(@as(usize, 1), literal_state.report.fill_region_records);

    var missing_region = bytes;
    std.mem.writeInt(u16, missing_region[54..56], 6, .little);
    var missing_region_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusFillRegionRegion, missing_region_state.consume(testComment(&missing_region), 2));
    try std.testing.expectEqualDeep(State{}, missing_region_state);

    var wrong_region = bytes;
    std.mem.writeInt(u16, wrong_region[30..32], 0x0305, .little);
    var wrong_region_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusFillRegionRegionType, wrong_region_state.consume(testComment(&wrong_region), 2));
    try std.testing.expectEqualDeep(State{}, wrong_region_state);

    var missing_brush = bytes;
    std.mem.writeInt(u32, missing_brush[64..68], 8, .little);
    var missing_brush_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusFillRegionBrush, missing_brush_state.consume(testComment(&missing_brush), 2));
    try std.testing.expectEqualDeep(State{}, missing_brush_state);

    var wrong_brush = bytes;
    std.mem.writeInt(u16, wrong_brush[42..44], 0x0207, .little);
    var wrong_brush_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusFillRegionBrushType, wrong_brush_state.consume(testComment(&wrong_brush), 2));
    try std.testing.expectEqualDeep(State{}, wrong_brush_state);

    var overflow: State = .{};
    overflow.report.fill_region_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..68]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream resolves FillPath Path and conditional Brush references atomically" {
    var bytes = [_]u8{0} ** 80;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4008);
    std.mem.writeInt(u16, bytes[30..32], 0x0305, .little);
    writeEmptyRecord(bytes[40..52], 0x4008);
    std.mem.writeInt(u16, bytes[42..44], 0x0107, .little);
    std.mem.writeInt(u16, bytes[52..54], 0x4014, .little);
    std.mem.writeInt(u16, bytes[54..56], 5, .little);
    std.mem.writeInt(u32, bytes[56..60], 16, .little);
    std.mem.writeInt(u32, bytes[60..64], 4, .little);
    std.mem.writeInt(u32, bytes[64..68], 7, .little);
    writeEmptyRecord(bytes[68..80], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.fill_path_records);

    var literal = bytes;
    std.mem.writeInt(u16, literal[54..56], 0x8005, .little);
    std.mem.writeInt(u32, literal[64..68], 0xffffffff, .little);
    std.mem.writeInt(u16, literal[42..44], 0x0207, .little);
    var literal_state: State = .{};
    try std.testing.expect(try literal_state.consume(testComment(&literal), 2));
    try literal_state.finish();
    try std.testing.expectEqual(@as(usize, 1), literal_state.report.fill_path_records);

    var missing_path = bytes;
    std.mem.writeInt(u16, missing_path[54..56], 6, .little);
    var missing_path_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusFillPathPath, missing_path_state.consume(testComment(&missing_path), 2));
    try std.testing.expectEqualDeep(State{}, missing_path_state);

    var wrong_path = bytes;
    std.mem.writeInt(u16, wrong_path[30..32], 0x0405, .little);
    var wrong_path_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusFillPathPathType, wrong_path_state.consume(testComment(&wrong_path), 2));
    try std.testing.expectEqualDeep(State{}, wrong_path_state);

    var missing_brush = bytes;
    std.mem.writeInt(u32, missing_brush[64..68], 8, .little);
    var missing_brush_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusFillPathBrush, missing_brush_state.consume(testComment(&missing_brush), 2));
    try std.testing.expectEqualDeep(State{}, missing_brush_state);

    var wrong_brush = bytes;
    std.mem.writeInt(u16, wrong_brush[42..44], 0x0207, .little);
    var wrong_brush_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusFillPathBrushType, wrong_brush_state.consume(testComment(&wrong_brush), 2));
    try std.testing.expectEqualDeep(State{}, wrong_brush_state);

    var overflow: State = .{};
    overflow.report.fill_path_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..68]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}

test "EMF+ stream resolves FillClosedCurve conditional Brush references atomically" {
    var bytes = [_]u8{0} ** 84;
    writeHeader(bytes[0..28]);
    writeEmptyRecord(bytes[28..40], 0x4008);
    std.mem.writeInt(u16, bytes[30..32], 0x0107, .little);
    std.mem.writeInt(u16, bytes[40..42], 0x4016, .little);
    std.mem.writeInt(u16, bytes[42..44], 0x4800, .little);
    std.mem.writeInt(u32, bytes[44..48], 32, .little);
    std.mem.writeInt(u32, bytes[48..52], 20, .little);
    std.mem.writeInt(u32, bytes[52..56], 7, .little);
    std.mem.writeInt(u32, bytes[56..60], @bitCast(@as(f32, 0.5)), .little);
    std.mem.writeInt(u32, bytes[60..64], 3, .little);
    bytes[64..72].* = .{ 1, 2, 3, 4, 5, 6, 0, 0 };
    writeEmptyRecord(bytes[72..84], 0x4002);

    var state: State = .{};
    try std.testing.expect(try state.consume(testComment(&bytes), 2));
    try state.finish();
    try std.testing.expectEqual(@as(usize, 1), state.report.fill_closed_curve_records);

    var literal = bytes;
    std.mem.writeInt(u16, literal[42..44], 0xc800, .little);
    std.mem.writeInt(u32, literal[52..56], 0xffffffff, .little);
    std.mem.writeInt(u16, literal[30..32], 0x0207, .little);
    var literal_state: State = .{};
    try std.testing.expect(try literal_state.consume(testComment(&literal), 2));
    try literal_state.finish();
    try std.testing.expectEqual(@as(usize, 1), literal_state.report.fill_closed_curve_records);

    var missing = bytes;
    std.mem.writeInt(u32, missing[52..56], 8, .little);
    var missing_state: State = .{};
    try std.testing.expectError(error.MissingEmfPlusFillClosedCurveBrush, missing_state.consume(testComment(&missing), 2));
    try std.testing.expectEqualDeep(State{}, missing_state);

    var wrong_type = bytes;
    std.mem.writeInt(u16, wrong_type[30..32], 0x0207, .little);
    var wrong_type_state: State = .{};
    try std.testing.expectError(error.InvalidEmfPlusFillClosedCurveBrushType, wrong_type_state.consume(testComment(&wrong_type), 2));
    try std.testing.expectEqualDeep(State{}, wrong_type_state);

    var overflow: State = .{};
    overflow.report.fill_closed_curve_records = std.math.maxInt(usize);
    const before = overflow;
    try std.testing.expectError(error.LimitExceeded, overflow.consume(testComment(bytes[0..72]), 2));
    try std.testing.expectEqualDeep(before, overflow);
}
