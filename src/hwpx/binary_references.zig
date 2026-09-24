const std = @import("std");
const zip = @import("../zip/archive.zig");
const content_manifest = @import("content_manifest.zig");
const document_structure = @import("document_structure.zig");
const links = @import("binary_reference_links.zig");
const scan = @import("binary_reference_scan.zig");
const selection = @import("compatibility_selection.zig");

pub const Kind = links.Kind;
pub const Counts = links.Counts;
pub const Report = links.Report;
pub const Options = scan.Options;

/// Resolves XML binaryItemIDRef strings against the OPF manifest only. Binary
/// payload bytes and external links are never loaded or fetched here.
pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, manifest: content_manifest.Manifest, header: document_structure.SelectedHeader, sections: []const document_structure.Section, options: Options) !Report {
    try selection.validate(options.branch_policy);
    var index = try links.Index.init(a, manifest);
    defer index.deinit(a);
    var report: Report = .{ .sections = sections.len };
    errdefer report.deinit(a);
    var remaining = options.max_total_xml_bytes;
    try scan.read(a, archive, header.entry, header.item_index, .header, manifest, &index, &report, options, &remaining);
    for (sections) |section| {
        const item = manifest.items[section.item_index];
        const entry_index = item.entry_index orelse return error.ExternalSpineXml;
        try scan.read(a, archive, archive.entries[entry_index], section.item_index, .section, manifest, &index, &report, options, &remaining);
    }
    return report;
}
