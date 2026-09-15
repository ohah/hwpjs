const records = @import("records.zig");
const header = @import("header.zig");
const header_payload = @import("header_payload.zig");
const path_bracket = @import("path_bracket.zig");
const transform_records = @import("transform_records.zig");
const point_records = @import("point_records.zig");
const mode_records = @import("mode_records.zig");
const color_records = @import("color_records.zig");
const mapper_flags = @import("mapper_flags.zig");
const miter_limit = @import("miter_limit.zig");
const text_alignment = @import("text_alignment.zig");
const text_justification = @import("text_justification.zig");
const scale_extents = @import("scale_extents.zig");
const poly_records = @import("poly_records.zig");
const poly_records_16 = @import("poly_records_16.zig");
const poly_draw = @import("poly_draw.zig");
const basic_point_drawing = @import("basic_point_drawing.zig");
const basic_shapes = @import("basic_shapes.zig");
const clipping_records = @import("clipping_records.zig");
const clipping_selection = @import("clipping_selection.zig");
const region_drawing = @import("region_drawing.zig");
const dc_stack = @import("dc_stack.zig");
const palette_records = @import("palette_records.zig");
const object_table = @import("object_table.zig");
const std = @import("std");
const eof = @import("eof.zig");
const eof_palette = @import("eof_palette.zig");

pub const Summary = struct { header: header.Header, header_payload: header_payload.Payload, eof: eof.Eof, palette: eof_palette.Palette, objects: object_table.Report, records: usize, clipping_records: usize, clipping_selection_records: usize, region_drawing_records: usize };

fn validateStructure(bytes: []const u8) !Summary {
    var iterator: records.Iterator = .{ .bytes = bytes };
    var path_state: path_bracket.State = .{};
    var dc_state: dc_stack.State = .{};
    const first = (try iterator.next()) orelse return error.MissingEmfHeader;
    const parsed_header = try header_payload.parse(first, bytes.len);
    const value = parsed_header.header;
    const payload = parsed_header.payload;
    var count: usize = 1;
    var clipping_count: usize = 0;
    var clipping_selection_count: usize = 0;
    var region_drawing_count: usize = 0;
    while (try iterator.next()) |record| {
        count += 1;
        if (record.kind == .header) return error.DuplicateEmfHeader;
        _ = try path_state.consume(record);
        _ = try transform_records.parse(record);
        _ = try point_records.parse(record);
        _ = try mode_records.parse(record);
        _ = try color_records.parse(record);
        _ = try mapper_flags.parse(record);
        _ = try miter_limit.parse(record);
        _ = try text_alignment.parse(record);
        _ = try text_justification.parse(record);
        _ = try scale_extents.parse(record);
        _ = try poly_records.parse(record);
        _ = try poly_records_16.parse(record);
        _ = try poly_draw.parse(record);
        _ = try basic_point_drawing.parse(record);
        _ = try basic_shapes.parse(record);
        if (try clipping_records.parse(record) != null) clipping_count += 1;
        if (try clipping_selection.parse(record) != null) clipping_selection_count += 1;
        if (try region_drawing.parse(record) != null) region_drawing_count += 1;
        _ = try dc_state.consume(record);
        _ = try palette_records.parse(record);
        if (record.kind != .eof) continue;
        const terminal_and_palette = try eof_palette.parse(record);
        const terminal = terminal_and_palette.eof;
        try path_state.finish();
        if (terminal.palette_entries != value.palette_entries) return error.InvalidEmfPaletteCount;
        const palette = terminal_and_palette.palette;
        if (iterator.offset != bytes.len) return error.DataAfterEmfEof;
        if (count != value.records) return error.InvalidEmfDeclaredRecords;
        return .{ .header = value, .header_payload = payload, .eof = terminal, .palette = palette, .objects = .{}, .records = count, .clipping_records = clipping_count, .clipping_selection_records = clipping_selection_count, .region_drawing_records = region_drawing_count };
    }
    return error.MissingEmfEof;
}

pub fn validate(a: std.mem.Allocator, bytes: []const u8) !Summary {
    var summary = try validateStructure(bytes);
    summary.objects = try object_table.validate(a, bytes, summary.header);
    return summary;
}
