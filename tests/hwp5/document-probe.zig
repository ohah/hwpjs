//! Test-only decoded-document framing, not a product ABI.
const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub const Selection = struct {
    forbidden_report: bool = false,
    forbidden_layout: @FieldType(core.hwp5.document_validation.Options, "forbidden_chars") = .preserve_raw,
    memo_report: bool = false,
    memo_end_report: bool = false,
    memo_range_report: bool = false,
    picture: core.hwp5.picture_validation.Options = .{},
    style: ?core.hwp5.document_validation.types.DrawingStyleOptions = null,
    arc: ?core.hwp5.shape_arc.Layout = null,
    polygon: core.hwp5.shape_polygon.Layout = .observed_i32_points,
    curve: core.hwp5.shape_curve.Layout = .observed_i32_points,
};
pub fn fields(a: std.mem.Allocator, out: *std.ArrayList(u8), value: anytype) !void {
    inline for (std.meta.fields(@TypeOf(value))) |f| try int(a, out, u32, @intCast(@field(value, f.name)));
}
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return configured(a, bytes, limit, .{});
}
pub fn forbidden(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const layout = try readForbidden(&r);
    return configured(a, bytes[r.offset..], limit, .{ .forbidden_report = true, .forbidden_layout = layout });
}
pub fn readForbidden(r: *core.Reader) !@FieldType(Selection, "forbidden_layout") {
    const mode = try r.readInt(u8);
    if (mode > 1) return error.InvalidMode;
    return @enumFromInt(mode);
}
pub fn memo(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return configured(a, bytes, limit, .{ .memo_report = true });
}
pub fn memoEnd(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return configured(a, bytes, limit, .{ .memo_end_report = true });
}
pub fn memoRange(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return configured(a, bytes, limit, .{ .memo_range_report = true });
}
pub fn styled(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const style = try readStyle(&r);
    return configured(a, bytes[r.offset..], limit, .{ .style = style });
}
pub fn readArc(r: *core.Reader) !?core.hwp5.shape_arc.Layout {
    const mode = try r.readInt(u8);
    if (mode > 2) return error.InvalidMode;
    return if (mode == 2) null else @enumFromInt(mode);
}
pub fn arced(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const arc = try readArc(&r);
    return configured(a, bytes[r.offset..], limit, .{ .arc = arc });
}
pub fn readCounted(r: *core.Reader) !core.hwp5.shape_polygon.Layout {
    const mode = try r.readInt(u8);
    if (mode > 1) return error.InvalidMode;
    return @enumFromInt(mode);
}
pub fn readPicture(r: *core.Reader) !core.hwp5.picture_validation.Options {
    const mode = try r.readInt(u8);
    if (mode > 11) return error.InvalidMode;
    const stage = mode % 6;
    return .{
        .layout = if (mode < 6) .interleaved else .separate_axes,
        .prefix = if (stage < 3) @enumFromInt(stage) else .with_instance78,
        .tail = if (stage < 3) null else .{ .additional = if (stage == 3) null else @enumFromInt(stage - 4) },
    };
}
pub fn pictured(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const picture = try readPicture(&r);
    return configured(a, bytes[r.offset..], limit, .{ .picture = picture });
}
pub fn polygoned(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const polygon = try readCounted(&r);
    return configured(a, bytes[r.offset..], limit, .{ .polygon = polygon });
}
pub fn curved(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const layout = try readCounted(&r);
    return configured(a, bytes[r.offset..], limit, .{ .curve = layout });
}
pub fn readStyle(r: *core.Reader) !core.hwp5.document_validation.types.DrawingStyleOptions {
    const mode = try r.readInt(u8);
    if (mode > 5) return error.InvalidMode;
    return .{ .border = @enumFromInt(mode & 1), .tail = if (mode >= 4) .alpha_shadow_metadata else if (mode & 2 != 0) .fill_only else .alpha_shadow };
}
fn configured(a: std.mem.Allocator, bytes: []const u8, limit: usize, selection: Selection) ![]u8 {
    const d = core.hwp5.document_validation;
    var r: core.Reader = .{ .bytes = bytes };
    const max_bytes = try r.readInt(u32);
    const max_sections = try r.readInt(u16);
    const header = try r.take(256);
    const doc = try r.take(try r.readInt(u32));
    const count = try r.readInt(u16);
    if (count > max_sections) return error.LimitExceeded;
    if (count > (bytes.len - r.offset) / 6) return error.UnexpectedEnd;
    const sections = try a.alloc(d.types.Section, count);
    defer a.free(sections);
    for (sections) |*s| {
        s.index = try r.readInt(u16);
        s.bytes = try r.take(try r.readInt(u32));
    }
    if (r.offset != bytes.len) return error.TrailingDocumentInput;
    var report = try d.inspectDecoded(a, .{ .header = header, .doc_info = doc, .sections = sections }, .{
        .forbidden_chars = selection.forbidden_layout,
        .drawing_style = selection.style,
        .arc_layout = selection.arc,
        .polygon_layout = selection.polygon,
        .curve_layout = selection.curve,
        .picture = selection.picture,
        .list_layout = .observed8,
        .zone_layout = .observed_row_first,
        .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty },
        .max_total_bytes = max_bytes,
        .max_sections = max_sections,
        .max_total_records = limit,
        .framing = .{ .max_records = limit },
    });
    defer report.deinit(a);
    if (selection.forbidden_report) {
        var out: std.ArrayList(u8) = .empty;
        errdefer out.deinit(a);
        try fields(a, &out, report.doc_info.forbidden_chars);
        return out.toOwnedSlice(a);
    }
    if (selection.memo_report or selection.memo_end_report or selection.memo_range_report) {
        var out: std.ArrayList(u8) = .empty;
        errdefer out.deinit(a);
        if (selection.memo_range_report) try fields(a, &out, report.memo_ranges) else if (selection.memo_end_report) try fields(a, &out, report.memo_end_references) else try fields(a, &out, report.memo_references);
        return out.toOwnedSlice(a);
    }
    return serialize(a, report);
}
pub fn serialize(a: std.mem.Allocator, report: core.hwp5.document_validation.Report) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    const info = report.doc_info;
    for ([_]usize{ report.header.version().raw, report.header.flags(), report.sections.len, report.total_bytes, report.total_records, info.records, info.properties.section_count, info.resources.bin_data_count, info.resources.face_name_count }) |n| try int(a, &out, u32, @intCast(n));
    for (info.resources.counts) |n| try int(a, &out, u32, @intCast(n));
    inline for (.{ "checked", "invalid", "deferred", "unknown_records" }) |name| try int(a, &out, u32, @intCast(@field(info.references, name)));
    try fields(a, &out, info.parameters);
    for (report.sections) |s| {
        try int(a, &out, u32, @intCast(s.records));
        try fields(a, &out, s.paragraphs);
        try fields(a, &out, s.definition);
        try fields(a, &out, s.control_types);
        try fields(a, &out, s.lists);
        try fields(a, &out, s.tables);
        try fields(a, &out, s.parameters);
        try int(a, &out, u32, @intCast(s.object_properties));
        try fields(a, &out, s.header_footer);
        try fields(a, &out, s.number_controls);
        try fields(a, &out, s.page_number);
        try fields(a, &out, s.index_marks);
        try fields(a, &out, s.page_visibility);
        try fields(a, &out, s.bookmarks);
        try fields(a, &out, s.char_overlap);
        try int(a, &out, u32, @intCast(s.observed_field_links));
        try fields(a, &out, s.fields);
        try fields(a, &out, s.ruby);
        try fields(a, &out, s.hidden_comments);
        try fields(a, &out, s.notes);
        try fields(a, &out, s.equations);
        try fields(a, &out, s.ole);
        try fields(a, &out, s.shapes);
        try fields(a, &out, s.drawing_styles);
        try fields(a, &out, s.lines);
        try fields(a, &out, s.rectangles);
        try fields(a, &out, s.ellipses);
        try fields(a, &out, s.arcs);
        try fields(a, &out, s.polygons);
        try fields(a, &out, s.curves);
        try fields(a, &out, s.pictures);
        try fields(a, &out, s.shape_groups);
    }
    return out.toOwnedSlice(a);
}
