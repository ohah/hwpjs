const std = @import("std");
const zip = @import("../zip/archive.zig");
const container = @import("container_manifest.zig");
const content_manifest = @import("content_manifest.zig");
const version_xml = @import("version_xml.zig");
const encryption_manifest = @import("encryption_manifest.zig");
const document_structure = @import("document_structure.zig");
const header_resources = @import("header_resources.zig");
const section_references = @import("section_references.zig");
const header_references = @import("header_references.zig");
const font_faces = @import("font_faces.zig");
const font_references = @import("font_references.zig");
const list_references = @import("list_references.zig");
const binary_references = @import("binary_references.zig");
const chart_references = @import("chart_references.zig");
const section_text = @import("section_text.zig");
const header_tree = @import("header_tree.zig");
const section_tree = @import("section_tree.zig");

pub const Archive = zip.Archive;
pub const Options = zip.Options;
pub const mime = "application/hwp+zip";
pub const Version = version_xml.Version;
pub const VersionOptions = struct { max_xml_bytes: usize = 1024 * 1024, max_attribute_bytes: usize = 4096 };
pub const ProtectionOptions = encryption_manifest.Options;
pub const ProtectionReport = encryption_manifest.Report;
pub const StructureOptions = document_structure.Options;
pub const StructureReport = document_structure.Report;
pub const HeaderResourceOptions = struct {
    protection: ProtectionOptions = .{},
    resources: header_resources.Options = .{},
};
pub const HeaderResourceReport = header_resources.Report;
pub const HeaderResourceKind = header_resources.Kind;
pub const ReferenceOptions = struct {
    structure: StructureOptions = .{},
    header_resources: header_resources.Options = .{},
    sections: section_references.Options = .{},
};
pub const ReferenceReport = section_references.Report;
pub const ReferenceKind = section_references.Kind;
pub const HeaderReferenceOptions = struct {
    protection: ProtectionOptions = .{},
    resources: header_resources.Options = .{},
    references: header_references.Options = .{},
};
pub const HeaderReferenceReport = header_references.Report;
pub const HeaderReferenceKind = header_references.Kind;
pub const FontLanguage = font_faces.Language;
pub const FontReferenceOptions = struct {
    protection: ProtectionOptions = .{},
    faces: font_faces.Options = .{},
    references: font_references.Options = .{},
};
pub const FontReferenceReport = struct {
    faces: font_faces.Report,
    references: font_references.Report,

    pub fn deinit(self: *FontReferenceReport, a: std.mem.Allocator) void {
        self.faces.deinit(a);
        self.* = undefined;
    }
};
pub const ListReferenceOptions = struct {
    protection: ProtectionOptions = .{},
    resources: header_resources.Options = .{},
    references: list_references.Options = .{},
};
pub const ListReferenceReport = list_references.Report;
pub const BinaryReferenceOptions = struct {
    structure: StructureOptions = .{},
    references: binary_references.Options = .{},
};
pub const BinaryReferenceReport = binary_references.Report;
pub const BinaryReferenceKind = binary_references.Kind;
pub const ChartReferenceOptions = struct {
    structure: StructureOptions = .{},
    references: chart_references.Options = .{},
};
pub const ChartReferenceReport = chart_references.Report;
pub const ChartProblemKind = chart_references.ProblemKind;
pub const SectionTextOptions = struct {
    structure: StructureOptions = .{},
    text: section_text.Options = .{},
};
pub const SectionTextReport = section_text.Report;
pub const SectionTextVisitor = section_text.Visitor;
pub const SectionTextEvent = section_text.Event;
pub const SectionTextInlineKind = section_text.InlineKind;
pub const SectionOtherContentKind = section_text.OtherContentKind;
pub const SectionTree = section_tree.Tree;
pub const HeaderTree = header_tree.Tree;
pub const HeaderTreeOptions = struct {
    protection: ProtectionOptions = .{},
    tree: header_tree.Options = .{},
};
pub const SectionTreeOptions = struct {
    structure: StructureOptions = .{},
    tree: section_tree.Options = .{},
};
pub const DocumentOptions = struct {
    // The archive index also contains large BinData/section entries. Their
    // declared sizes are bounded here; this call only decodes the two small
    // package XML members under the separate limits below.
    zip: zip.Options = .{ .max_entry_bytes = 512 * 1024 * 1024 },
    max_container_xml_bytes: usize = 1024 * 1024,
    max_total_xml_bytes: usize = 2 * 1024 * 1024,
    manifest: content_manifest.Options = .{},
};

