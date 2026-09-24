const std = @import("std");
const zip = @import("../zip/archive.zig");
const content_manifest = @import("content_manifest.zig");
const protection = @import("encryption_manifest.zig");
const document_xml = @import("document_xml.zig");

const header_path = "Contents/header.xml";
const xml_media = content_manifest.xml_media_type;

pub const Options = struct {
    protection: protection.Options = .{},
    xml: document_xml.Options = .{},
    max_header_xml_bytes: usize = 32 * 1024 * 1024,
    max_spine_xml_bytes: usize = 128 * 1024 * 1024,
    max_total_xml_bytes: usize = 256 * 1024 * 1024,
    max_sections: usize = 65_535,
};

pub const Section = struct {
    /// Index into the owning package Document's manifest.items.
    item_index: usize,
    xml_bytes: usize,
    elements: usize,
    direct_paragraphs: usize,
};

pub const Report = struct {
    header_version: ?[]u8,
    header_item_index: usize,
    header_xml_bytes: usize,
    header_elements: usize,
    declared_section_count: ?u32,
    sections: []Section,
    header_in_spine: bool,
    non_xml_spine_items: usize,
    unclassified_spine_xml: usize,
    /// null when an observed section path is not Contents/sectionN.xml.
    numeric_path_order_matches: ?bool,
    declared_count_matches: ?bool,
    decoded_xml_bytes: usize,

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        if (self.header_version) |value| a.free(value);
        a.free(self.sections);
        self.* = undefined;
    }
};

fn sectionNumber(path: []const u8) ?u32 {
    const prefix = "Contents/section";
    const suffix = ".xml";
    if (!std.mem.startsWith(u8, path, prefix) or !std.mem.endsWith(u8, path, suffix)) return null;
    const digits = path[prefix.len .. path.len - suffix.len];
    if (digits.len == 0) return null;
    for (digits) |byte| if (!std.ascii.isDigit(byte)) return null;
    return std.fmt.parseInt(u32, digits, 10) catch null;
}

pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, manifest: content_manifest.Manifest, options: Options) !Report {
    const selected_header = try plainHeaderEntry(a, archive, manifest, options.protection);
    var header = try document_xml.read(a, archive, selected_header.entry, @min(options.max_header_xml_bytes, options.max_total_xml_bytes), options.xml);
    errdefer header.deinit(a);
    if (header.kind != .header) return error.InvalidHeaderRoot;
    var remaining = options.max_total_xml_bytes - header.xml_bytes;

    const header_index = selected_header.item_index;
    var sections: std.ArrayList(Section) = .empty;
    errdefer sections.deinit(a);
    var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer seen.deinit(a);
    var header_in_spine = false;
    var non_xml_spine_items: usize = 0;
    var unclassified_spine_xml: usize = 0;
    var numeric_path_order_matches: ?bool = true;
    var last_number: ?u32 = null;
    for (manifest.spine) |reference| {
        const item = manifest.items[reference.item_index];
        if (reference.item_index == header_index) {
            if (header_in_spine) return error.DuplicateHeaderSpineReference;
            header_in_spine = true;
            continue;
        }
        if (!std.mem.eql(u8, item.media_type, xml_media)) {
            non_xml_spine_items += 1;
            continue;
        }
        const entry_index = item.entry_index orelse return error.ExternalSpineXml;
        var scanned = try document_xml.read(a, archive, archive.entries[entry_index], @min(options.max_spine_xml_bytes, remaining), options.xml);
        defer scanned.deinit(a);
        remaining -= scanned.xml_bytes;
        switch (scanned.kind) {
            .section => {
                if (sections.items.len == options.max_sections) return error.LimitExceeded;
                if ((try seen.getOrPut(a, reference.item_index)).found_existing) return error.DuplicateSectionSpineReference;
                try sections.append(a, .{
                    .item_index = reference.item_index,
                    .xml_bytes = scanned.xml_bytes,
                    .elements = scanned.elements,
                    .direct_paragraphs = scanned.direct_paragraphs,
                });
                if (sectionNumber(item.href)) |number| {
                    if (last_number) |previous| {
                        if (number <= previous and numeric_path_order_matches != null) numeric_path_order_matches = false;
                    }
                    last_number = number;
                } else numeric_path_order_matches = null;
            },
            .header => return error.UnexpectedHeaderSpineXml,
            .other => unclassified_spine_xml += 1,
        }
    }
    if (sections.items.len == 0) return error.MissingDocumentSection;
    const owned_sections = try sections.toOwnedSlice(a);
    return .{
        .header_version = header.header_version,
        .header_item_index = header_index,
        .header_xml_bytes = header.xml_bytes,
        .header_elements = header.elements,
        .declared_section_count = header.declared_section_count,
        .sections = owned_sections,
        .header_in_spine = header_in_spine,
        .non_xml_spine_items = non_xml_spine_items,
        .unclassified_spine_xml = unclassified_spine_xml,
        .numeric_path_order_matches = numeric_path_order_matches,
        .declared_count_matches = if (header.declared_section_count) |declared| declared == owned_sections.len else null,
        .decoded_xml_bytes = options.max_total_xml_bytes - remaining,
    };
}

/// One exact package/header selection policy shared by structure and resource
/// readers. A protected package cannot be treated as ordinary XML.
pub const SelectedHeader = struct { entry: zip.Entry, item_index: usize };
pub fn plainHeaderEntry(a: std.mem.Allocator, archive: zip.Archive, manifest: content_manifest.Manifest, protection_options: protection.Options) !SelectedHeader {
    var encryption = try protection.read(a, archive, protection_options);
    defer encryption.deinit(a);
    if (encryption.encrypted_paths.len != 0) return error.EncryptedDocument;

    const header_index = (try headerItemIndex(manifest)) orelse return error.MissingHeaderManifestItem;
    return .{ .entry = archive.entries[manifest.items[header_index].entry_index.?], .item_index = header_index };
}

fn headerItemIndex(manifest: content_manifest.Manifest) !?usize {
    var header_item_index: ?usize = null;
    for (manifest.items, 0..) |item, i| {
        if (std.mem.eql(u8, item.href, header_path)) {
            if (header_item_index != null) return error.DuplicateHeaderManifestItem;
            if (!std.mem.eql(u8, item.media_type, xml_media)) return error.InvalidHeaderMediaType;
            if (item.entry_index == null) return error.ExternalHeaderXml;
            header_item_index = i;
        }
    }
    return header_item_index;
}
