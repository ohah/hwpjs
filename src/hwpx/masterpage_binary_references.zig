const std = @import("std");
const zip = @import("../zip/archive.zig");
const content_manifest = @import("content_manifest.zig");
const masterpage_parts = @import("masterpage_parts.zig");
const links = @import("binary_reference_links.zig");
const scan = @import("binary_reference_scan.zig");
const selection = @import("compatibility_selection.zig");
const document_xml = @import("document_xml.zig");

pub const ScanOptions = struct {
    max_part_xml_bytes: usize = 32 * 1024 * 1024,
    max_attribute_bytes: usize = 4096,
    max_sites: usize = 1_000_000,
    branch_policy: selection.Policy = .{},
    xml: document_xml.Options = .{},
};

pub const Options = struct {
    max_parts: usize = 4096,
    max_total_xml_bytes: usize = 128 * 1024 * 1024,
    scan: ScanOptions = .{},
};

pub const Report = struct {
    parts: usize = 0,
    sub_lists: usize = 0,
    xml_bytes: usize = 0,
    links: links.Report = .{},

    pub fn counts(self: *const Report, kind: links.Kind) *const links.Counts {
        return self.links.counts(kind);
    }

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        self.links.deinit(a);
        self.* = undefined;
    }
};

/// Only root-direct hp:subList descendants of selected master-page parts are
/// scanned. The OPF lookup and XML object classifier are shared with sections.
pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, manifest: content_manifest.Manifest, parts: []const masterpage_parts.Part, options: Options) !Report {
    try selection.validate(options.scan.branch_policy);
    if (parts.len > options.max_parts) return error.LimitExceeded;
    var index = try links.Index.init(a, manifest);
    defer index.deinit(a);
    var result: Report = .{};
    errdefer result.deinit(a);
    var remaining = options.max_total_xml_bytes;
    const scan_options: scan.Options = .{
        .max_attribute_bytes = options.scan.max_attribute_bytes,
        .max_sites = options.scan.max_sites,
        .branch_policy = options.scan.branch_policy,
        .xml = options.scan.xml,
    };
    for (parts) |part| {
        if (part.entry_index >= archive.entries.len) return error.InvalidManifestEntryIndex;
        const read = try scan.read(a, archive, archive.entries[part.entry_index], part.item_index, .master_page, manifest, &index, &result.links, scan_options, &remaining, options.scan.max_part_xml_bytes);
        if (read.sub_lists != part.sub_lists.len) return error.InconsistentMasterPageSelection;
        result.parts += 1;
        result.sub_lists += read.sub_lists;
        result.xml_bytes = std.math.add(usize, result.xml_bytes, read.xml_bytes) catch return error.LimitExceeded;
    }
    return result;
}
