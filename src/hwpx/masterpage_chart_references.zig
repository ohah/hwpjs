const std = @import("std");
const zip = @import("../zip/archive.zig");
const masterpage_parts = @import("masterpage_parts.zig");
const chart_parts = @import("chart_parts.zig");
const scan = @import("chart_reference_scan.zig");
const selection = @import("compatibility_selection.zig");
const document_xml = @import("document_xml.zig");

pub const Options = struct {
    max_parts: usize = 4096,
    max_part_xml_bytes: usize = 32 * 1024 * 1024,
    max_total_xml_bytes: usize = 128 * 1024 * 1024,
    max_attribute_bytes: usize = 4096,
    max_sites: usize = 1_000_000,
    xml: document_xml.Options = .{},
    charts: chart_parts.Options = .{},
};

pub const Report = struct {
    parts: usize = 0,
    sub_lists: usize = 0,
    xml_bytes: usize = 0,
    charts: chart_parts.Report = .{},

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        self.charts.deinit(a);
        self.* = undefined;
    }
};

/// Resolves chart paths inside exact master-page parts. Part selection and
/// root-direct subList scope are master-page-specific; chart payload, cache
/// and formula validation remain owned by the shared chart Resolver.
pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, pages: []const masterpage_parts.Part, options: Options, policy: selection.Policy) !Report {
    try selection.validate(policy);
    if (pages.len > options.max_parts) return error.LimitExceeded;
    var report: Report = .{};
    errdefer report.deinit(a);
    var resolver = try chart_parts.Resolver.init(a, archive, &report.charts, options.charts);
    defer resolver.deinit();
    var remaining = options.max_total_xml_bytes;
    const scan_options: scan.Options = .{
        .max_attribute_bytes = options.max_attribute_bytes,
        .max_sites = options.max_sites,
        .branch_policy = policy,
        .xml = options.xml,
    };
    for (pages) |page| {
        if (page.entry_index >= archive.entries.len) return error.InvalidManifestEntryIndex;
        const read = try scan.readMaster(a, archive, archive.entries[page.entry_index], page.item_index, &resolver, scan_options, &remaining, options.max_part_xml_bytes);
        if (read.sub_lists != page.sub_lists.len) return error.InconsistentMasterPageSelection;
        report.parts += 1;
        report.sub_lists += read.sub_lists;
        report.xml_bytes = std.math.add(usize, report.xml_bytes, read.xml_bytes) catch return error.LimitExceeded;
    }
    return report;
}
