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
const compatibility_selection = @import("compatibility_selection.zig");
const section_text = @import("section_text.zig");
const header_tree = @import("header_tree.zig");
const section_tree = @import("section_tree.zig");
const document_trees = @import("document_trees.zig");
const paragraph_metadata = @import("paragraph_metadata.zig");
const paragraph_children = @import("paragraph_children.zig");
const run_metadata = @import("run_metadata.zig");
const run_topology = @import("run_topology.zig");
const switch_shape = @import("switch_shape.zig");
const text_node = @import("text_node.zig");
const tab_attributes = @import("tab_attributes.zig");
const markpen_attributes = @import("markpen_attributes.zig");
const title_mark_attributes = @import("title_mark_attributes.zig");
const track_change_tag_attributes = @import("track_change_tag_attributes.zig");
const header_begin_numbers = @import("header_begin_numbers.zig");
const document_known = @import("document_known.zig");
const table_geometry = @import("table_geometry.zig");
const table_attributes = @import("table_attributes.zig");
const table_children = @import("table_children.zig");
const table_shape = @import("table_shape.zig");
const table_child_topology = @import("table_child_topology.zig");
const table_cell_fields = @import("table_cell_fields.zig");
const table_cell_sub_lists = @import("table_cell_sub_lists.zig");
const payload_integrity = @import("payload_integrity.zig");
const manifest_xml = @import("manifest_xml.zig");
const settings = @import("settings.zig");
const masterpage_references = @import("masterpage_references.zig");
const masterpage_style_references = @import("masterpage_style_references.zig");

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
pub const BranchPolicy = compatibility_selection.Policy;
pub const SelectedReferencesOptions = struct {
    supported_namespaces: []const []const u8 = &.{},
    binary: BinaryReferenceOptions = .{},
    chart: ChartReferenceOptions = .{},
};
pub const SelectedReferencesReport = struct {
    binary: BinaryReferenceReport,
    chart: ChartReferenceReport,

    pub fn deinit(self: *SelectedReferencesReport, a: std.mem.Allocator) void {
        self.chart.deinit(a);
        self.binary.deinit(a);
        self.* = undefined;
    }
};
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
pub const HeaderTreeOptions = document_trees.HeaderOptions;
pub const SectionTreeOptions = document_trees.SectionOptions;
pub const XmlTrees = document_trees.Bundle;
pub const XmlTreesOptions = document_trees.AllOptions;
pub const ParagraphMetadataOptions = paragraph_metadata.Options;
pub const ParagraphMetadataReport = paragraph_metadata.Report;
pub const ParagraphChildrenOptions = paragraph_children.Options;
pub const ParagraphChildrenReport = paragraph_children.Report;
pub const RunMetadataOptions = run_metadata.Options;
pub const RunMetadataReport = run_metadata.Report;
pub const RunTopologyOptions = run_topology.Options;
pub const RunTopologyReport = run_topology.Report;
pub const SwitchShapeReport = switch_shape.Report;
pub const RunTopologyChildClass = run_topology.ChildClass;
pub const RunTopologyLocation = run_topology.Location;
pub const TextNodeOptions = text_node.Options;
pub const TextNodeReport = text_node.Report;
pub const TextNodeChildClass = text_node.ChildClass;
pub const TextNodeLocation = text_node.Location;
pub const TabAttributeReport = tab_attributes.Report;
pub const MarkpenAttributeReport = markpen_attributes.Report;
pub const TitleMarkAttributeReport = title_mark_attributes.Report;
pub const TrackChangeTagAttributeReport = track_change_tag_attributes.Report;
pub const BeginNumberOptions = header_begin_numbers.Options;
pub const BeginNumberReport = header_begin_numbers.Report;
pub const BeginNumberField = header_begin_numbers.Field;
pub const KnownReport = document_known.Report;
pub const TableGeometryOptions = table_geometry.Options;
pub const TableGeometryReport = table_geometry.Report;
pub const TableAttributesReport = table_attributes.Report;
pub const TableChildrenReport = table_children.Report;
pub const TableShapeReport = table_shape.Report;
pub const TableChildTopologyReport = table_child_topology.Report;
pub const TableCellFieldsReport = table_cell_fields.Report;
pub const TableCellSubListsReport = table_cell_sub_lists.Report;
pub const PayloadIntegrityOptions = payload_integrity.Options;
pub const PayloadIntegrityReport = payload_integrity.Report;
pub const ManifestXmlOptions = manifest_xml.Options;
pub const ManifestXmlReport = manifest_xml.Report;
pub const SettingsOptions = struct {
    protection: ProtectionOptions = .{},
    values: settings.Options = .{},
};
pub const SettingsReport = settings.Report;
pub const MasterPageOptions = struct {
    protection: ProtectionOptions = .{},
    structure: StructureOptions = .{},
    references: masterpage_references.Options = .{},
};
pub const MasterPageReport = masterpage_references.Report;
pub const MasterPageStyleReferenceOptions = struct {
    master_pages: MasterPageOptions = .{},
    header_resources: HeaderResourceOptions = .{},
    references: masterpage_style_references.Options = .{},
};
pub const MasterPageStyleReferenceReport = masterpage_style_references.Report;
pub const MasterPageRunTopologyOptions = struct {
    master_pages: MasterPageOptions = .{},
    topology: run_topology.MasterOptions = .{},
};
pub const MasterPageTextNodeOptions = struct {
    master_pages: MasterPageOptions = .{},
    text_nodes: text_node.MasterOptions = .{},
};
pub const KnownOptions = struct {
    version: VersionOptions = .{},
    protection: ProtectionOptions = .{},
    payload_integrity: PayloadIntegrityOptions = .{},
    manifest_xml: ManifestXmlOptions = .{},
    settings: SettingsOptions = .{},
    master_pages: MasterPageOptions = .{},
    master_page_style_references: masterpage_style_references.Options = .{},
    master_page_run_topology: run_topology.MasterOptions = .{},
    master_page_text_nodes: text_node.MasterOptions = .{},
    structure: StructureOptions = .{},
    header_resources: HeaderResourceOptions = .{},
    section_references: ReferenceOptions = .{},
    header_references: HeaderReferenceOptions = .{},
    font_references: FontReferenceOptions = .{},
    list_references: ListReferenceOptions = .{},
    binary_references: BinaryReferenceOptions = .{},
    chart_references: ChartReferenceOptions = .{},
    section_text: SectionTextOptions = .{},
    trees: XmlTreesOptions = .{},
    paragraph_metadata: ParagraphMetadataOptions = .{},
    paragraph_children: ParagraphChildrenOptions = .{},
    run_metadata: RunMetadataOptions = .{},
    run_topology: RunTopologyOptions = .{},
    text_nodes: TextNodeOptions = .{},
    table_geometry: TableGeometryOptions = .{},
    begin_numbers: BeginNumberOptions = .{},
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

    /// Checks the actual decompression, size and CRC of every ZIP entry,
    /// including parts outside the OPF manifest. Does not parse their format.
    pub fn inspectPayloadIntegrity(self: *const Document, a: std.mem.Allocator, options: PayloadIntegrityOptions) !PayloadIntegrityReport {
        return payload_integrity.inspect(a, self.archive, self.manifest.items, options);
    }

    /// Validates syntax and namespaces for every OPF application/xml item,
    /// including settings and master pages not selected by the spine.
    pub fn inspectManifestXml(self: *const Document, a: std.mem.Allocator, options: ManifestXmlOptions) !ManifestXmlReport {
        return manifest_xml.inspect(a, self.archive, self.manifest.items, options);
    }

    /// Reads the exact settings.xml part and preserves optional caret/config
    /// values. The encrypted-document boundary is checked before decoding.
    pub fn inspectSettings(self: *const Document, a: std.mem.Allocator, options: SettingsOptions) !SettingsReport {
        var protection_report = try self.inspectProtection(a, options.protection);
        defer protection_report.deinit(a);
        if (protection_report.encrypted_paths.len != 0) return error.EncryptedDocument;
        return settings.inspect(a, self.archive, self.manifest.items, options.values);
    }

    /// Parses declared master-page parts and links section idRef values to
    /// their exact root IDs. Unresolved links stay explicit in the report.
    pub fn inspectMasterPages(self: *const Document, a: std.mem.Allocator, options: MasterPageOptions) !MasterPageReport {
        var protection_report = try self.inspectProtection(a, options.protection);
        defer protection_report.deinit(a);
        if (protection_report.encrypted_paths.len != 0) return error.EncryptedDocument;
        var section_structure = try self.inspectStructure(a, options.structure);
        defer section_structure.deinit(a);
        return masterpage_references.inspect(a, self.archive, self.manifest, section_structure.sections, options.references);
    }

    /// Resolves paragraph and run formatting links inside root-direct master
    /// page subLists. The master-page part and header ID inventory stay separate.
    pub fn inspectMasterPageStyleReferences(self: *const Document, a: std.mem.Allocator, options: MasterPageStyleReferenceOptions) !MasterPageStyleReferenceReport {
        var pages = try self.inspectMasterPages(a, options.master_pages);
        defer pages.deinit(a);
        var resources = try self.inspectHeaderResources(a, options.header_resources);
        defer resources.deinit(a);
        return masterpage_style_references.inspect(a, self.archive, pages.parts.parts, &resources, options.references);
    }

    /// Observes run parent/child shape inside selected master-page subLists.
    /// Late secPr and model-unlisted children remain diagnostics, not errors.
    pub fn inspectMasterPageRunTopology(self: *const Document, a: std.mem.Allocator, options: MasterPageRunTopologyOptions) !RunTopologyReport {
        var pages = try self.inspectMasterPages(a, options.master_pages);
        defer pages.deinit(a);
        return run_topology.inspectMasterPages(a, self.archive, pages.parts.parts, options.topology);
    }

    /// Observes raw hp:t attributes and direct child names in selected master pages.
    pub fn inspectMasterPageTextNodes(self: *const Document, a: std.mem.Allocator, options: MasterPageTextNodeOptions) !TextNodeReport {
        var pages = try self.inspectMasterPages(a, options.master_pages);
        defer pages.deinit(a);
        return text_node.inspectMasterPages(a, self.archive, pages.parts.parts, options.text_nodes);
    }

    /// Runs all currently exposed HWPX inspections on this document. A
    /// returned report still has unresolved diagnostics and unsupported
    /// schema/semantic fields; it is not a whole-document validity proof.
    pub fn inspectKnown(self: *const Document, a: std.mem.Allocator, options: KnownOptions) !KnownReport {
        return document_known.inspect(a, self, options);
    }

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

    /// Resolves paragraph/run style references only in caller-supported
    /// switch branches. inspectReferences remains the raw all-branches view.
    pub fn inspectSelectedStyleReferences(self: *const Document, a: std.mem.Allocator, options: ReferenceOptions, supported_namespaces: []const []const u8) !ReferenceReport {
        var selected_options = options;
        selected_options.sections.branch_policy = .{ .mode = .selected, .supported_namespaces = supported_namespaces };
        return self.inspectReferences(a, selected_options);
    }

    /// Streams normalized text and inline XML events from structure-selected
    /// sections in spine order. The report does not materialize an edit model.
    pub fn inspectSectionText(self: *const Document, a: std.mem.Allocator, options: SectionTextOptions, visitor: ?SectionTextVisitor) !SectionTextReport {
        var structure = try self.inspectStructure(a, options.structure);
        defer structure.deinit(a);
        return section_text.inspect(a, self.archive, self.manifest, structure.sections, options.text, visitor);
    }

    /// Streams only text events in the branches supported by the caller.
    /// The default inspectSectionText remains an all-branches raw view.
    pub fn inspectSelectedSectionText(self: *const Document, a: std.mem.Allocator, options: SectionTextOptions, supported_namespaces: []const []const u8, visitor: ?SectionTextVisitor) !SectionTextReport {
        var selected_options = options;
        selected_options.text.branch_policy = .{ .mode = .selected, .supported_namespaces = supported_namespaces };
        return self.inspectSectionText(a, selected_options, visitor);
    }

    /// Materializes the exact package-selected, unencrypted header XML with
    /// every element indexed, including unknown extensions and raw source.
    pub fn readHeaderTree(self: *const Document, a: std.mem.Allocator, options: HeaderTreeOptions) !HeaderTree {
        return document_trees.readHeader(a, self.archive, self.manifest, options);
    }

    /// Materializes one structure-selected section as exact owned XML bytes
    /// plus a namespace-aware index of every element, including unknown ones.
    /// This does not infer display order, style values, or edit semantics.
    pub fn readSectionTree(self: *const Document, a: std.mem.Allocator, section_ordinal: usize, options: SectionTreeOptions) !SectionTree {
        return document_trees.readSection(a, self.archive, self.manifest, section_ordinal, options);
    }

    /// Owns all selected header and section XML trees in spine order after one
    /// structure inspection. Non-XML parts and semantic references are not
    /// materialized or validated by this API.
    pub fn readXmlTrees(self: *const Document, a: std.mem.Allocator, options: XmlTreesOptions) !XmlTrees {
        return document_trees.readAll(a, self.archive, self.manifest, options);
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

    /// Applies one caller-declared namespace capability set to both reference
    /// scanners. The existing individual/default inspections stay raw.
    pub fn inspectSelectedReferences(self: *const Document, a: std.mem.Allocator, options: SelectedReferencesOptions) !SelectedReferencesReport {
        const policy: BranchPolicy = .{ .mode = .selected, .supported_namespaces = options.supported_namespaces };
        try compatibility_selection.validate(policy);
        var binary_options = options.binary;
        binary_options.references.branch_policy = policy;
        var chart_options = options.chart;
        chart_options.references.sections.branch_policy = policy;
        var binary_report = try self.inspectBinaryReferences(a, binary_options);
        errdefer binary_report.deinit(a);
        const chart_report = try self.inspectChartReferences(a, chart_options);
        return .{ .binary = binary_report, .chart = chart_report };
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
