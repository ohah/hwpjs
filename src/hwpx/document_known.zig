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
const chart_refs = @import("chart_parts.zig");
const section_text = @import("section_text.zig");
const paragraph_metadata = @import("paragraph_metadata.zig");
const begin_numbers = @import("header_begin_numbers.zig");
const payload_integrity = @import("payload_integrity.zig");
const manifest_xml = @import("manifest_xml.zig");
const settings = @import("settings.zig");
const masterpage_references = @import("masterpage_references.zig");
const masterpage_style_references = @import("masterpage_style_references.zig");

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
    begin_numbers: begin_numbers.Report,

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        self.begin_numbers.deinit(a);
        self.payload_integrity.deinit(a);
        self.manifest_xml.deinit(a);
        self.settings.deinit(a);
        self.master_pages.deinit(a);
        self.chart_references.deinit(a);
        self.binary_references.deinit(a);
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
    var version = try document.inspectVersion(a, options.version);
    errdefer version.deinit(a);
    var structure_report = try document.inspectStructure(a, options.structure);
    errdefer structure_report.deinit(a);
    var resource_report = try document.inspectHeaderResources(a, options.header_resources);
    errdefer resource_report.deinit(a);
    const master_page_style_report = try document.inspectMasterPageStyleReferences(a, .{ .master_pages = options.master_pages, .header_resources = options.header_resources, .references = options.master_page_style_references });
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
        const paragraph_report = try trees.inspectParagraphMetadata(a, options.paragraph_metadata);
        break :blk .{ .begin = begin_report, .paragraph = paragraph_report };
    };
    return .{
        .version = version,
        .protection = protection_report,
        .payload_integrity = payload_report,
        .manifest_xml = manifest_xml_report,
        .settings = settings_report,
        .master_pages = master_page_report,
        .master_page_style_references = master_page_style_report,
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
        .begin_numbers = semantic.begin,
    };
}
