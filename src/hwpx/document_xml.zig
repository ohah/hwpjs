const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");

pub const head_uri = "http://www.hancom.co.kr/hwpml/2011/head";
pub const section_uri = "http://www.hancom.co.kr/hwpml/2011/section";
pub const paragraph_uri = "http://www.hancom.co.kr/hwpml/2011/paragraph";
pub const core_uri = "http://www.hancom.co.kr/hwpml/2011/core";

pub const Kind = enum { header, section, other };
pub const Options = struct {
    max_attribute_bytes: usize = 4096,
    max_elements: usize = 2_000_000,
    max_events: usize = 4_000_000,
    max_attributes: usize = 8_000_000,
    max_references: usize = 8_000_000,
    max_depth: usize = 256,
};
pub const Report = struct {
    kind: Kind,
    xml_bytes: usize,
    elements: usize,
    direct_paragraphs: usize,
    declared_section_count: ?u32,
    header_version: ?[]u8,

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        if (self.header_version) |value| a.free(value);
        self.* = undefined;
    }
};

const Context = struct {
    allocator: std.mem.Allocator,
    max_attribute_bytes: usize,
    kind: Kind = .other,
    direct_paragraphs: usize = 0,
    declared_section_count: ?u32 = null,
    header_version: ?[]u8 = null,

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        if (tag.kind == .end) return;
        if (depth == 1) {
            if (try attrs.element(tag, scope, head_uri, "head")) {
                self.kind = .header;
                const raw_count = try attrs.attribute(self.allocator, tag, scope, "secCnt", self.max_attribute_bytes);
                defer if (raw_count) |value| self.allocator.free(value);
                if (raw_count) |value| {
                    if (value.len == 0) return error.InvalidSectionCount;
                    self.declared_section_count = std.fmt.parseInt(u32, value, 10) catch return error.InvalidSectionCount;
                }
                self.header_version = try attrs.attribute(self.allocator, tag, scope, "version", self.max_attribute_bytes);
            } else if (try attrs.element(tag, scope, section_uri, "sec")) self.kind = .section;
            return;
        }
        if (self.kind == .section and depth == 2 and try attrs.element(tag, scope, paragraph_uri, "p")) {
            self.direct_paragraphs += 1;
        }
    }
};

pub fn read(a: std.mem.Allocator, archive: zip.Archive, entry: zip.Entry, max_xml_bytes: usize, options: Options) !Report {
    const bytes = try archive.decode(entry, max_xml_bytes);
    defer a.free(bytes);
    var context: Context = .{ .allocator = a, .max_attribute_bytes = options.max_attribute_bytes };
    errdefer if (context.header_version) |value| a.free(value);
    const parsed = try visitBytes(a, bytes, max_xml_bytes, options, .{ .context = &context, .on_tag = Context.onTag });
    return .{
        .kind = context.kind,
        .xml_bytes = bytes.len,
        .elements = parsed.elements,
        .direct_paragraphs = context.direct_paragraphs,
        .declared_section_count = context.declared_section_count,
        .header_version = context.header_version,
    };
}

/// Applies the same namespace, syntax and resource limits to every HWPX
/// document XML consumer. Visitor state is valid only during this call.
pub fn visitBytes(a: std.mem.Allocator, bytes: []const u8, max_xml_bytes: usize, options: Options, visitor: xml.document.Visitor) !xml.document.Report {
    return xml.document.visit(a, bytes, .{
        .validate_namespaces = true,
        .prolog = .{ .input = .{ .max_bytes = max_xml_bytes, .max_characters = max_xml_bytes } },
        .max_markup_bytes = max_xml_bytes,
        .max_text_bytes = max_xml_bytes,
        .max_elements = options.max_elements,
        .max_events = options.max_events,
        .max_attributes = options.max_attributes,
        .max_references = options.max_references,
        .max_depth = options.max_depth,
    }, visitor);
}
