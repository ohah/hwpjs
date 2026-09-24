const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");
const document_xml = @import("document_xml.zig");
const masterpage_parts = @import("masterpage_parts.zig");
const header_resources = @import("header_resources.zig");
const links = @import("paragraph_style_links.zig");

pub const Kind = links.Kind;
pub const Counts = links.Counts;

pub const Options = struct {
    max_parts: usize = 4096,
    max_part_xml_bytes: usize = 32 * 1024 * 1024,
    max_total_xml_bytes: usize = 128 * 1024 * 1024,
    max_attribute_bytes: usize = 4096,
    max_paragraphs: usize = 2_000_000,
    max_runs: usize = 4_000_000,
    xml: document_xml.Options = .{},
};

pub const Report = struct {
    parts: usize,
    sub_lists: usize = 0,
    paragraphs: usize = 0,
    non_direct_paragraphs: usize = 0,
    runs: usize = 0,
    non_direct_runs: usize = 0,
    decoded_xml_bytes: usize = 0,
    references: links.Links = @splat(.{}),

    pub fn counts(self: *const Report, kind: Kind) *const Counts {
        return &self.references[@intFromEnum(kind)];
    }
};

const Context = struct {
    a: std.mem.Allocator,
    options: Options,
    resources: *const header_resources.Report,
    item_index: usize,
    report: *Report,
    active_sub_list: bool = false,
    sub_lists: usize = 0,
    paragraph_depths: std.ArrayList(usize) = .empty,

    fn deinit(self: *Context) void {
        self.paragraph_depths.deinit(self.a);
    }

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        if (tag.kind == .end) {
            if (self.paragraph_depths.items.len != 0 and self.paragraph_depths.items[self.paragraph_depths.items.len - 1] == depth) _ = self.paragraph_depths.pop();
            if (depth == 2) self.active_sub_list = false;
            return;
        }
        if (depth == 1) {
            if (!try attrs.element(tag, scope, "", "masterPage")) return error.InvalidMasterPageRoot;
            return;
        }
        if (depth == 2) {
            if (try attrs.element(tag, scope, document_xml.paragraph_uri, "subList")) {
                self.sub_lists += 1;
                self.report.sub_lists += 1;
                self.active_sub_list = tag.kind == .start;
            }
            return;
        }
        if (!self.active_sub_list) return;
        if (try attrs.element(tag, scope, document_xml.paragraph_uri, "p")) {
            if (self.report.paragraphs == self.options.max_paragraphs) return error.LimitExceeded;
            self.report.paragraphs += 1;
            if (depth != 3) self.report.non_direct_paragraphs += 1;
            try links.noteParagraph(self.a, tag, scope, self.options.max_attribute_bytes, self.resources, self.item_index, &self.report.references);
            if (tag.kind == .start) try self.paragraph_depths.append(self.a, depth);
            return;
        }
        if (try attrs.element(tag, scope, document_xml.paragraph_uri, "run")) {
            if (self.report.runs == self.options.max_runs) return error.LimitExceeded;
            self.report.runs += 1;
            if (self.paragraph_depths.items.len == 0 or self.paragraph_depths.items[self.paragraph_depths.items.len - 1] + 1 != depth) self.report.non_direct_runs += 1;
            try links.noteRun(self.a, tag, scope, self.options.max_attribute_bytes, self.resources, self.item_index, &self.report.references);
        }
    }
};

/// Re-reads exact selected master-page entries. Only hp:p/hp:run descendants
/// of root-direct hp:subList are linked to explicit IDs in the same header.
pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, parts: []const masterpage_parts.Part, resources: *const header_resources.Report, options: Options) !Report {
    if (parts.len > options.max_parts) return error.LimitExceeded;
    var report: Report = .{ .parts = parts.len };
    var remaining = options.max_total_xml_bytes;
    for (parts) |part| {
        if (part.entry_index >= archive.entries.len) return error.InvalidManifestEntryIndex;
        const max_bytes = @min(options.max_part_xml_bytes, remaining);
        const bytes = try archive.decode(archive.entries[part.entry_index], max_bytes);
        defer archive.allocator.free(bytes);
        var context: Context = .{ .a = a, .options = options, .resources = resources, .item_index = part.item_index, .report = &report };
        defer context.deinit();
        _ = try document_xml.visitBytes(a, bytes, max_bytes, options.xml, .{ .context = &context, .on_tag = Context.onTag });
        if (context.sub_lists != part.sub_lists.len) return error.InconsistentMasterPageSelection;
        remaining -= bytes.len;
    }
    report.decoded_xml_bytes = options.max_total_xml_bytes - remaining;
    return report;
}
