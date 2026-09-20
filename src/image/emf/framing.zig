const records = @import("records.zig");
const header = @import("header.zig");
const header_payload = @import("header_payload.zig");
const pixel_format_record = @import("pixel_format_record.zig");
const icm_mode = @import("icm_mode.zig");
const path_bracket = @import("path_bracket.zig");
const transform_records = @import("transform_records.zig");
const point_records = @import("point_records.zig");
const mode_records = @import("mode_records.zig");
const color_records = @import("color_records.zig");
const mapper_flags = @import("mapper_flags.zig");
const miter_limit = @import("miter_limit.zig");
const text_alignment = @import("text_alignment.zig");
const text_justification = @import("text_justification.zig");
const color_match_to_target = @import("color_match_to_target.zig");
const scale_extents = @import("scale_extents.zig");
const poly_records = @import("poly_records.zig");
const poly_records_16 = @import("poly_records_16.zig");
const poly_draw = @import("poly_draw.zig");
const basic_point_drawing = @import("basic_point_drawing.zig");
const basic_shapes = @import("basic_shapes.zig");
const clipping_records = @import("clipping_records.zig");
const clipping_selection = @import("clipping_selection.zig");
const region_drawing = @import("region_drawing.zig");
const path_drawing = @import("path_drawing.zig");
const flood_fill = @import("flood_fill.zig");
const gradient_fill = @import("gradient_fill.zig");
const bit_block_transfer = @import("bit_block_transfer.zig");
const stretch_block_transfer = @import("stretch_block_transfer.zig");
const mask_block_transfer = @import("mask_block_transfer.zig");
const parallelogram_block_transfer = @import("parallelogram_block_transfer.zig");
const set_dibits_to_device = @import("set_dibits_to_device.zig");
const stretch_dibits = @import("stretch_dibits.zig");
const alpha_blend = @import("alpha_blend.zig");
const transparent_blt = @import("transparent_blt.zig");
const layout_mode = @import("layout_mode.zig");
const force_ufi_mapping = @import("force_ufi_mapping.zig");
const linked_ufis = @import("linked_ufis.zig");
const color_correct_palette = @import("color_correct_palette.zig");
const set_color_adjustment = @import("set_color_adjustment.zig");
const comment_record = @import("comment_record.zig");
const public_comment = @import("public_comment.zig");
const public_comment_group = @import("public_comment_group.zig");
const emf_plus_stream = @import("emf_plus_stream.zig");
const emf_plus_graphics_state_stack = @import("emf_plus_graphics_state_stack.zig");
const dc_stack = @import("dc_stack.zig");
const palette_records = @import("palette_records.zig");
const object_table = @import("object_table.zig");
const std = @import("std");
const eof = @import("eof.zig");
const eof_palette = @import("eof_palette.zig");

pub const CommentCounts = struct { private: usize = 0, emf_plus: usize = 0, emf_spool: usize = 0, public: usize = 0 };
pub const PublicCommentReport = struct {
    begin_groups: usize = 0,
    end_groups: usize = 0,
    max_group_depth: usize = 0,
    multi_formats: usize = 0,
    formats: usize = 0,
    enhanced_metafile_formats: usize = 0,
    encapsulated_postscript_formats: usize = 0,
    unknown_formats: usize = 0,
    windows_metafiles: usize = 0,
    wmf_records: usize = 0,
    unknown: usize = 0,
};

pub const Summary = struct { header: header.Header, header_payload: header_payload.Payload, eof: eof.Eof, palette: eof_palette.Palette, objects: object_table.Report, records: usize, pixel_format_records: usize, icm_mode_records: usize, clipping_records: usize, clipping_selection_records: usize, region_drawing_records: usize, path_drawing_records: usize, flood_fill_records: usize, gradient_fill_records: usize, bit_block_transfer_records: usize, stretch_block_transfer_records: usize, mask_block_transfer_records: usize, parallelogram_block_transfer_records: usize, set_dibits_to_device_records: usize, stretch_dibits_records: usize, alpha_blend_records: usize, transparent_blt_records: usize, force_ufi_mapping_records: usize, linked_ufi_records: usize, linked_ufis: usize, color_match_records: usize, palette_correction_records: usize, color_adjustment_records: usize, comment_records: usize, comments: CommentCounts, public_comments: PublicCommentReport, emf_plus: emf_plus_stream.Report };

