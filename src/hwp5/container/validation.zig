const std = @import("std");
const cfb = @import("../../cfb/reader.zig");
const d = @import("../document/validation.zig");
const paths = @import("paths.zig");
const sections = @import("sections.zig");
const binaries = @import("binaries.zig");
pub const Options = struct {
    document: d.Options,
    cfb: @import("../../cfb/types.zig").Options = .{ .strict = true },
    max_summary_properties: usize = 4096,
};
/// Owns DocInfo backing bytes and the document report. Does NOT own the input CFB.
/// Decoded binary bytes are checked for compression integrity, not image/OLE semantics.
pub const Report = struct {
    document: d.Report,
    binary_data: binaries.Report,
    preview_text: ?@import("../preview/text.zig").Stats,
    summary_information: ?@import("../summary/parser.zig").Stats,
    total_decoded_bytes: usize,
    uninspected_streams: usize,
    doc_info_backing: []const u8,
    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        self.document.deinit(a);
        a.free(self.doc_info_backing);
        self.* = undefined;
    }
};
pub fn inspect(a: std.mem.Allocator, bytes: []const u8, options: Options) !Report {
    try options.document.validate();
    var cfb_options = options.cfb;
    cfb_options.strict = true; // Hierarchical exact lookup needs a valid CFB directory.
    var file = try cfb.File.open(a, bytes, cfb_options);
    defer file.deinit();
    const used = try a.alloc(bool, file.entries.len);
    defer a.free(used);
    @memset(used, false);
    const hi = try paths.required(&file, "/FileHeader", 2);
    const header = try d.types.Header.parse(file.entries[hi].content);
    try @import("../stream.zig").requireSupported(&header);
    used[hi] = true;
    var remaining = options.document.max_total_bytes;
    if (remaining < header.raw.len) return error.LimitExceeded;
    remaining -= header.raw.len;
    const di = try paths.required(&file, "/DocInfo", 2);
    const doc = try @import("../stream.zig").decode(a, &header, file.entries[di].content, remaining);
    errdefer a.free(doc);
    remaining -= doc.len;
    used[di] = true;
    const body = try sections.decode(a, &file, &header, used, &remaining, options.document.max_sections);
    defer sections.deinit(a, body);
    var report = try d.inspectDecoded(a, .{ .header = &header.raw, .doc_info = doc, .sections = body }, options.document);
    errdefer report.deinit(a);
    const bins = try binaries.inspect(a, &file, &header, doc, options.document.framing, used, &remaining);
    const preview = try @import("preview.zig").inspect(&file, used, &remaining);
    const summary = try @import("summary.zig").inspect(a, &file, used, &remaining, options.max_summary_properties);
    var uninspected: usize = 0;
    for (file.entries, used) |entry, consumed| if (entry.kind == 2 and !consumed) {
        uninspected += 1;
    };
    return .{ .document = report, .binary_data = bins, .preview_text = preview, .summary_information = summary, .total_decoded_bytes = options.document.max_total_bytes - remaining, .uninspected_streams = uninspected, .doc_info_backing = doc };
}
