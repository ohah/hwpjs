const std = @import("std");
const version_xml = @import("version_xml.zig");
const protection = @import("encryption_manifest.zig");
const structure = @import("document_structure.zig");
const resources = @import("header_resources.zig");
const section_refs = @import("section_references.zig");
const header_refs = @import("header_references.zig");
const font_faces = @import("font_faces.zig");
const font_refs = @import("font_references.zig");
const list_refs = @import("list_references.zig");
const binary_refs = @import("binary_reference_links.zig");
const masterpage_binary_refs = @import("masterpage_binary_references.zig");
const masterpage_chart_refs = @import("masterpage_chart_references.zig");
const chart_refs = @import("chart_parts.zig");
const section_text = @import("section_text.zig");
const paragraph_metadata = @import("paragraph_metadata.zig");
const paragraph_children = @import("paragraph_children.zig");
const masterpage_paragraph_children = @import("masterpage_paragraph_children.zig");
const line_segments = @import("line_segments.zig");
const masterpage_line_segments = @import("masterpage_line_segments.zig");
const run_metadata = @import("run_metadata.zig");
const run_topology = @import("run_topology.zig");
const text_node = @import("text_node.zig");
const begin_numbers = @import("header_begin_numbers.zig");
const page_geometry = @import("page_geometry.zig");
const section_definition = @import("section_definition.zig");
const section_direct_settings = @import("section_direct_settings.zig");
const section_page_border = @import("section_page_border.zig");
const section_note_shapes = @import("section_note_shapes.zig");
const section_page_border_refs = @import("section_page_border_refs.zig");
const section_definition_refs = @import("section_definition_refs.zig");
const table_geometry = @import("table_geometry.zig");
const payload_integrity = @import("payload_integrity.zig");
const manifest_xml = @import("manifest_xml.zig");
const settings = @import("settings.zig");
const masterpage_references = @import("masterpage_references.zig");
const masterpage_style_references = @import("masterpage_style_references.zig");
const masterpage_table_geometry = @import("masterpage_table_geometry.zig");

/// Results of the currently implemented HWPX inspections only. A successful
/// return does not assert complete schema, semantic or edit/save validity.
pub const Report = struct {
    version: version_xml.Version,
    protection: protection.Report,
    payload_integrity: payload_integrity.Report,
    manifest_xml: manifest_xml.Report,
    settings: settings.Report,
    master_pages: masterpage_references.Report,
    master_page_style_references: masterpage_style_references.Report,
    master_page_run_topology: run_topology.Report,
    master_page_line_segments: masterpage_line_segments.Report,
    master_page_paragraph_children: masterpage_paragraph_children.Report,
    master_page_text_nodes: text_node.Report,
    master_page_text: section_text.MasterReport,
    master_page_binary_references: masterpage_binary_refs.Report,
    master_page_chart_references: masterpage_chart_refs.Report,
    master_page_table_geometry: masterpage_table_geometry.Report,
    structure: structure.Report,
    resources: resources.Report,
    section_references: section_refs.Report,
    header_references: header_refs.Report,
    font_faces: font_faces.Report,
    font_references: font_refs.Report,
    list_references: list_refs.Report,
    binary_references: binary_refs.Report,
    chart_references: chart_refs.Report,
    section_text: section_text.Report,
    paragraph_metadata: paragraph_metadata.Report,
    paragraph_children: paragraph_children.Report,
    line_segments: line_segments.Report,
    run_metadata: run_metadata.Report,
    run_topology: run_topology.Report,
    text_nodes: text_node.Report,
    table_geometry: table_geometry.Report,
    begin_numbers: begin_numbers.Report,
    page_geometry: page_geometry.Report,
    section_definitions: section_definition.Report,
    section_direct_settings: section_direct_settings.Report,
    section_page_borders: section_page_border.Report,
    section_note_shapes: section_note_shapes.Report,
    section_page_border_references: section_page_border_refs.Report,
    section_definition_references: section_definition_refs.Report,

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        self.section_definitions.deinit(a);
        self.section_direct_settings.deinit(a);
        self.section_page_borders.deinit(a);
        self.section_note_shapes.deinit(a);
        self.page_geometry.deinit(a);
        self.begin_numbers.deinit(a);
        self.payload_integrity.deinit(a);
        self.manifest_xml.deinit(a);
        self.settings.deinit(a);
        self.master_pages.deinit(a);
        self.chart_references.deinit(a);
        self.binary_references.deinit(a);
        self.master_page_binary_references.deinit(a);
        self.master_page_chart_references.deinit(a);
        self.font_faces.deinit(a);
        self.resources.deinit(a);
        self.structure.deinit(a);
        self.protection.deinit(a);
        self.version.deinit(a);
        self.* = undefined;
    }
};

