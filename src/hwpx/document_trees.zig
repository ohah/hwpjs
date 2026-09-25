const std = @import("std");
const zip = @import("../zip/archive.zig");
const manifest_xml = @import("content_manifest.zig");
const structure_xml = @import("document_structure.zig");
const protection = @import("encryption_manifest.zig");
const header_tree = @import("header_tree.zig");
const section_tree = @import("section_tree.zig");
const paragraph_metadata = @import("paragraph_metadata.zig");
const paragraph_children = @import("paragraph_children.zig");
const line_segments = @import("line_segments.zig");
const run_metadata = @import("run_metadata.zig");
const run_topology = @import("run_topology.zig");
const text_node = @import("text_node.zig");
const header_begin_numbers = @import("header_begin_numbers.zig");
const page_geometry = @import("page_geometry.zig");
const section_definition = @import("section_definition.zig");
const section_direct_settings = @import("section_direct_settings.zig");
const section_page_border = @import("section_page_border.zig");
const table_geometry = @import("table_geometry.zig");
const header_resources = @import("header_resources.zig");

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

    pub fn inspectParagraphChildren(self: *const Bundle, options: paragraph_children.Options) !paragraph_children.Report {
        return paragraph_children.inspect(self.sections, options);
    }

    pub fn inspectLineSegments(self: *const Bundle, a: std.mem.Allocator, options: line_segments.Options) !line_segments.Report {
        return line_segments.inspect(a, self.sections, options);
    }

    pub fn inspectRunMetadata(self: *const Bundle, a: std.mem.Allocator, options: run_metadata.Options) !run_metadata.Report {
        return run_metadata.inspect(a, self.sections, options);
    }

    pub fn inspectRunTopology(self: *const Bundle, a: std.mem.Allocator, options: run_topology.Options) !run_topology.Report {
        return run_topology.inspectSections(a, self.sections, options);
    }

    pub fn inspectTextNodes(self: *const Bundle, a: std.mem.Allocator, options: text_node.Options) !text_node.Report {
        return text_node.inspectSections(a, self.sections, options);
    }

    pub fn inspectTableGeometry(self: *const Bundle, a: std.mem.Allocator, options: table_geometry.Options) !table_geometry.Report {
        return table_geometry.inspect(a, self.sections, options);
    }

    pub fn inspectTableGeometryWithBorderFills(self: *const Bundle, a: std.mem.Allocator, options: table_geometry.Options, border_fills: *const header_resources.Table) !table_geometry.Report {
        return table_geometry.inspectWithBorderFills(a, self.sections, options, border_fills);
    }

    pub fn inspectSelectedTableGeometryWithBorderFills(self: *const Bundle, a: std.mem.Allocator, options: table_geometry.Options, border_fills: *const header_resources.Table, supported_namespaces: []const []const u8) !table_geometry.Report {
        return table_geometry.inspectSelectedWithBorderFills(a, self.sections, options, border_fills, supported_namespaces);
    }

    pub fn inspectBeginNumbers(self: *const Bundle, a: std.mem.Allocator, options: header_begin_numbers.Options) !header_begin_numbers.Report {
        return header_begin_numbers.inspect(a, &self.header, options);
    }

    pub fn inspectPageGeometry(self: *const Bundle, a: std.mem.Allocator, options: page_geometry.Options) !page_geometry.Report {
        return page_geometry.inspect(a, self.sections, options);
    }

    pub fn inspectSectionDefinitions(self: *const Bundle, a: std.mem.Allocator, options: section_definition.Options) !section_definition.Report {
        return section_definition.inspect(a, self.sections, options);
    }

    pub fn inspectSectionDirectSettings(self: *const Bundle, a: std.mem.Allocator, options: section_direct_settings.Options) !section_direct_settings.Report {
        return section_direct_settings.inspect(a, self.sections, options);
    }

    pub fn inspectSectionPageBorders(self: *const Bundle, a: std.mem.Allocator, options: section_page_border.Options) !section_page_border.Report {
        return section_page_border.inspect(a, self.sections, options);
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
