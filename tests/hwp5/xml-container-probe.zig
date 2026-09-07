const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn read(r: *core.Reader) !@import("document-probe.zig").Selection {
    var selection: @import("document-probe.zig").Selection = .{ .xml_report = true };
    const enabled = try r.readInt(u8);
    if (enabled > 1) return error.InvalidMode;
    var options: @typeInfo(@FieldType(core.hwp5.container_validation.Options, "xml")).optional.child = .{};
    options.max_documents = try r.readInt(u32);
    options.document.prolog.input.max_bytes = try r.readInt(u32);
    options.document.prolog.input.max_characters = try r.readInt(u32);
    options.document.max_elements = try r.readInt(u32);
    options.document.max_events = try r.readInt(u32);
    options.document.max_attributes = try r.readInt(u32);
    options.document.max_references = try r.readInt(u32);
    selection.xml = if (enabled == 1) options else null;
    selection.xml_template = try @import("xml-template-container-probe.zig").read(r);
    selection.history = try @import("history-container-probe.zig").read(r);
    const last = try r.readInt(u8);
    if (last > 1) return error.InvalidMode;
    if (selection.history) |*history| history.last_document = if (last == 1) .observed_record else .uninspected;
    return selection;
}
pub fn serialize(a: std.mem.Allocator, report: core.hwp5.container_validation.Report) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, @intFromBool(report.xml != null));
    if (report.xml) |r| {
        for ([_]usize{ r.documents, r.schema, r.instance, r.diff, r.last_document }) |n| try int(a, &out, u32, @intCast(n));
        try @import("xml-report-probe.zig").append(a, &out, r.totals);
    }
    try int(a, &out, u32, @intCast(report.total_decoded_bytes));
    try int(a, &out, u32, @intCast(report.uninspected_streams));
    return out.toOwnedSlice(a);
}
