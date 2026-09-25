const std = @import("std");
const zip = @import("../zip/archive.zig");
const manifest = @import("content_manifest.zig");
const core = @import("image_payloads.zig");
const links = @import("binary_reference_links.zig");

pub const Options = core.Options;
pub const Report = core.Report;

const Site = struct { target: links.Target };

/// An image declaration or a known image filename is enough to inspect the
/// bytes, even when no picture/brush node references the manifest item.
pub fn isCandidate(item: manifest.Item) bool {
    if (item.media_type.len >= 6 and std.ascii.eqlIgnoreCase(item.media_type[0..6], "image/")) return true;
    inline for (.{ ".png", ".jpg", ".jpeg", ".bmp", ".gif", ".wmf", ".tif", ".tiff", ".pcx", ".svg" }) |suffix| {
        if (item.href.len >= suffix.len and std.ascii.eqlIgnoreCase(item.href[item.href.len - suffix.len ..], suffix)) return true;
    }
    return false;
}

/// This is a manifest inventory, not a claim that every BinData entry is an
/// image. The shared image core owns ZIP decoding, format checks and budgets.
pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, items: manifest.Manifest, options: Options) !Report {
    var sites: std.ArrayList(Site) = .empty;
    defer sites.deinit(a);
    for (items.items, 0..) |item, index| {
        if (!isCandidate(item)) continue;
        try sites.append(a, .{ .target = .{
            .state = if (item.entry_index == null) .external else .embedded,
            .item_index = index,
        } });
    }
    return core.inspect(a, archive, items, sites.items, options);
}
