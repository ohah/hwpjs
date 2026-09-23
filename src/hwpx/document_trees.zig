const std = @import("std");
const zip = @import("../zip/archive.zig");
const manifest_xml = @import("content_manifest.zig");
const structure_xml = @import("document_structure.zig");
const protection = @import("encryption_manifest.zig");
const header_tree = @import("header_tree.zig");
const section_tree = @import("section_tree.zig");
const paragraph_metadata = @import("paragraph_metadata.zig");

pub const HeaderOptions = struct {
    protection: protection.Options = .{},
    tree: header_tree.Options = .{},
};

pub const SectionOptions = struct {
    structure: structure_xml.Options = .{},
    tree: section_tree.Options = .{},
};

pub const AllOptions = struct {
    structure: structure_xml.Options = .{},
    header: header_tree.Options = .{},
    section: section_tree.Options = .{},
    max_total_owned_xml_bytes: usize = 256 * 1024 * 1024,
    max_total_elements: usize = 4_000_000,
};

/// Owns all structure-selected header/section XML trees and the structure
/// diagnostics. Other package entries remain in the Document archive.
pub const Bundle = struct {
    structure: structure_xml.Report,
    header: header_tree.Tree,
    sections: []section_tree.Tree,

    pub fn inspectParagraphMetadata(self: *const Bundle, a: std.mem.Allocator, options: paragraph_metadata.Options) !paragraph_metadata.Report {
        return paragraph_metadata.inspect(a, self.sections, options);
    }

    pub fn deinit(self: *Bundle, a: std.mem.Allocator) void {
        for (self.sections) |*section| section.deinit(a);
        a.free(self.sections);
        self.header.deinit(a);
        self.structure.deinit(a);
        self.* = undefined;
    }
};

fn parseHeaderAt(a: std.mem.Allocator, archive: zip.Archive, manifest: manifest_xml.Manifest, item_index: usize, options: header_tree.Options) !header_tree.Tree {
    const entry_index = manifest.items[item_index].entry_index orelse return error.ExternalHeaderXml;
    const bytes = try archive.decode(archive.entries[entry_index], options.max_xml_bytes);
    defer archive.allocator.free(bytes);
    return header_tree.parse(a, bytes, item_index, options);
}

fn parseSectionAt(a: std.mem.Allocator, archive: zip.Archive, manifest: manifest_xml.Manifest, selected: structure_xml.Section, ordinal: usize, options: section_tree.Options) !section_tree.Tree {
    const entry_index = manifest.items[selected.item_index].entry_index orelse return error.ExternalSpineXml;
    const bytes = try archive.decode(archive.entries[entry_index], options.max_xml_bytes);
    defer archive.allocator.free(bytes);
    var tree = try section_tree.parse(a, bytes, ordinal, selected.item_index, options);
    errdefer tree.deinit(a);
    if (tree.source.len != selected.xml_bytes or tree.elements.len != selected.elements) return error.XmlTreeStructureMismatch;
    return tree;
}

pub fn readHeader(a: std.mem.Allocator, archive: zip.Archive, manifest: manifest_xml.Manifest, options: HeaderOptions) !header_tree.Tree {
    const selected = try structure_xml.plainHeaderEntry(a, archive, manifest, options.protection);
    return parseHeaderAt(a, archive, manifest, selected.item_index, options.tree);
}

pub fn readSection(a: std.mem.Allocator, archive: zip.Archive, manifest: manifest_xml.Manifest, ordinal: usize, options: SectionOptions) !section_tree.Tree {
    var structure = try structure_xml.inspect(a, archive, manifest, options.structure);
    defer structure.deinit(a);
    if (ordinal >= structure.sections.len) return error.SectionOutOfRange;
    return parseSectionAt(a, archive, manifest, structure.sections[ordinal], ordinal, options.tree);
}

fn preflight(structure: *const structure_xml.Report, options: AllOptions) !void {
    var remaining_bytes = options.max_total_owned_xml_bytes;
    var remaining_elements = options.max_total_elements;
    if (structure.header_xml_bytes > remaining_bytes or structure.header_elements > remaining_elements) return error.LimitExceeded;
    remaining_bytes -= structure.header_xml_bytes;
    remaining_elements -= structure.header_elements;
    for (structure.sections) |section| {
        if (section.xml_bytes > remaining_bytes or section.elements > remaining_elements) return error.LimitExceeded;
        remaining_bytes -= section.xml_bytes;
        remaining_elements -= section.elements;
    }
}

pub fn readAll(a: std.mem.Allocator, archive: zip.Archive, manifest: manifest_xml.Manifest, options: AllOptions) !Bundle {
    var structure = try structure_xml.inspect(a, archive, manifest, options.structure);
    errdefer structure.deinit(a);
    try preflight(&structure, options);
    var header = try parseHeaderAt(a, archive, manifest, structure.header_item_index, options.header);
    errdefer header.deinit(a);
    if (header.source.len != structure.header_xml_bytes or header.elements.len != structure.header_elements) return error.XmlTreeStructureMismatch;
    var sections: std.ArrayList(section_tree.Tree) = .empty;
    errdefer {
        for (sections.items) |*section| section.deinit(a);
        sections.deinit(a);
    }
    for (structure.sections, 0..) |selected, ordinal| {
        var section = try parseSectionAt(a, archive, manifest, selected, ordinal, options.section);
        sections.append(a, section) catch |err| {
            section.deinit(a);
            return err;
        };
    }
    const owned_sections = try sections.toOwnedSlice(a);
    return .{ .structure = structure, .header = header, .sections = owned_sections };
}
