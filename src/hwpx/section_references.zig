const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");
const document_xml = @import("document_xml.zig");
const content_manifest = @import("content_manifest.zig");
const document_structure = @import("document_structure.zig");
const header_resources = @import("header_resources.zig");
const id_references = @import("id_references.zig");

pub const Kind = enum(u8) { paragraph_shape, style, character_shape };
pub const Counts = id_references.Counts;

pub const Report = struct {
    sections: usize,
    paragraphs: usize = 0,
    non_direct_paragraphs: usize = 0,
    runs: usize = 0,
    non_direct_runs: usize = 0,
    decoded_xml_bytes: usize = 0,
    references: [3]Counts = @splat(.{}),

    pub fn counts(self: *const Report, kind: Kind) *const Counts {
        return &self.references[@intFromEnum(kind)];
    }
};

pub const Options = struct {
    max_section_xml_bytes: usize = 128 * 1024 * 1024,
    max_total_section_xml_bytes: usize = 256 * 1024 * 1024,
    max_attribute_bytes: usize = 4096,
    max_paragraphs: usize = 2_000_000,
    max_runs: usize = 4_000_000,
    xml: document_xml.Options = .{},
};

const Context = struct {
    allocator: std.mem.Allocator,
    options: Options,
    resources: *const header_resources.Report,
    report: *Report,
    item_index: usize,
    paragraph_depths: std.ArrayList(usize) = .empty,

    fn deinit(self: *Context) void {
        self.paragraph_depths.deinit(self.allocator);
    }

    fn note(self: *Context, kind: Kind, raw_id: ?[]u8, table_kind: header_resources.Kind) !void {
        _ = try id_references.note(self.allocator, &self.report.references[@intFromEnum(kind)], raw_id, self.resources.table(table_kind), self.item_index);
    }

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        if (tag.kind == .end) {
            if (self.paragraph_depths.items.len != 0 and self.paragraph_depths.items[self.paragraph_depths.items.len - 1] == depth) {
                _ = self.paragraph_depths.pop();
            }
            return;
        }
        if (depth == 1) {
            if (!try attrs.element(tag, scope, document_xml.section_uri, "sec")) return error.InvalidSectionRoot;
            return;
        }
        if (try attrs.element(tag, scope, document_xml.paragraph_uri, "p")) {
            if (self.report.paragraphs == self.options.max_paragraphs) return error.LimitExceeded;
            self.report.paragraphs += 1;
            if (depth != 2) self.report.non_direct_paragraphs += 1;
            try self.note(.paragraph_shape, try attrs.attribute(self.allocator, tag, scope, "paraPrIDRef", self.options.max_attribute_bytes), .para_shape);
            try self.note(.style, try attrs.attribute(self.allocator, tag, scope, "styleIDRef", self.options.max_attribute_bytes), .style);
            if (tag.kind == .start) try self.paragraph_depths.append(self.allocator, depth);
            return;
        }
        if (try attrs.element(tag, scope, document_xml.paragraph_uri, "run")) {
            if (self.report.runs == self.options.max_runs) return error.LimitExceeded;
            self.report.runs += 1;
            if (self.paragraph_depths.items.len == 0 or self.paragraph_depths.items[self.paragraph_depths.items.len - 1] + 1 != depth) self.report.non_direct_runs += 1;
            try self.note(.character_shape, try attrs.attribute(self.allocator, tag, scope, "charPrIDRef", self.options.max_attribute_bytes), .char_shape);
        }
    }
};

/// Re-reads only structure-selected section entries in spine order. All
/// matching paragraph/run XML nodes are counted, including nested branches;
/// reference targets are resolved by header ID, never by array position.
pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, manifest: content_manifest.Manifest, sections: []const document_structure.Section, resources: *const header_resources.Report, options: Options) !Report {
    var report: Report = .{ .sections = sections.len };
    var remaining = options.max_total_section_xml_bytes;
    for (sections) |section| {
        const item = manifest.items[section.item_index];
        const entry_index = item.entry_index orelse return error.ExternalSpineXml;
        const max_bytes = @min(options.max_section_xml_bytes, remaining);
        const bytes = try archive.decode(archive.entries[entry_index], max_bytes);
        defer archive.allocator.free(bytes);
        var context: Context = .{ .allocator = a, .options = options, .resources = resources, .report = &report, .item_index = section.item_index };
        defer context.deinit();
        _ = try document_xml.visitBytes(a, bytes, max_bytes, options.xml, .{ .context = &context, .on_tag = Context.onTag });
        remaining -= bytes.len;
    }
    report.decoded_xml_bytes = options.max_total_section_xml_bytes - remaining;
    return report;
}