fn validateStructure(a: std.mem.Allocator, bytes: []const u8) !Summary {
    var iterator: records.Iterator = .{ .bytes = bytes };
    var path_state: path_bracket.State = .{};
    var dc_state: dc_stack.State = .{};
    var public_group_state: public_comment_group.State = .{};
    var emf_plus_state: emf_plus_stream.State = .{};
    var emf_plus_graphics_stack = emf_plus_graphics_state_stack.Stack.init(a);
    defer emf_plus_graphics_stack.deinit();
    const first = (try iterator.next()) orelse return error.MissingEmfHeader;
    const parsed_header = try header_payload.parse(first, bytes.len);
    const value = parsed_header.header;
    const payload = parsed_header.payload;
    var count: usize = 1;
    var pixel_format_count: usize = 0;
    var icm_mode_count: usize = 0;
    var clipping_count: usize = 0;
    var clipping_selection_count: usize = 0;
    var region_drawing_count: usize = 0;
    var path_drawing_count: usize = 0;
    var flood_fill_count: usize = 0;
    var gradient_fill_count: usize = 0;
    var bit_block_transfer_count: usize = 0;
    var stretch_block_transfer_count: usize = 0;
    var mask_block_transfer_count: usize = 0;
    var parallelogram_block_transfer_count: usize = 0;
    var set_dibits_to_device_count: usize = 0;
    var stretch_dibits_count: usize = 0;
    var alpha_blend_count: usize = 0;
    var transparent_blt_count: usize = 0;
    var force_ufi_mapping_count: usize = 0;
    var linked_ufi_record_count: usize = 0;
    var linked_ufi_count: usize = 0;
    var color_match_count: usize = 0;
    var palette_correction_count: usize = 0;
    var color_adjustment_count: usize = 0;
    var comment_count: usize = 0;
    var comments: CommentCounts = .{};
    var public_comments: PublicCommentReport = .{};
    while (try iterator.next()) |record| {
        count += 1;
        if (record.kind == .header) return error.DuplicateEmfHeader;
        if (try pixel_format_record.parse(record) != null) pixel_format_count += 1;
        if (try icm_mode.parse(record) != null) icm_mode_count += 1;
        _ = try path_state.consume(record);
        _ = try transform_records.parse(record);
        _ = try point_records.parse(record);
        _ = try mode_records.parse(record);
        _ = try color_records.parse(record);
        _ = try mapper_flags.parse(record);
        _ = try miter_limit.parse(record);
        _ = try text_alignment.parse(record);
        _ = try text_justification.parse(record);
        if (try color_match_to_target.parse(record) != null) color_match_count += 1;
        _ = try scale_extents.parse(record);
        _ = try poly_records.parse(record);
        _ = try poly_records_16.parse(record);
        _ = try poly_draw.parse(record);
        _ = try basic_point_drawing.parse(record);
        _ = try basic_shapes.parse(record);
        if (try clipping_records.parse(record) != null) clipping_count += 1;
        if (try clipping_selection.parse(record) != null) clipping_selection_count += 1;
        if (try region_drawing.parse(record) != null) region_drawing_count += 1;
        if (try path_drawing.parse(record) != null) path_drawing_count += 1;
        if (try flood_fill.parse(record) != null) flood_fill_count += 1;
        if (try gradient_fill.parse(record) != null) gradient_fill_count += 1;
        if (try bit_block_transfer.parse(record) != null) bit_block_transfer_count += 1;
        if (try stretch_block_transfer.parse(record) != null) stretch_block_transfer_count += 1;
        if (try mask_block_transfer.parse(record) != null) mask_block_transfer_count += 1;
        if (try parallelogram_block_transfer.parse(record) != null) parallelogram_block_transfer_count += 1;
        if (try set_dibits_to_device.parse(record) != null) set_dibits_to_device_count += 1;
        if (try stretch_dibits.parse(record) != null) stretch_dibits_count += 1;
        if (try alpha_blend.parse(record) != null) alpha_blend_count += 1;
        if (try transparent_blt.parse(record) != null) transparent_blt_count += 1;
        _ = try layout_mode.parse(record);
        if (try force_ufi_mapping.parse(record) != null) force_ufi_mapping_count += 1;
        if (try linked_ufis.parse(record)) |linked| {
            linked_ufi_record_count += 1;
            linked_ufi_count = std.math.add(usize, linked_ufi_count, linked.count) catch return error.LimitExceeded;
        }
        if (try color_correct_palette.parse(record) != null) palette_correction_count += 1;
        if (try set_color_adjustment.parse(record) != null) color_adjustment_count += 1;
        if (try comment_record.parse(record)) |comment| {
            comment_count += 1;
            switch (comment.classification) {
                .private => comments.private += 1,
                .emf_plus => comments.emf_plus += 1,
                .emf_spool => comments.emf_spool += 1,
                .public => comments.public += 1,
            }
            if (try public_comment.parse(comment)) |parsed_public| switch (parsed_public) {
                .begin_group => {
                    try public_group_state.begin();
                },
                .end_group => {
                    try public_group_state.end();
                },
                .multi_formats => |formats| {
                    public_comments.multi_formats = std.math.add(usize, public_comments.multi_formats, 1) catch return error.LimitExceeded;
                    public_comments.formats = std.math.add(usize, public_comments.formats, formats.count_formats) catch return error.LimitExceeded;
                    public_comments.enhanced_metafile_formats = std.math.add(usize, public_comments.enhanced_metafile_formats, formats.enhanced_metafiles) catch return error.LimitExceeded;
                    public_comments.encapsulated_postscript_formats = std.math.add(usize, public_comments.encapsulated_postscript_formats, formats.encapsulated_postscript) catch return error.LimitExceeded;
                    public_comments.unknown_formats = std.math.add(usize, public_comments.unknown_formats, formats.unknown_formats) catch return error.LimitExceeded;
                },
                .windows_metafile => |metafile| {
                    public_comments.windows_metafiles = std.math.add(usize, public_comments.windows_metafiles, 1) catch return error.LimitExceeded;
                    public_comments.wmf_records = std.math.add(usize, public_comments.wmf_records, metafile.records.count) catch return error.LimitExceeded;
                },
                .unknown => public_comments.unknown = std.math.add(usize, public_comments.unknown, 1) catch return error.LimitExceeded,
            };
            _ = try emf_plus_state.consumeTracked(&emf_plus_graphics_stack, comment, count);
        }
        _ = try dc_state.consume(record);
        _ = try palette_records.parse(record);
        if (record.kind != .eof) continue;
        const terminal_and_palette = try eof_palette.parse(record);
        const terminal = terminal_and_palette.eof;
        try path_state.finish();
        try public_group_state.finish();
        try emf_plus_state.finishTracked(emf_plus_graphics_stack);
        public_comments.begin_groups = public_group_state.begin_groups;
        public_comments.end_groups = public_group_state.end_groups;
        public_comments.max_group_depth = public_group_state.max_depth;
        if (terminal.palette_entries != value.palette_entries) return error.InvalidEmfPaletteCount;
        const palette = terminal_and_palette.palette;
        if (iterator.offset != bytes.len) return error.DataAfterEmfEof;
        if (count != value.records) return error.InvalidEmfDeclaredRecords;
        return .{ .header = value, .header_payload = payload, .eof = terminal, .palette = palette, .objects = .{}, .records = count, .pixel_format_records = pixel_format_count, .icm_mode_records = icm_mode_count, .clipping_records = clipping_count, .clipping_selection_records = clipping_selection_count, .region_drawing_records = region_drawing_count, .path_drawing_records = path_drawing_count, .flood_fill_records = flood_fill_count, .gradient_fill_records = gradient_fill_count, .bit_block_transfer_records = bit_block_transfer_count, .stretch_block_transfer_records = stretch_block_transfer_count, .mask_block_transfer_records = mask_block_transfer_count, .parallelogram_block_transfer_records = parallelogram_block_transfer_count, .set_dibits_to_device_records = set_dibits_to_device_count, .stretch_dibits_records = stretch_dibits_count, .alpha_blend_records = alpha_blend_count, .transparent_blt_records = transparent_blt_count, .force_ufi_mapping_records = force_ufi_mapping_count, .linked_ufi_records = linked_ufi_record_count, .linked_ufis = linked_ufi_count, .color_match_records = color_match_count, .palette_correction_records = palette_correction_count, .color_adjustment_records = color_adjustment_count, .comment_records = comment_count, .comments = comments, .public_comments = public_comments, .emf_plus = emf_plus_state.report };
    }
    return error.MissingEmfEof;
}

pub fn validate(a: std.mem.Allocator, bytes: []const u8) !Summary {
    var summary = try validateStructure(a, bytes);
    summary.objects = try object_table.validate(a, bytes, summary.header);
    return summary;
}
