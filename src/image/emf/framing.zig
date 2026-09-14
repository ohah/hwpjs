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
const dc_stack = @import("dc_stack.zig");
const palette_records = @import("palette_records.zig");
const object_table = @import("object_table.zig");
const std = @import("std");
const eof = @import("eof.zig");
const eof_palette = @import("eof_palette.zig");

pub const Summary = struct { header: header.Header, header_payload: header_payload.Payload, eof: eof.Eof, palette: eof_palette.Palette, objects: object_table.Report, records: usize };

fn validateStructure(bytes: []const u8) !Summary {
    var iterator: records.Iterator = .{ .bytes = bytes };
    var path_state: path_bracket.State = .{};
    var dc_state: dc_stack.State = .{};
    const first = (try iterator.next()) orelse return error.MissingEmfHeader;
    const value = try header.parse(first, bytes.len);
    const payload = try header_payload.parse(first, value);
    var count: usize = 1;
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
        _ = try dc_state.consume(record);
        _ = try palette_records.parse(record);
        if (record.kind != .eof) continue;
        const terminal = try eof.parse(record);
        try path_state.finish();
        if (terminal.palette_entries != value.palette_entries) return error.InvalidEmfPaletteCount;
        const palette = try eof_palette.parse(record, terminal);
        if (iterator.offset != bytes.len) return error.DataAfterEmfEof;
        if (count != value.records) return error.InvalidEmfDeclaredRecords;
        return .{ .header = value, .header_payload = payload, .eof = terminal, .palette = palette, .objects = .{}, .records = count };
    }
    return error.MissingEmfEof;
}

pub fn validate(a: std.mem.Allocator, bytes: []const u8) !Summary {
    var summary = try validateStructure(bytes);
    summary.objects = try object_table.validate(a, bytes, summary.header);
    return summary;
}
