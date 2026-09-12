const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return inspect(a, bytes, limit, false, .{});
}
pub fn images(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const selection = try @import("container-images-probe.zig").read(&r);
    return inspect(a, bytes[r.offset..], limit, false, selection);
}
pub fn jpegImages(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const selection = try @import("container-jpeg-probe.zig").read(&r);
    return inspect(a, bytes[r.offset..], limit, false, selection);
}
pub fn bmpImages(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const selection = try @import("container-bmp-probe.zig").read(&r);
    return inspect(a, bytes[r.offset..], limit, false, selection);
}
pub fn bmpRle(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const selection = try @import("container-bmp-rle-probe.zig").read(&r);
    return inspect(a, bytes[r.offset..], limit, false, selection);
}
pub fn bmpProfile(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const selection = try @import("container-bmp-profile-probe.zig").read(&r);
    return inspect(a, bytes[r.offset..], limit, false, selection);
}
pub fn xmlDocuments(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const selection = try @import("xml-container-probe.zig").read(&r);
    return inspect(a, bytes[r.offset..], limit, false, selection);
}
pub fn history(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const selected = try @import("history-container-probe.zig").read(&r);
    return inspect(a, bytes[r.offset..], limit, false, .{ .history = selected, .history_report = true });
}
pub fn historyLastDocument(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const last = try r.readInt(u8);
    if (last > 1) return error.InvalidMode;
    var selected = try @import("history-container-probe.zig").read(&r);
    if (selected) |*h| h.last_document = if (last == 0) .uninspected else .observed_record;
    return inspect(a, bytes[r.offset..], limit, false, .{ .history = selected, .history_report = true, .history_last_document_report = true });
}
pub fn xmlTemplate(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const selected = try @import("xml-template-container-probe.zig").read(&r);
    return inspect(a, bytes[r.offset..], limit, false, .{ .xml_template = selected, .xml_template_report = true });
}
pub fn formed(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const forms = try @import("form-selection.zig").read(&r);
    return inspect(a, bytes[r.offset..], limit, false, .{ .forms = forms });
}
pub fn viewText(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return inspect(a, bytes, limit, false, .{ .view_text_report = true });
}
pub fn forbidden(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const layout = try @import("document-probe.zig").readForbidden(&r);
    return inspect(a, bytes[r.offset..], limit, false, .{ .forbidden_report = true, .forbidden_layout = layout });
}
pub fn pictured(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const picture = try @import("document-probe.zig").readPicture(&r);
    return inspect(a, bytes[r.offset..], limit, false, .{ .picture = picture });
}
pub fn specifiedStorage(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return inspect(a, bytes, limit, true, .{});
}
pub fn styled(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const style = try @import("document-probe.zig").readStyle(&r);
    return inspect(a, bytes[r.offset..], limit, false, .{ .style = style });
}
pub fn arced(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const arc = try @import("document-probe.zig").readArc(&r);
    return inspect(a, bytes[r.offset..], limit, false, .{ .arc = arc });
}
pub fn polygoned(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const polygon = try @import("document-probe.zig").readCounted(&r);
    return inspect(a, bytes[r.offset..], limit, false, .{ .polygon = polygon });
}
pub fn curved(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const layout = try @import("document-probe.zig").readCounted(&r);
    return inspect(a, bytes[r.offset..], limit, false, .{ .curve = layout });
}
pub fn inspect(a: std.mem.Allocator, bytes: []const u8, limit: usize, specified: bool, selection: @import("document-probe.zig").Selection) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const max_bytes = try r.readInt(u32);
    var report = try core.hwp5.container_validation.inspect(a, bytes[r.offset..], .{ .view_text_semantics = selection.view_text_semantics, .preview_image = selection.preview_image, .images = selection.images, .xml = selection.xml, .xml_template = selection.xml_template, .history = selection.history, .storage_layout = if (specified) .specified else .observed_optional_extension, .document = .{
        .forms = selection.forms,
        .distribution = selection.distribution,
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
        .max_total_records = limit,
    } });
    defer report.deinit(a);
    if (selection.view_text_semantic_report) return @import("view-semantic-probe.zig").serialize(a, report);
    if (selection.xml_report) return @import("xml-container-probe.zig").serialize(a, report);
    if (selection.view_text_report) {
        var out: std.ArrayList(u8) = .empty;
        errdefer out.deinit(a);
        const v = report.view_text;
        for ([_]usize{ @intFromBool(v.declared), @intFromBool(v.present), v.sections, v.records, v.decoded_bytes, v.deferred_records }) |n| try int(a, &out, u32, @intCast(n));
        return out.toOwnedSlice(a);
    }
    if (selection.forbidden_report) {
        var out: std.ArrayList(u8) = .empty;
        errdefer out.deinit(a);
        try @import("document-probe.zig").fields(a, &out, report.document.doc_info.forbidden_chars);
        return out.toOwnedSlice(a);
    }
    const doc = try @import("document-probe.zig").serialize(a, report.document);
    defer a.free(doc);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try out.appendSlice(a, doc);
    const scripts = report.scripts;
    try int(a, &out, u32, @intFromBool(scripts.version != null));
    try int(a, &out, u32, if (scripts.version) |v| v.high else 0);
    try int(a, &out, u32, if (scripts.version) |v| v.low else 0);
    try int(a, &out, u32, @intFromBool(scripts.source_units != null));
    for (scripts.source_units orelse .{ 0, 0, 0, 0 }) |n| try int(a, &out, u32, @intCast(n));
    try int(a, &out, u32, @intCast(scripts.decoded_bytes));
    try int(a, &out, u32, @intCast(scripts.trailing_bytes));
    try int(a, &out, u32, @intFromBool(report.summary_information != null));
    const summary = report.summary_information orelse core.hwp5.summary_information.Stats{};
    inline for (std.meta.fields(@TypeOf(summary))) |f| try int(a, &out, u32, @intCast(@field(summary, f.name)));
    try int(a, &out, u32, @intFromBool(report.preview_text != null));
    const preview = report.preview_text orelse core.hwp5.preview_text.Stats{};
    inline for (std.meta.fields(@TypeOf(preview))) |f| try int(a, &out, u32, @intCast(@field(preview, f.name)));
    inline for (std.meta.fields(@TypeOf(report.binary_data))) |f| try int(a, &out, u32, @intCast(@field(report.binary_data, f.name)));
    try int(a, &out, u32, @intCast(report.total_decoded_bytes));
    try int(a, &out, u32, @intCast(report.uninspected_streams));
    if (selection.history_report) try @import("history-container-probe.zig").serialize(a, &out, report.history);
    if (selection.history_last_document_report) try @import("history-last-document-probe.zig").serialize(a, &out, report.history);
    if (selection.xml_template_report) try @import("xml-template-container-probe.zig").serialize(a, &out, report.xml_template);
    if (selection.images_report) try @import("container-images-probe.zig").serialize(a, &out, report.images);
    if (selection.jpeg_images_report) try @import("container-jpeg-probe.zig").serialize(a, &out, report.images, selection.images != null and selection.images.?.jpeg != null);
    if (selection.bmp_images_report) try @import("container-bmp-probe.zig").serialize(a, &out, report.images, selection.images != null and selection.images.?.bmp != null);
    if (selection.bmp_rle_report) try @import("container-bmp-rle-probe.zig").serialize(a, &out, report.images, selection.images != null and selection.images.?.bmp != null and selection.images.?.bmp.?.rle != null);
    if (selection.bmp_profile_report) try @import("container-bmp-profile-probe.zig").serialize(a, &out, report.images, selection.images != null and selection.images.?.bmp_profile != null);
    if (selection.preview_image_report) try @import("preview-image-probe.zig").serialize(a, &out, report.preview_image, selection.preview_image);
    if (selection.primary_source_report) try int(a, &out, u32, @intFromEnum(report.primary_source));
    return out.toOwnedSlice(a);
}
