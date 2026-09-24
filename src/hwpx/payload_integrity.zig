const std = @import("std");
const zip = @import("../zip/archive.zig");
const manifest = @import("content_manifest.zig");

pub const Options = struct {
    max_entry_bytes: usize = 512 * 1024 * 1024,
    max_total_decoded_bytes: usize = 512 * 1024 * 1024,
};

/// ZIP entry indices in unmanifested_entries borrow no source strings.
/// Classification does not assert that the bytes match their OPF media type.
pub const Report = struct {
    validated_entries: usize,
    decoded_bytes: usize,
    manifested_entries: usize,
    external_items: usize,
    duplicate_manifest_bindings: usize,
    unmanifested_entries: []usize,

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        a.free(self.unmanifested_entries);
        self.* = undefined;
    }
};

/// Decode every ZIP entry exactly once with the ZIP layer's length and CRC
/// checks, including resources not selected by the document spine.
pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, items: []const manifest.Item, options: Options) !Report {
    const bindings = try a.alloc(bool, archive.entries.len);
    defer a.free(bindings);
    @memset(bindings, false);
    var external_items: usize = 0;
    var duplicate_bindings: usize = 0;
    var manifested_entries: usize = 0;
    for (items) |item| {
        if (item.entry_index) |index| {
            if (index >= bindings.len) return error.InvalidManifestEntryIndex;
            if (bindings[index]) {
                duplicate_bindings += 1;
            } else {
                bindings[index] = true;
                manifested_entries += 1;
            }
        } else {
            external_items += 1;
        }
    }

    var unmanifested: std.ArrayList(usize) = .empty;
    errdefer unmanifested.deinit(a);
    var remaining = options.max_total_decoded_bytes;
    for (archive.entries, 0..) |entry, index| {
        if (entry.uncompressed_size > options.max_entry_bytes or entry.uncompressed_size > remaining)
            return error.LimitExceeded;
        // decode validates both the exact uncompressed length and CRC. Its
        // output belongs to archive.allocator, which may differ from a.
        const bytes = try archive.decode(entry, @min(options.max_entry_bytes, remaining));
        archive.allocator.free(bytes);
        remaining -= entry.uncompressed_size;
        if (!bindings[index]) try unmanifested.append(a, index);
    }
    return .{
        .validated_entries = archive.entries.len,
        .decoded_bytes = options.max_total_decoded_bytes - remaining,
        .manifested_entries = manifested_entries,
        .external_items = external_items,
        .duplicate_manifest_bindings = duplicate_bindings,
        .unmanifested_entries = try unmanifested.toOwnedSlice(a),
    };
}
