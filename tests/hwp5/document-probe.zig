//! Test-only decoded-document framing, not a product ABI.
const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
fn fields(a: std.mem.Allocator, out: *std.ArrayList(u8), value: anytype) !void {
    inline for (std.meta.fields(@TypeOf(value))) |f| try int(a, out, u32, @intCast(@field(value, f.name)));
}
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
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
        .list_layout = .observed8,
        .zone_layout = .observed_row_first,
        .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty },
        .max_total_bytes = max_bytes,
        .max_sections = max_sections,
        .max_total_records = limit,
        .framing = .{ .max_records = limit },
    });
    defer report.deinit(a);
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
    }
    return out.toOwnedSlice(a);
}
