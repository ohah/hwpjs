//! Decode a resolved embedded image item with the archive's allocator.
const std = @import("std");
const zip = @import("../zip/archive.zig");
const manifest = @import("content_manifest.zig");

pub fn read(archive: zip.Archive, items: manifest.Manifest, item_index: usize, max_bytes: usize) ![]u8 {
    if (item_index >= items.items.len) return error.InvalidImageLinkReport;
    const item = items.items[item_index];
    const entry_index = item.entry_index orelse return error.InvalidImageLinkReport;
    if (entry_index >= archive.entries.len) return error.InvalidImageLinkReport;
    const entry = archive.entries[entry_index];
    if (!std.mem.eql(u8, entry.name, item.href)) return error.InvalidImageLinkReport;
    return archive.decode(entry, max_bytes);
}
