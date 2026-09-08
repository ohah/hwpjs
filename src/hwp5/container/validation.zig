const std = @import("std");
const cfb = @import("../../cfb/reader.zig");
const d = @import("../document/validation.zig");
const paths = @import("paths.zig");
const sections = @import("sections.zig");
const binaries = @import("binaries.zig");
pub const Options = struct {
    images: ?@import("images.zig").Options = null,
    xml: ?@import("../xml_validation.zig").Options = null,
    xml_template: ?@import("xml_template.zig").Options = null,
    history: ?@import("history.zig").Options = null,
    max_viewtext_ciphertext_bytes: usize = 64 * 1024 * 1024,
    storage_layout: @import("../docinfo/bin_data.zig").StorageLayout = .observed_optional_extension,
    document: d.Options,
    cfb: @import("../../cfb/types.zig").Options = .{ .strict = true },
    max_summary_properties: usize = 4096,
};
/// Owns DocInfo backing bytes and the document report. Does NOT own the input CFB.
/// Image inspection is explicit and partial; unhandled image/OLE semantics remain deferred.
pub const Report = struct {
    images: ?@import("images.zig").Report,
    xml: ?@import("../xml_validation.zig").Report,
    xml_template: ?@import("xml_template.zig").Report,
    history: ?@import("history.zig").Report,
    view_text: @import("view_text.zig").Report,
    document: d.Report,
    binary_data: binaries.Report,
    preview_text: ?@import("../preview/text.zig").Stats,
    summary_information: ?@import("../summary/parser.zig").Stats,
    scripts: @import("scripts.zig").Report,
    total_decoded_bytes: usize,
    uninspected_streams: usize,
    doc_info_backing: []const u8,
    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        if (self.history) |*h| h.deinit(a);
        self.document.deinit(a);
        a.free(self.doc_info_backing);
        self.* = undefined;
    }
};
pub fn inspect(a: std.mem.Allocator, bytes: []const u8, options: Options) !Report {
    try options.document.validate();
    var xml_budget = if (options.xml) |selected| try @import("../xml_validation.zig").Budget.init(selected) else null;
    const xml = if (xml_budget) |*budget| budget else null;
    var image_budget: ?@import("images.zig").Budget = if (options.images) |selected| .{ .options = selected } else null;
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
    const view = try @import("view_text.zig").inspect(a, &file, &header, used, &remaining, options.document.max_total_records - report.total_records, report.sections.len, options.document, options.max_viewtext_ciphertext_bytes);
    const bins = try binaries.inspectWithImages(a, &file, &header, doc, options.document.framing, options.storage_layout, used, &remaining, if (image_budget) |*budget| budget else null);
    const preview = try @import("preview.zig").inspect(&file, used, &remaining);
    const summary = try @import("summary.zig").inspect(a, &file, used, &remaining, options.max_summary_properties);
    const scripts = try @import("scripts.zig").inspect(a, &file, &header, used, &remaining);
    const xml_template = if (options.xml_template) |selected| try @import("xml_template.zig").inspectWithXml(a, &file, header.has(.xml_template), used, &remaining, selected, xml) else null;
    const history = if (options.history) |selected| try @import("history.zig").inspectWithXml(a, &file, header.has(.history), used, &remaining, options.document.max_total_records - report.total_records - view.records, selected, xml) else null;
    var uninspected: usize = 0;
    for (file.entries, used) |entry, consumed| if (entry.kind == 2 and !consumed) {
        uninspected += 1;
    };
    return .{ .images = if (image_budget) |budget| budget.report else null, .xml = if (xml) |budget| budget.report else null, .xml_template = xml_template, .history = history, .view_text = view, .document = report, .binary_data = bins, .preview_text = preview, .summary_information = summary, .scripts = scripts, .total_decoded_bytes = options.document.max_total_bytes - remaining, .uninspected_streams = uninspected, .doc_info_backing = doc };
}
