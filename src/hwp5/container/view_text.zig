const std = @import("std");
const File = @import("../../cfb/reader.zig").File;
const Header = @import("../file_header.zig").Header;
const sections = @import("sections.zig");
const framing = @import("../record.zig");
pub const Report = struct {
    declared: bool,
    present: bool = false,
    sections: usize = 0,
    records: usize = 0,
    decoded_bytes: usize = 0,
    /// Every payload remains semantically unvalidated; framing is not field support.
    deferred_records: usize = 0,
};
pub fn inspect(a: std.mem.Allocator, file: *const File, header: *const Header, used: []bool, remaining_bytes: *usize, remaining_records: usize, expected_sections: usize, options: @import("../document/types.zig").Options) !Report {
    var report: Report = .{ .declared = header.has(.track_changes) };
    const root = try file.findExact("/ViewText") orelse {
        if (report.declared) return error.MissingViewText;
        return report;
    };
    if (file.entries[root].kind != 1) return error.InvalidHwpEntryKind;
    report.present = true;
    const decoded = try sections.decodeAt(a, file, root, header, used, remaining_bytes, options.max_sections);
    defer sections.deinit(a, decoded);
    if (decoded.len != expected_sections) return error.SectionCountMismatch;
    const order = try @import("../document/section_order.zig").build(a, decoded);
    defer a.free(order);
    for (order) |i| {
        const bytes = decoded[i].bytes;
        if (bytes.len == 0) return error.EmptyViewTextSection;
        var local = options.framing;
        local.max_records = @min(local.max_records, remaining_records - report.records);
        var it = framing.Iterator.init(bytes, local);
        while (try it.next()) |_| report.records += 1;
        report.decoded_bytes += bytes.len;
    }
    report.sections = decoded.len;
    report.deferred_records = report.records;
    return report;
}
