const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");
const document_xml = @import("document_xml.zig");
const header_resources = @import("header_resources.zig");
const id_references = @import("id_references.zig");

pub const Report = struct {
    xml_bytes: usize,
    paragraph_shapes: usize = 0,
    headings: usize = 0,
    paragraphs_without_heading: usize = 0,
    extra_headings: usize = 0,
    heading_none: usize = 0,
    heading_outline: usize = 0,
    heading_number: id_references.Counts = .{},
    heading_bullet: id_references.Counts = .{},
    heading_type_absent: usize = 0,
    /// NONE and OUTLINE are not linked to a numbering/bullet ID table here.
    unlinked_id_absent: usize = 0,
    unlinked_id_nonzero: usize = 0,
    numbering_para_heads: usize = 0,
    bullet_para_heads: usize = 0,
    numbering_character: id_references.Counts = .{},
    bullet_character: id_references.Counts = .{},
    /// Observed UINT_MAX marker, retained separately from a real character ID.
    numbering_character_max_marker: usize = 0,
    bullet_character_max_marker: usize = 0,
};

pub const Options = struct {
    max_xml_bytes: usize = 32 * 1024 * 1024,
    max_attribute_bytes: usize = 4096,
    xml: document_xml.Options = .{},
};

const Group = enum { paragraph, numbering, bullet };

const Context = struct {
    allocator: std.mem.Allocator,
    options: Options,
    resources: *const header_resources.Report,
    item_index: usize,
    report: *Report,
    within_ref_list: bool = false,
    group: ?Group = null,
    active_item: bool = false,
    active_paragraph_has_heading: bool = false,

    fn noteHeading(self: *Context, tag: xml.tags.Tag, scope: *const xml.namespaces.State) !void {
        const raw_type = try attrs.attribute(self.allocator, tag, scope, "type", self.options.max_attribute_bytes);
        defer if (raw_type) |value| self.allocator.free(value);
        if (raw_type) |value| {
            if (std.mem.eql(u8, value, "NUMBER")) {
                _ = try id_references.note(self.allocator, &self.report.heading_number, try attrs.attribute(self.allocator, tag, scope, "idRef", self.options.max_attribute_bytes), self.resources.table(.numbering), self.item_index);
                return;
            }
            if (std.mem.eql(u8, value, "BULLET")) {
                _ = try id_references.note(self.allocator, &self.report.heading_bullet, try attrs.attribute(self.allocator, tag, scope, "idRef", self.options.max_attribute_bytes), self.resources.table(.bullet), self.item_index);
                return;
            }
            if (std.mem.eql(u8, value, "NONE")) self.report.heading_none += 1 else if (std.mem.eql(u8, value, "OUTLINE")) self.report.heading_outline += 1 else return error.InvalidHeadingType;
        } else self.report.heading_type_absent += 1;
        // Do not infer that OUTLINE idRef=0 means numbering ID 0 or 1.
        const raw_id = try attrs.attribute(self.allocator, tag, scope, "idRef", self.options.max_attribute_bytes);
        defer if (raw_id) |value| self.allocator.free(value);
        if (raw_id) |value| {
            const id = std.fmt.parseInt(u32, value, 10) catch return error.InvalidResourceReferenceId;
            if (id != 0) self.report.unlinked_id_nonzero += 1;
        } else self.report.unlinked_id_absent += 1;
    }

    fn noteParaHead(self: *Context, tag: xml.tags.Tag, scope: *const xml.namespaces.State, group: Group) !void {
        const raw_id = try attrs.attribute(self.allocator, tag, scope, "charPrIDRef", self.options.max_attribute_bytes);
        if (raw_id) |value| {
            const id = std.fmt.parseInt(u32, value, 10) catch {
                self.allocator.free(value);
                return error.InvalidResourceReferenceId;
            };
            if (id == std.math.maxInt(u32) and !self.resources.table(.char_shape).hasId(id)) {
                self.allocator.free(value);
                if (group == .numbering) self.report.numbering_character_max_marker += 1 else self.report.bullet_character_max_marker += 1;
                return;
            }
        }
        const counts = if (group == .numbering) &self.report.numbering_character else &self.report.bullet_character;
        _ = try id_references.note(self.allocator, counts, raw_id, self.resources.table(.char_shape), self.item_index);
    }

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        if (tag.kind == .end) {
            if (depth == 4) {
                if (self.group == .paragraph and self.active_item and !self.active_paragraph_has_heading) self.report.paragraphs_without_heading += 1;
                self.active_item = false;
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
            if (tag.kind != .start) return;
            if (try attrs.element(tag, scope, document_xml.head_uri, "paraProperties")) self.group = .paragraph;
            if (try attrs.element(tag, scope, document_xml.head_uri, "numberings")) self.group = .numbering;
            if (try attrs.element(tag, scope, document_xml.head_uri, "bullets")) self.group = .bullet;
            return;
        }
        const group = self.group orelse return;
        if (depth == 4) {
            const name: []const u8 = switch (group) {
                .paragraph => "paraPr",
                .numbering => "numbering",
                .bullet => "bullet",
            };
            const matches = try attrs.element(tag, scope, document_xml.head_uri, name);
            self.active_item = tag.kind == .start and matches;
            if (!matches) return;
            if (group == .paragraph) {
                self.report.paragraph_shapes += 1;
                self.active_paragraph_has_heading = false;
                if (tag.kind == .empty) self.report.paragraphs_without_heading += 1;
            }
            return;
        }
        if (depth != 5 or !self.active_item) return;
        if (group == .paragraph) {
            if (!try attrs.element(tag, scope, document_xml.head_uri, "heading")) return;
            self.report.headings += 1;
            if (self.active_paragraph_has_heading) self.report.extra_headings += 1;
            self.active_paragraph_has_heading = true;
            try self.noteHeading(tag, scope);
            return;
        }
        if (!try attrs.element(tag, scope, document_xml.head_uri, "paraHead")) return;
        if (group == .numbering) self.report.numbering_para_heads += 1 else self.report.bullet_para_heads += 1;
        try self.noteParaHead(tag, scope, group);
    }
};

/// Checks typed list-definition links only. OUTLINE's idRef is observed but
/// not guessed to address the ordinary numbering table.
pub fn read(a: std.mem.Allocator, archive: zip.Archive, entry: zip.Entry, item_index: usize, resources: *const header_resources.Report, options: Options) !Report {
    const bytes = try archive.decode(entry, options.max_xml_bytes);
    defer a.free(bytes);
    var report: Report = .{ .xml_bytes = bytes.len };
    var context: Context = .{ .allocator = a, .options = options, .resources = resources, .item_index = item_index, .report = &report };
    _ = try document_xml.visitBytes(a, bytes, options.max_xml_bytes, options.xml, .{ .context = &context, .on_tag = Context.onTag });
    return report;
}
