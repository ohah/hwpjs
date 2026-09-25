const std = @import("std");
const zip = @import("../zip/archive.zig");
const manifest = @import("content_manifest.zig");
const links = @import("picture_image_links.zig");
const binary_links = @import("binary_reference_links.zig");
const core = @import("image_payloads.zig");

pub const Format = core.Format;
pub const Inspection = core.Inspection;
pub const Options = core.Options;
pub const Target = core.Target;
pub const Report = core.Report;

pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, items: manifest.Manifest, image_links: *const links.Report, options: Options) !Report {
    var index = try binary_links.Index.init(a, items);
    defer index.deinit(a);
    for (image_links.sites) |site| {
        const expected = binary_links.resolve(&index, items, site.id);
        if (expected.state != site.target.state or expected.item_index != site.target.item_index) return error.InvalidImageLinkReport;
    }
    return core.inspect(a, archive, items, image_links.sites, options);
}
