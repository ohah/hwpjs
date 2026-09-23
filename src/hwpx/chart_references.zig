const std = @import("std");
const zip = @import("../zip/archive.zig");
const content_manifest = @import("content_manifest.zig");
const document_structure = @import("document_structure.zig");
const parts = @import("chart_parts.zig");
const scan = @import("chart_reference_scan.zig");

pub const Report = parts.Report;
pub const ProblemKind = parts.ProblemKind;
pub const Options = struct {
    sections: scan.Options = .{},
    charts: parts.Options = .{},
};

pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, manifest: content_manifest.Manifest, sections: []const document_structure.Section, options: Options) !Report {
    var report: Report = .{ .sections = sections.len };
    errdefer report.deinit(a);
    var resolver = try parts.Resolver.init(a, archive, &report, options.charts);
    defer resolver.deinit();
    var remaining = options.sections.max_total_section_xml_bytes;
    for (sections) |section| {
        const item = manifest.items[section.item_index];
        const entry_index = item.entry_index orelse return error.ExternalSpineXml;
        try scan.read(a, archive, archive.entries[entry_index], section.item_index, &resolver, options.sections, &remaining);
    }
    return report;
}
