//! Primary stream selection, not document semantics or alternate-view inspection.
const std = @import("std");
const types = @import("../document/types.zig");
const sections = @import("sections.zig");
pub const Source = enum { body_text, distribution_viewtext };
pub const Decoded = struct {
    source: Source,
    sections: []types.Section,
    pub fn deinit(self: *Decoded, a: std.mem.Allocator) void {
        sections.deinit(a, self.sections);
        self.* = undefined;
    }
    /// Framing evidence from the already validated primary document; never charged twice.
    pub fn viewReport(self: Decoded, header: *const types.Header, document: types.Report) @import("view_text.zig").Detailed {
        std.debug.assert(self.source == .distribution_viewtext);
        var bytes: usize = 0;
        for (self.sections) |s| bytes += s.bytes.len;
        const records = document.total_records - document.doc_info.records;
        return .{ .framing = .{ .declared = header.has(.track_changes), .present = true, .sections = self.sections.len, .records = records, .decoded_bytes = bytes, .deferred_records = records } };
    }
};
pub fn decode(a: std.mem.Allocator, file: *const @import("../../cfb/reader.zig").File, header: *const types.Header, used: []bool, remaining: *usize, options: types.Options, max_ciphertext: usize) !Decoded {
    try @import("../feature_policy.zig").requireSupported(header, options.distribution);
    if (!header.has(.distribution)) return .{ .source = .body_text, .sections = try sections.decode(a, file, header, used, remaining, options.max_sections) };
    const root = try file.findExact("/ViewText") orelse return error.MissingViewText;
    if (file.entries[root].kind != 1) return error.InvalidHwpEntryKind;
    const decoded = try sections.decodeAtWithPolicy(a, file, root, header, used, remaining, options.max_sections, max_ciphertext, options.distribution);
    errdefer sections.deinit(a, decoded);
    for (decoded) |s| if (s.bytes.len == 0) return error.EmptyViewTextSection;
    return .{ .source = .distribution_viewtext, .sections = decoded };
}
