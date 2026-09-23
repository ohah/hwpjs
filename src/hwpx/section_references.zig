const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");
const document_xml = @import("document_xml.zig");
const content_manifest = @import("content_manifest.zig");
const document_structure = @import("document_structure.zig");
const header_resources = @import("header_resources.zig");

pub const Kind = enum(u8) { paragraph_shape, style, character_shape };
pub const Counts = struct {
    present: usize = 0,
    absent: usize = 0,
    resolved: usize = 0,
    missing_target: usize = 0,
    absent_table: usize = 0,
    first_unresolved_id: ?u32 = null,
    first_unresolved_item_index: ?usize = null,

    pub fn allPresentResolved(self: Counts) bool {
        return self.missing_target == 0 and self.absent_table == 0;
    }
};

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
        defer if (raw_id) |value| self.allocator.free(value);
        const counts = &self.report.references[@intFromEnum(kind)];
        const value = raw_id orelse {
            counts.absent += 1;
            return;
        };
        const id = std.fmt.parseInt(u32, value, 10) catch return error.InvalidResourceReferenceId;
        counts.present += 1;
        const table = self.resources.table(table_kind);
        if (!table.present) {
            counts.absent_table += 1;
        } else if (table.hasId(id)) {
            counts.resolved += 1;
            return;
        } else {
            counts.missing_target += 1;
        }
        if (counts.first_unresolved_id == null) {
            counts.first_unresolved_id = id;
            counts.first_unresolved_item_index = self.item_index;
        }
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
        defer a.free(bytes);
        var context: Context = .{ .allocator = a, .options = options, .resources = resources, .report = &report, .item_index = section.item_index };
        defer context.deinit();
        _ = try document_xml.visitBytes(a, bytes, max_bytes, options.xml, .{ .context = &context, .on_tag = Context.onTag });
        remaining -= bytes.len;
    }
    report.decoded_xml_bytes = options.max_total_section_xml_bytes - remaining;
    return report;
}
