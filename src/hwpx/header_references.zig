const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");
const document_xml = @import("document_xml.zig");
const header_resources = @import("header_resources.zig");
const id_references = @import("id_references.zig");

pub const Kind = enum(u8) {
    style_paragraph_shape,
    style_character_shape,
    style_next_style,
    paragraph_tab,
    paragraph_border_fill,
    character_border_fill,
};

pub const Report = struct {
    xml_bytes: usize,
    styles: usize = 0,
    paragraph_shapes: usize = 0,
    character_shapes: usize = 0,
    paragraph_border_elements: usize = 0,
    paragraphs_without_border_element: usize = 0,
    character_styles: usize = 0,
    character_style_missing_paragraph_shape: usize = 0,
    character_style_missing_next_style: usize = 0,
    references: [6]id_references.Counts = @splat(.{}),

    pub fn counts(self: *const Report, kind: Kind) *const id_references.Counts {
        return &self.references[@intFromEnum(kind)];
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
    resources: *const header_resources.Report,
    item_index: usize,
    report: *Report,
    within_ref_list: bool = false,
    group: ?header_resources.Kind = null,
    active_paragraph: bool = false,
    active_paragraph_has_border: bool = false,

    fn note(self: *Context, kind: Kind, tag: xml.tags.Tag, scope: *const xml.namespaces.State, attribute: []const u8, table_kind: header_resources.Kind) !id_references.Outcome {
        const value = try attrs.attribute(self.allocator, tag, scope, attribute, self.options.max_attribute_bytes);
        return id_references.note(self.allocator, &self.report.references[@intFromEnum(kind)], value, self.resources.table(table_kind), self.item_index);
    }

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        if (tag.kind == .end) {
            if (depth == 4 and self.group == .para_shape and self.active_paragraph) {
                if (!self.active_paragraph_has_border) self.report.paragraphs_without_border_element += 1;
                self.active_paragraph = false;
            }
            if (depth == 3) self.group = null;
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
            self.group = null;
            if (try attrs.element(tag, scope, document_xml.head_uri, "styles")) self.group = .style;
            if (try attrs.element(tag, scope, document_xml.head_uri, "paraProperties")) self.group = .para_shape;
            if (try attrs.element(tag, scope, document_xml.head_uri, "charProperties")) self.group = .char_shape;
            return;
        }
        const group = self.group orelse return;
        if (depth == 4) {
            switch (group) {
                .style => {
                    if (!try attrs.element(tag, scope, document_xml.head_uri, "style")) return;
                    self.report.styles += 1;
                    const paragraph = try self.note(.style_paragraph_shape, tag, scope, "paraPrIDRef", .para_shape);
                    _ = try self.note(.style_character_shape, tag, scope, "charPrIDRef", .char_shape);
                    const next = try self.note(.style_next_style, tag, scope, "nextStyleIDRef", .style);
                    const style_type = try attrs.attribute(self.allocator, tag, scope, "type", self.options.max_attribute_bytes);
                    defer if (style_type) |value| self.allocator.free(value);
                    if (style_type) |value| {
                        if (std.mem.eql(u8, value, "CHAR")) {
                            self.report.character_styles += 1;
                            if (paragraph == .missing_target) self.report.character_style_missing_paragraph_shape += 1;
                            if (next == .missing_target) self.report.character_style_missing_next_style += 1;
                        }
                    }
                },
                .para_shape => {
                    if (!try attrs.element(tag, scope, document_xml.head_uri, "paraPr")) return;
                    self.report.paragraph_shapes += 1;
                    _ = try self.note(.paragraph_tab, tag, scope, "tabPrIDRef", .tab);
                    if (tag.kind == .start) {
                        self.active_paragraph = true;
                        self.active_paragraph_has_border = false;
                    } else self.report.paragraphs_without_border_element += 1;
                },
                .char_shape => {
                    if (!try attrs.element(tag, scope, document_xml.head_uri, "charPr")) return;
                    self.report.character_shapes += 1;
                    _ = try self.note(.character_border_fill, tag, scope, "borderFillIDRef", .border_fill);
                },
                else => {},
            }
            return;
        }
        if (depth == 5 and group == .para_shape and self.active_paragraph and try attrs.element(tag, scope, document_xml.head_uri, "border")) {
            self.active_paragraph_has_border = true;
            self.report.paragraph_border_elements += 1;
            _ = try self.note(.paragraph_border_fill, tag, scope, "borderFillIDRef", .border_fill);
        }
    }
};

/// Re-reads the exact selected header after the ID inventory has been built.
/// Only six direct resource links are inspected, not arbitrary descendant
/// attributes or all schema constraints.
pub fn read(a: std.mem.Allocator, archive: zip.Archive, entry: zip.Entry, item_index: usize, resources: *const header_resources.Report, options: Options) !Report {
    const bytes = try archive.decode(entry, options.max_xml_bytes);
    defer a.free(bytes);
    var report: Report = .{ .xml_bytes = bytes.len };
    var context: Context = .{ .allocator = a, .options = options, .resources = resources, .item_index = item_index, .report = &report };
    _ = try document_xml.visitBytes(a, bytes, options.max_xml_bytes, options.xml, .{ .context = &context, .on_tag = Context.onTag });
    return report;
}
