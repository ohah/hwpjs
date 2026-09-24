const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");
const document_xml = @import("document_xml.zig");
const content_manifest = @import("content_manifest.zig");
const document_structure = @import("document_structure.zig");
const header_resources = @import("header_resources.zig");
const paragraph_style_links = @import("paragraph_style_links.zig");
const selection = @import("compatibility_selection.zig");
const compatibility_frames = @import("compatibility_frames.zig");

pub const Kind = paragraph_style_links.Kind;
pub const Counts = paragraph_style_links.Counts;

pub const Report = struct {
    sections: usize,
    paragraphs: usize = 0,
    non_direct_paragraphs: usize = 0,
    runs: usize = 0,
    non_direct_runs: usize = 0,
    decoded_xml_bytes: usize = 0,
    references: paragraph_style_links.Links = @splat(.{}),

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
    branch_policy: selection.Policy = .{},
    xml: document_xml.Options = .{},
};

const Context = struct {
    allocator: std.mem.Allocator,
    options: Options,
    resources: *const header_resources.Report,
    report: *Report,
    item_index: usize,
    paragraph_depths: std.ArrayList(usize) = .empty,
    frames: [256]compatibility_frames.Frame = @splat(.{}),

    fn deinit(self: *Context) void {
        self.paragraph_depths.deinit(self.allocator);
    }

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        if (depth == 0 or depth > self.frames.len) return error.LimitExceeded;
        if (tag.kind == .end) {
            if (!self.frames[depth - 1].active) return;
            if (self.paragraph_depths.items.len != 0 and self.paragraph_depths.items[self.paragraph_depths.items.len - 1] == depth) {
                _ = self.paragraph_depths.pop();
            }
            return;
        }
        if (depth == 1) {
            if (!try attrs.element(tag, scope, document_xml.section_uri, "sec")) return error.InvalidSectionRoot;
            if (tag.kind == .start) self.frames[0] = .{};
            return;
        }
        const frame = try compatibility_frames.enter(self.allocator, &self.frames, depth, tag, scope, self.options.max_attribute_bytes, self.options.branch_policy);
        const is_run = frame.active and frame.kind == .run;
        if (tag.kind == .start) self.frames[depth - 1] = frame;
        if (!frame.active) return;
        if (try attrs.element(tag, scope, document_xml.paragraph_uri, "p")) {
            if (self.report.paragraphs == self.options.max_paragraphs) return error.LimitExceeded;
            self.report.paragraphs += 1;
            if (depth != 2) self.report.non_direct_paragraphs += 1;
            try paragraph_style_links.noteParagraph(self.allocator, tag, scope, self.options.max_attribute_bytes, self.resources, self.item_index, &self.report.references);
            if (tag.kind == .start) try self.paragraph_depths.append(self.allocator, depth);
            return;
        }
        if (is_run) {
            if (self.report.runs == self.options.max_runs) return error.LimitExceeded;
            self.report.runs += 1;
            if (self.paragraph_depths.items.len == 0 or self.paragraph_depths.items[self.paragraph_depths.items.len - 1] + 1 != depth) self.report.non_direct_runs += 1;
            try paragraph_style_links.noteRun(self.allocator, tag, scope, self.options.max_attribute_bytes, self.resources, self.item_index, &self.report.references);
        }
    }
};

/// Re-reads only structure-selected section entries in spine order. Raw mode
/// counts both branches, while selected mode uses caller-declared capabilities;
/// reference targets are resolved by header ID, never by array position.
pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, manifest: content_manifest.Manifest, sections: []const document_structure.Section, resources: *const header_resources.Report, options: Options) !Report {
    try selection.validate(options.branch_policy);
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