pub const Document = struct {
    archive: Archive,
    container: container.Root,
    manifest: content_manifest.Manifest,
    decoded_xml_bytes: usize,

    /// Separately validates version.xml; package relationship inspection does
    /// not imply a compatible or even parseable document version.
    pub fn inspectVersion(self: *const Document, a: std.mem.Allocator, options: VersionOptions) !Version {
        return version_xml.read(a, self.archive, options.max_xml_bytes, options.max_attribute_bytes);
    }

    /// Reports ODF manifest encryption metadata without decrypting any entry.
    pub fn inspectProtection(self: *const Document, a: std.mem.Allocator, options: ProtectionOptions) !ProtectionReport {
        return encryption_manifest.read(a, self.archive, options);
    }

    /// Reads bounded header/spine XML and preserves section ordering and
    /// count disagreement; encrypted entries are explicitly unsupported.
    pub fn inspectStructure(self: *const Document, a: std.mem.Allocator, options: StructureOptions) !StructureReport {
        return document_structure.inspect(a, self.archive, self.manifest, options);
    }

    /// Indexes seven exact-ID header resource groups after protection and
    /// package-header selection. Section references are a separate phase.
    pub fn inspectHeaderResources(self: *const Document, a: std.mem.Allocator, options: HeaderResourceOptions) !HeaderResourceReport {
        const header = try document_structure.plainHeaderEntry(a, self.archive, self.manifest, options.protection);
        return header_resources.read(a, self.archive, header.entry, options.resources);
    }

    /// Builds the bounded structure and explicit header ID inventory, then
    /// links paragraph/run style IDs from all section XML in spine order.
    pub fn inspectReferences(self: *const Document, a: std.mem.Allocator, options: ReferenceOptions) !ReferenceReport {
        var structure = try self.inspectStructure(a, options.structure);
        defer structure.deinit(a);
        var resources = try self.inspectHeaderResources(a, .{ .protection = options.structure.protection, .resources = options.header_resources });
        defer resources.deinit(a);
        return section_references.inspect(a, self.archive, self.manifest, structure.sections, &resources, options.sections);
    }

    /// Streams normalized text and inline XML events from structure-selected
    /// sections in spine order. The report does not materialize an edit model.
    pub fn inspectSectionText(self: *const Document, a: std.mem.Allocator, options: SectionTextOptions, visitor: ?SectionTextVisitor) !SectionTextReport {
        var structure = try self.inspectStructure(a, options.structure);
        defer structure.deinit(a);
        return section_text.inspect(a, self.archive, self.manifest, structure.sections, options.text, visitor);
    }

    /// Materializes the exact package-selected, unencrypted header XML with
    /// every element indexed, including unknown extensions and raw source.
    pub fn readHeaderTree(self: *const Document, a: std.mem.Allocator, options: HeaderTreeOptions) !HeaderTree {
        const selected = try document_structure.plainHeaderEntry(a, self.archive, self.manifest, options.protection);
        const bytes = try self.archive.decode(selected.entry, options.tree.max_xml_bytes);
        defer self.archive.allocator.free(bytes);
        return header_tree.parse(a, bytes, selected.item_index, options.tree);
    }

    /// Materializes one structure-selected section as exact owned XML bytes
    /// plus a namespace-aware index of every element, including unknown ones.
    /// This does not infer display order, style values, or edit semantics.
    pub fn readSectionTree(self: *const Document, a: std.mem.Allocator, section_ordinal: usize, options: SectionTreeOptions) !SectionTree {
        var structure = try self.inspectStructure(a, options.structure);
        defer structure.deinit(a);
        if (section_ordinal >= structure.sections.len) return error.SectionOutOfRange;
        const section = structure.sections[section_ordinal];
        const item = self.manifest.items[section.item_index];
        const entry_index = item.entry_index orelse return error.ExternalSpineXml;
        const bytes = try self.archive.decode(self.archive.entries[entry_index], options.tree.max_xml_bytes);
        defer self.archive.allocator.free(bytes);
        return section_tree.parse(a, bytes, section_ordinal, section.item_index, options.tree);
    }

    /// Resolves selected style, paragraph-shape, and character-shape links
    /// against explicit IDs from the same unencrypted header.
    pub fn inspectHeaderReferences(self: *const Document, a: std.mem.Allocator, options: HeaderReferenceOptions) !HeaderReferenceReport {
        const selected = try document_structure.plainHeaderEntry(a, self.archive, self.manifest, options.protection);
        var resources = try header_resources.read(a, self.archive, selected.entry, options.resources);
        defer resources.deinit(a);
        return header_references.read(a, self.archive, selected.entry, selected.item_index, &resources, options.references);
    }

    /// Indexes exact font IDs independently for seven languages, then checks
    /// direct charPr/fontRef links against the matching language table.
    pub fn inspectFontReferences(self: *const Document, a: std.mem.Allocator, options: FontReferenceOptions) !FontReferenceReport {
        const selected = try document_structure.plainHeaderEntry(a, self.archive, self.manifest, options.protection);
        var faces = try font_faces.read(a, self.archive, selected.entry, options.faces);
        errdefer faces.deinit(a);
        const references = try font_references.read(a, self.archive, selected.entry, selected.item_index, &faces, options.references);
        return .{ .faces = faces, .references = references };
    }

    /// Resolves NUMBER/BULLET heading IDs and list-marker character IDs from
    /// direct header children. OUTLINE is retained as a separate observation.
    pub fn inspectListReferences(self: *const Document, a: std.mem.Allocator, options: ListReferenceOptions) !ListReferenceReport {
        const selected = try document_structure.plainHeaderEntry(a, self.archive, self.manifest, options.protection);
        var resources = try header_resources.read(a, self.archive, selected.entry, options.resources);
        defer resources.deinit(a);
        return list_references.read(a, self.archive, selected.entry, selected.item_index, &resources, options.references);
    }

    /// Links selected header and spine-section binaryItemIDRef strings to
    /// manifest IDs without decoding or fetching the binary resources.
    pub fn inspectBinaryReferences(self: *const Document, a: std.mem.Allocator, options: BinaryReferenceOptions) !BinaryReferenceReport {
        var structure = try self.inspectStructure(a, options.structure);
        defer structure.deinit(a);
        const header = try document_structure.plainHeaderEntry(a, self.archive, self.manifest, options.structure.protection);
        return binary_references.inspect(a, self.archive, self.manifest, header, structure.sections, options.references);
    }

    /// Resolves section chartIDRef ZIP paths and validates each unique chart
    /// XML member's syntax and chartSpace root; this is not chart semantics.
    pub fn inspectChartReferences(self: *const Document, a: std.mem.Allocator, options: ChartReferenceOptions) !ChartReferenceReport {
        var structure = try self.inspectStructure(a, options.structure);
        defer structure.deinit(a);
        return chart_references.inspect(a, self.archive, self.manifest, structure.sections, options.references);
    }

    pub fn deinit(self: *Document, a: std.mem.Allocator) void {
        self.manifest.deinit(a);
        self.container.deinit(a);
        self.archive.deinit();
        self.* = undefined;
    }
};