/// Composes Document's existing inspection contracts without copying their
/// parsers. Each phase retains its own limits; this is not one global budget.
pub fn inspect(a: std.mem.Allocator, document: anytype, options: anytype) !Report {
    var protection_report = try document.inspectProtection(a, options.protection);
    errdefer protection_report.deinit(a);
    if (protection_report.encrypted_paths.len != 0) return error.EncryptedDocument;
    var payload_report = try document.inspectPayloadIntegrity(a, options.payload_integrity);
    errdefer payload_report.deinit(a);
    var manifest_xml_report = try document.inspectManifestXml(a, options.manifest_xml);
    errdefer manifest_xml_report.deinit(a);
    var settings_report = try document.inspectSettings(a, options.settings);
    errdefer settings_report.deinit(a);
    var master_page_report = try document.inspectMasterPages(a, options.master_pages);
    errdefer master_page_report.deinit(a);
    const master_page_text_report = try section_text.inspectMasterPages(a, document.archive, master_page_report.parts.parts, options.master_page_text, null);
    var master_page_binary_report = try masterpage_binary_refs.inspect(a, document.archive, document.manifest, master_page_report.parts.parts, options.master_page_binary_references);
    errdefer master_page_binary_report.deinit(a);
    var master_page_chart_report = try masterpage_chart_refs.inspect(a, document.archive, master_page_report.parts.parts, options.master_page_chart_references, .{});
    errdefer master_page_chart_report.deinit(a);
    const master_page_line_segment_report = try masterpage_line_segments.inspect(a, document.archive, master_page_report.parts.parts, options.master_page_line_segments);
    const master_page_paragraph_children_report = try masterpage_paragraph_children.inspect(a, document.archive, master_page_report.parts.parts, options.master_page_paragraph_children);
    var version = try document.inspectVersion(a, options.version);
    errdefer version.deinit(a);
    var structure_report = try document.inspectStructure(a, options.structure);
    errdefer structure_report.deinit(a);
    var resource_report = try document.inspectHeaderResources(a, options.header_resources);
    errdefer resource_report.deinit(a);
    const master_page_table_report = try masterpage_table_geometry.inspect(a, document.archive, master_page_report.parts.parts, resource_report.table(.border_fill), options.master_page_table_geometry, .{});
    const master_page_style_report = try document.inspectMasterPageStyleReferences(a, .{ .master_pages = options.master_pages, .header_resources = options.header_resources, .references = options.master_page_style_references });
    const master_page_run_topology_report = try document.inspectMasterPageRunTopology(a, .{ .master_pages = options.master_pages, .topology = options.master_page_run_topology });
    const master_page_text_nodes_report = try document.inspectMasterPageTextNodes(a, .{ .master_pages = options.master_pages, .text_nodes = options.master_page_text_nodes });
    const section_ref_report = try document.inspectReferences(a, options.section_references);
    const header_ref_report = try document.inspectHeaderReferences(a, options.header_references);
    var fonts = try document.inspectFontReferences(a, options.font_references);
    errdefer fonts.deinit(a);
    const list_ref_report = try document.inspectListReferences(a, options.list_references);
    var binary_ref_report = try document.inspectBinaryReferences(a, options.binary_references);
    errdefer binary_ref_report.deinit(a);
    var chart_ref_report = try document.inspectChartReferences(a, options.chart_references);
    errdefer chart_ref_report.deinit(a);
    const text_report = try document.inspectSectionText(a, options.section_text, null);
    const semantic = blk: {
        var trees = try document.readXmlTrees(a, options.trees);
        defer trees.deinit(a);
        var begin_report = try trees.inspectBeginNumbers(a, options.begin_numbers);
        errdefer begin_report.deinit(a);
        var page_report = try trees.inspectPageGeometry(a, options.page_geometry);
        errdefer page_report.deinit(a);
        var section_definition_report = try trees.inspectSectionDefinitions(a, options.section_definitions);
        errdefer section_definition_report.deinit(a);
        var section_direct_settings_report = try trees.inspectSectionDirectSettings(a, options.section_direct_settings);
        errdefer section_direct_settings_report.deinit(a);
        var section_page_border_report = try trees.inspectSectionPageBorders(a, options.section_page_borders);
        errdefer section_page_border_report.deinit(a);
        var section_note_shape_report = try trees.inspectSectionNoteShapes(a, options.section_note_shapes);
        errdefer section_note_shape_report.deinit(a);
        const section_page_border_ref_report = try section_page_border_refs.inspect(&section_page_border_report, resource_report.table(.border_fill));
        const section_definition_ref_report = try section_definition_refs.inspect(&section_definition_report, &resource_report);
        const paragraph_report = try trees.inspectParagraphMetadata(a, options.paragraph_metadata);
        const paragraph_children_report = try trees.inspectParagraphChildren(options.paragraph_children);
        const line_segment_report = try trees.inspectLineSegments(a, options.line_segments);
        const run_report = try trees.inspectRunMetadata(a, options.run_metadata);
        const topology_report = try trees.inspectRunTopology(a, options.run_topology);
        const text_nodes_report = try trees.inspectTextNodes(a, options.text_nodes);
        const table_report = try trees.inspectTableGeometryWithBorderFills(a, options.table_geometry, resource_report.table(.border_fill));
        break :blk .{ .begin = begin_report, .page = page_report, .section_definitions = section_definition_report, .section_direct_settings = section_direct_settings_report, .section_page_borders = section_page_border_report, .section_note_shapes = section_note_shape_report, .section_page_border_references = section_page_border_ref_report, .section_definition_references = section_definition_ref_report, .paragraph = paragraph_report, .paragraph_children = paragraph_children_report, .line_segments = line_segment_report, .run = run_report, .topology = topology_report, .text_nodes = text_nodes_report, .table_geometry = table_report };
    };
    return .{
        .version = version,
        .protection = protection_report,
        .payload_integrity = payload_report,
        .manifest_xml = manifest_xml_report,
        .settings = settings_report,
        .master_pages = master_page_report,
        .master_page_style_references = master_page_style_report,
        .master_page_run_topology = master_page_run_topology_report,
        .master_page_line_segments = master_page_line_segment_report,
        .master_page_paragraph_children = master_page_paragraph_children_report,
        .master_page_text_nodes = master_page_text_nodes_report,
        .master_page_text = master_page_text_report,
        .master_page_binary_references = master_page_binary_report,
        .master_page_chart_references = master_page_chart_report,
        .master_page_table_geometry = master_page_table_report,
        .structure = structure_report,
        .resources = resource_report,
        .section_references = section_ref_report,
        .header_references = header_ref_report,
        .font_faces = fonts.faces,
        .font_references = fonts.references,
        .list_references = list_ref_report,
        .binary_references = binary_ref_report,
        .chart_references = chart_ref_report,
        .section_text = text_report,
        .paragraph_metadata = semantic.paragraph,
        .paragraph_children = semantic.paragraph_children,
        .line_segments = semantic.line_segments,
        .run_metadata = semantic.run,
        .run_topology = semantic.topology,
        .text_nodes = semantic.text_nodes,
        .table_geometry = semantic.table_geometry,
        .begin_numbers = semantic.begin,
        .page_geometry = semantic.page,
        .section_definitions = semantic.section_definitions,
        .section_direct_settings = semantic.section_direct_settings,
        .section_page_borders = semantic.section_page_borders,
        .section_note_shapes = semantic.section_note_shapes,
        .section_page_border_references = semantic.section_page_border_references,
        .section_definition_references = semantic.section_definition_references,
    };
}
