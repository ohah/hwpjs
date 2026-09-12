const std = @import("std");
const File = @import("../../cfb/reader.zig").File;
const Header = @import("../file_header.zig").Header;
const sections = @import("sections.zig");
const framing = @import("../record.zig");
const section_set = @import("../document/section_set.zig");
pub const SemanticPolicy = enum { uninspected, strict_document_rules };
pub const SemanticContext = struct {
    resources: @import("../docinfo/resources.zig").Report,
    body_sections: []const @import("../document/types.zig").SectionReport,
};
pub const Detailed = struct {
    framing: Report,
    semantics: ?section_set.Report = null,
    pub fn deinit(self: *Detailed, a: std.mem.Allocator) void {
        if (self.semantics) |*report| report.deinit(a);
        self.* = undefined;
    }
};
pub const Report = struct {
    declared: bool,
    present: bool = false,
    sections: usize = 0,
    records: usize = 0,
    decoded_bytes: usize = 0,
    /// This framing-only report never claims payload support; see the separate semantic report.
    deferred_records: usize = 0,
};
pub fn inspect(a: std.mem.Allocator, file: *const File, header: *const Header, used: []bool, remaining_bytes: *usize, remaining_records: usize, expected_sections: usize, options: @import("../document/types.zig").Options, max_ciphertext: usize) !Report {
    return (try inspectDetailed(a, file, header, used, remaining_bytes, remaining_records, expected_sections, options, max_ciphertext, null)).framing;
}
pub fn inspectDetailed(a: std.mem.Allocator, file: *const File, header: *const Header, used: []bool, remaining_bytes: *usize, remaining_records: usize, expected_sections: usize, options: @import("../document/types.zig").Options, max_ciphertext: usize, semantic_context: ?SemanticContext) !Detailed {
    var report: Report = .{ .declared = header.has(.track_changes) };
    const root = try file.findExact("/ViewText") orelse {
        if (report.declared) return error.MissingViewText;
        return .{ .framing = report };
    };
    if (file.entries[root].kind != 1) return error.InvalidHwpEntryKind;
    report.present = true;
    const decoded = try sections.decodeAt(a, file, root, header, used, remaining_bytes, options.max_sections, max_ciphertext);
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
    var semantics: ?section_set.Report = null;
    if (semantic_context) |context| {
        var local = options;
        for (context.body_sections) |body| try @import("../document/form_budget.zig").consume(&local.forms, body.forms);
        semantics = try section_set.inspect(a, decoded, header.version(), context.resources, local, remaining_records);
    }
    return .{ .framing = report, .semantics = semantics };
}
