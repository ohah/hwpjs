const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");
const document_xml = @import("document_xml.zig");
const font_faces = @import("font_faces.zig");
const id_references = @import("id_references.zig");

pub const Report = struct {
    xml_bytes: usize,
    character_shapes: usize = 0,
    font_ref_elements: usize = 0,
    extra_font_ref_elements: usize = 0,
    character_shapes_without_font_ref: usize = 0,
    references: [font_faces.languages.len]id_references.Counts = @splat(.{}),

    pub fn counts(self: *const Report, language: font_faces.Language) *const id_references.Counts {
        return &self.references[@intFromEnum(language)];
    }
};

pub const Options = struct {
    max_xml_bytes: usize = 32 * 1024 * 1024,
    max_attribute_bytes: usize = 4096,
    xml: document_xml.Options = .{},
};

const Context = struct {
    allocator: std.mem.Allocator,
    options: Options,
    faces: *const font_faces.Report,
    item_index: usize,
    report: *Report,
    within_ref_list: bool = false,
    within_char_properties: bool = false,
    active_character_shape: bool = false,
    active_shape_has_font_ref: bool = false,

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        if (tag.kind == .end) {
            if (depth == 4 and self.active_character_shape) {
                if (!self.active_shape_has_font_ref) self.report.character_shapes_without_font_ref += 1;
                self.active_character_shape = false;
            }
            if (depth == 3) self.within_char_properties = false;
            if (depth == 2) self.within_ref_list = false;
            return;
        }
        if (depth == 1) {
            if (!try attrs.element(tag, scope, document_xml.head_uri, "head")) return error.InvalidHeaderRoot;
            return;
        }
        if (depth == 2) {
            self.within_ref_list = tag.kind == .start and try attrs.element(tag, scope, document_xml.head_uri, "refList");
            return;
        }
        if (!self.within_ref_list) return;
        if (depth == 3) {
            self.within_char_properties = tag.kind == .start and try attrs.element(tag, scope, document_xml.head_uri, "charProperties");
            return;
        }
        if (!self.within_char_properties) return;
        if (depth == 4) {
            if (!try attrs.element(tag, scope, document_xml.head_uri, "charPr")) return;
            self.report.character_shapes += 1;
            if (tag.kind == .start) {
                self.active_character_shape = true;
                self.active_shape_has_font_ref = false;
            } else self.report.character_shapes_without_font_ref += 1;
            return;
        }
        if (depth != 5 or !self.active_character_shape or !try attrs.element(tag, scope, document_xml.head_uri, "fontRef")) return;
        if (self.active_shape_has_font_ref) self.report.extra_font_ref_elements += 1;
        self.active_shape_has_font_ref = true;
        self.report.font_ref_elements += 1;
        for (font_faces.languages, font_faces.reference_names) |language, attribute| {
            const value = try attrs.attribute(self.allocator, tag, scope, attribute, self.options.max_attribute_bytes);
            _ = try id_references.note(self.allocator, &self.report.references[@intFromEnum(language)], value, self.faces.table(language), self.item_index);
        }
    }
};

/// Only direct charPr/fontRef elements are linked to per-language ID sets.
/// Incomplete/extra elements remain diagnostics, not invented fallback fonts.
pub fn read(a: std.mem.Allocator, archive: zip.Archive, entry: zip.Entry, item_index: usize, faces: *const font_faces.Report, options: Options) !Report {
    const bytes = try archive.decode(entry, options.max_xml_bytes);
    defer archive.allocator.free(bytes);
    var report: Report = .{ .xml_bytes = bytes.len };
    var context: Context = .{ .allocator = a, .options = options, .faces = faces, .item_index = item_index, .report = &report };
    _ = try document_xml.visitBytes(a, bytes, options.max_xml_bytes, options.xml, .{ .context = &context, .on_tag = Context.onTag });
    return report;
}
