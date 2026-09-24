const std = @import("std");
const zip = @import("../zip/archive.zig");
const manifest = @import("content_manifest.zig");
const document_xml = @import("document_xml.zig");

pub const Options = struct {
    max_xml_items: usize = 65_535,
    max_entry_xml_bytes: usize = 128 * 1024 * 1024,
    max_total_xml_bytes: usize = 256 * 1024 * 1024,
    max_total_elements: usize = 8_000_000,
    xml: document_xml.Options = .{},
};

/// Entry indices only; the caller needs its Document to resolve ZIP names.
/// An XML parse success does not establish the item's schema or media type.
pub const Report = struct {
    xml_items: usize,
    external_xml_items: usize,
    duplicate_xml_bindings: usize,
    decoded_xml_bytes: usize,
    elements: usize,
    parsed_entry_indices: []usize,

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        a.free(self.parsed_entry_indices);
        self.* = undefined;
    }
};

/// Checks XML syntax and namespaces for every embedded OPF item whose exact
/// media-type is application/xml, regardless of spine selection or path.
pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, items: []const manifest.Item, options: Options) !Report {
    const seen = try a.alloc(bool, archive.entries.len);
    defer a.free(seen);
    @memset(seen, false);
    var parsed: std.ArrayList(usize) = .empty;
    errdefer parsed.deinit(a);
    var remaining_bytes = options.max_total_xml_bytes;
    var remaining_elements = options.max_total_elements;
    var xml_items: usize = 0;
    var external: usize = 0;
    var duplicates: usize = 0;
    for (items) |item| {
        if (!std.mem.eql(u8, item.media_type, manifest.xml_media_type)) continue;
        if (xml_items == options.max_xml_items) return error.LimitExceeded;
        xml_items += 1;
        const index = item.entry_index orelse {
            external += 1;
            continue;
        };
        if (index >= seen.len) return error.InvalidManifestEntryIndex;
        if (seen[index]) {
            duplicates += 1;
            continue;
        }
        const entry = archive.entries[index];
        if (entry.uncompressed_size > options.max_entry_xml_bytes or entry.uncompressed_size > remaining_bytes)
            return error.LimitExceeded;
        const bytes = try archive.decode(entry, @min(options.max_entry_xml_bytes, remaining_bytes));
        defer archive.allocator.free(bytes);
        var xml_options = options.xml;
        xml_options.max_elements = @min(xml_options.max_elements, remaining_elements);
        const result = try document_xml.visitBytes(a, bytes, bytes.len, xml_options, null);
        remaining_bytes -= bytes.len;
        remaining_elements -= result.elements;
        seen[index] = true;
        try parsed.append(a, index);
    }
    return .{
        .xml_items = xml_items,
        .external_xml_items = external,
        .duplicate_xml_bindings = duplicates,
        .decoded_xml_bytes = options.max_total_xml_bytes - remaining_bytes,
        .elements = options.max_total_elements - remaining_elements,
        .parsed_entry_indices = try parsed.toOwnedSlice(a),
    };
}
