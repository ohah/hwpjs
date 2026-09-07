const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
const Options = @FieldType(core.hwp5.container_validation.Options, "history");
pub fn read(r: *core.Reader) !Options {
    const mode = try r.readInt(u8);
    const start = try r.readInt(u8);
    const date = try r.readInt(u8);
    if (mode > 2 or start > 1 or date > 1) return error.InvalidMode;
    const items = try r.readInt(u32);
    const bytes = try r.readInt(u32);
    const records = try r.readInt(u32);
    const payload = try r.readInt(u32);
    return if (mode == 0) null else .{
        .encoding = if (mode == 1) .decoded else .observed_hwp_compressed,
        .max_items = items,
        .max_decoded_bytes = bytes,
        .item = .{ .start_layout = if (start == 0) .spec_flag_first else .observed_option_first, .date_layout = if (date == 0) .preserve_raw else .observed_systemtime16, .framing = .{ .max_records = records, .max_payload_bytes = payload } },
    };
}
pub fn serialize(a: std.mem.Allocator, out: *std.ArrayList(u8), report: @FieldType(core.hwp5.container_validation.Report, "history")) !void {
    try int(a, out, u32, @intFromBool(report != null));
    const h = report orelse return;
    for ([_]usize{ @intFromBool(h.present), @intFromBool(h.declared), @intFromBool(h.last_doc_present), h.last_doc_encoded_bytes, h.decoded_bytes, h.records, h.entries.len }) |n| try int(a, out, u32, @intCast(n));
    for (h.entries) |entry| {
        for ([_]usize{ entry.index, entry.flags, entry.option, entry.decoded_bytes }) |n| try int(a, out, u32, @intCast(n));
        try @import("document-probe.zig").fields(a, out, entry.report);
    }
}