/// Owns only the entry index. The input archive bytes must outlive this view.
pub fn open(allocator: std.mem.Allocator, bytes: []const u8, options: Options) !Archive {
    var archive = try zip.open(allocator, bytes, options);
    errdefer archive.deinit();
    const mime_entry = archive.find("mimetype") orelse return error.MissingMimeType;
    const content = try archive.decode(mime_entry, mime.len);
    defer allocator.free(content);
    if (!std.mem.eql(u8, content, mime)) return error.InvalidMimeType;
    return archive;
}

/// Validates the OCF package root, OPF item references, and ZIP presence of
/// embedded resources. Section XML semantics remain a later document layer.
pub fn inspectDocument(a: std.mem.Allocator, bytes: []const u8, options: DocumentOptions) !Document {
    var archive = try open(a, bytes, options.zip);
    errdefer archive.deinit();
    var root = try container.read(a, archive, @min(options.max_container_xml_bytes, options.max_total_xml_bytes), options.manifest.max_attribute_bytes);
    errdefer root.deinit(a);
    var manifest_options = options.manifest;
    manifest_options.max_xml_bytes = @min(manifest_options.max_xml_bytes, options.max_total_xml_bytes - root.xml_bytes);
    var manifest = try content_manifest.read(a, archive, root.path, manifest_options);
    errdefer manifest.deinit(a);
    return .{ .archive = archive, .container = root, .manifest = manifest, .decoded_xml_bytes = root.xml_bytes + manifest.xml_bytes };
}
