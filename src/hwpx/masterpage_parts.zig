const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const manifest = @import("content_manifest.zig");
const document_xml = @import("document_xml.zig");
const attrs = @import("xml_attributes.zig");
const values = @import("xml_values.zig");
const namespace_profile = @import("namespace_profile.zig");

pub const Kind = enum { both, even, odd, last_page, optional_page };

pub const Options = struct {
    max_parts: usize = 4096,
    max_part_xml_bytes: usize = 32 * 1024 * 1024,
    max_total_xml_bytes: usize = 128 * 1024 * 1024,
    max_attribute_bytes: usize = 4096,
    xml: document_xml.Options = .{},
};

pub const Part = struct {
    href: []u8,
    id: []u8,
    item_index: usize,
    entry_index: usize,
    type_name: ?[]u8,
    kind: ?Kind,
    page_number: ?[]u8,
    page_duplicate: ?[]u8,
    page_front: ?[]u8,
    sub_lists: usize,
    other_direct_elements: usize,
    uninspected_descendants: usize,
    manifest_id_matches: bool,

    fn deinit(self: *Part, a: std.mem.Allocator) void {
        a.free(self.href);
        a.free(self.id);
        if (self.type_name) |v| a.free(v);
        if (self.page_number) |v| a.free(v);
        if (self.page_duplicate) |v| a.free(v);
        if (self.page_front) |v| a.free(v);
    }
};

pub const Report = struct {
    parts: []Part,
    xml_bytes: usize,
    unsupported_types: usize,
    manifest_id_mismatches: usize,

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        for (self.parts) |*part| part.deinit(a);
        a.free(self.parts);
        self.* = undefined;
    }
};

fn knownKind(value: []const u8) ?Kind {
    if (std.mem.eql(u8, value, "BOTH")) return .both;
    if (std.mem.eql(u8, value, "EVEN")) return .even;
    if (std.mem.eql(u8, value, "ODD")) return .odd;
    if (std.mem.eql(u8, value, "LAST_PAGE")) return .last_page;
    if (std.mem.eql(u8, value, "OPTIONAL_PAGE")) return .optional_page;
    return null;
}

/// Only canonical Contents/masterpageN.xml package names are selected. XML
/// syntax for other manifest XML parts is owned by manifest_xml.zig.
pub fn isPartHref(href: []const u8) bool {
    const prefix = "Contents/masterpage";
    const suffix = ".xml";
    if (!std.mem.startsWith(u8, href, prefix) or !std.mem.endsWith(u8, href, suffix)) return false;
    if (href.len <= prefix.len + suffix.len) return false;
    for (href[prefix.len .. href.len - suffix.len]) |byte| if (byte < '0' or byte > '9') return false;
    return true;
}

const Context = struct {
    a: std.mem.Allocator,
    options: Options,
    id: ?[]u8 = null,
    type_name: ?[]u8 = null,
    page_number: ?[]u8 = null,
    page_duplicate: ?[]u8 = null,
    page_front: ?[]u8 = null,
    sub_lists: usize = 0,
    other_direct_elements: usize = 0,
    uninspected_descendants: usize = 0,

    fn deinit(self: *Context) void {
        if (self.id) |v| self.a.free(v);
        if (self.type_name) |v| self.a.free(v);
        if (self.page_number) |v| self.a.free(v);
        if (self.page_duplicate) |v| self.a.free(v);
        if (self.page_front) |v| self.a.free(v);
    }

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        if (tag.kind == .end) return;
        if (depth == 1) {
            if (!try attrs.element(tag, scope, "", "masterPage")) {
                const name = try scope.expandElement(tag.name);
                if (namespace_profile.isVersionedRoot(name, "masterPage", "master-page")) return error.UnsupportedHwpxNamespaceProfile;
                return error.InvalidMasterPageRoot;
            }
            self.id = try attrs.attribute(self.a, tag, scope, "id", self.options.max_attribute_bytes);
            if (self.id == null or self.id.?.len == 0) return error.MissingMasterPageId;
            self.type_name = try attrs.attribute(self.a, tag, scope, "type", self.options.max_attribute_bytes);
            self.page_number = try attrs.attribute(self.a, tag, scope, "pageNumber", self.options.max_attribute_bytes);
            self.page_duplicate = try attrs.attribute(self.a, tag, scope, "pageDuplicate", self.options.max_attribute_bytes);
            self.page_front = try attrs.attribute(self.a, tag, scope, "pageFront", self.options.max_attribute_bytes);
            if (self.page_number) |v| _ = try values.unsigned32(v);
            if (self.page_duplicate) |v| _ = try values.boolean(v);
            if (self.page_front) |v| _ = try values.boolean(v);
            return;
        }
        if (depth == 2) {
            if (try attrs.element(tag, scope, document_xml.paragraph_uri, "subList")) {
                self.sub_lists += 1;
            } else self.other_direct_elements += 1;
        } else self.uninspected_descendants += 1;
    }
};

fn parsePart(a: std.mem.Allocator, archive: zip.Archive, item: manifest.Item, item_index: usize, max_bytes: usize, options: Options) !struct { part: Part, bytes: usize } {
    const entry_index = item.entry_index orelse return error.UnsupportedExternalMasterPage;
    if (entry_index >= archive.entries.len) return error.InvalidManifestEntryIndex;
    const bytes = try archive.decode(archive.entries[entry_index], max_bytes);
    defer archive.allocator.free(bytes);
    var context: Context = .{ .a = a, .options = options };
    defer context.deinit();
    _ = try document_xml.visitBytes(a, bytes, max_bytes, options.xml, .{ .context = &context, .on_tag = Context.onTag });
    const id = context.id orelse return error.MissingMasterPageId;
    const href = try a.dupe(u8, item.href);
    context.id = null;
    const part: Part = .{
        .href = href,
        .id = id,
        .item_index = item_index,
        .entry_index = entry_index,
        .type_name = context.type_name,
        .kind = if (context.type_name) |v| knownKind(v) else null,
        .page_number = context.page_number,
        .page_duplicate = context.page_duplicate,
        .page_front = context.page_front,
        .sub_lists = context.sub_lists,
        .other_direct_elements = context.other_direct_elements,
        .uninspected_descendants = context.uninspected_descendants,
        .manifest_id_matches = std.mem.eql(u8, id, item.id),
    };
    context.type_name = null;
    context.page_number = null;
    context.page_duplicate = null;
    context.page_front = null;
    return .{ .part = part, .bytes = bytes.len };
}

pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, items: []const manifest.Item, options: Options) !Report {
    var parts: std.ArrayList(Part) = .empty;
    var seen: std.StringHashMapUnmanaged(void) = .empty;
    defer seen.deinit(a);
    defer {
        for (parts.items) |*part| part.deinit(a);
        parts.deinit(a);
    }
    var remaining = options.max_total_xml_bytes;
    var unsupported_types: usize = 0;
    var manifest_id_mismatches: usize = 0;
    for (items, 0..) |item, item_index| {
        if (!isPartHref(item.href)) continue;
        if (parts.items.len == options.max_parts) return error.LimitExceeded;
        if (!std.mem.eql(u8, item.media_type, manifest.xml_media_type)) return error.InvalidMasterPageMediaType;
        if (seen.contains(item.href)) return error.DuplicateMasterPagePath;
        const parsed = try parsePart(a, archive, item, item_index, @min(options.max_part_xml_bytes, remaining), options);
        var moved = false;
        errdefer if (!moved) {
            var orphan = parsed.part;
            orphan.deinit(a);
        };
        remaining -= parsed.bytes;
        unsupported_types += @intFromBool(parsed.part.type_name != null and parsed.part.kind == null);
        manifest_id_mismatches += @intFromBool(!parsed.part.manifest_id_matches);
        try parts.append(a, parsed.part);
        moved = true;
        try seen.put(a, parts.items[parts.items.len - 1].href, {});
    }
    return .{ .parts = try parts.toOwnedSlice(a), .xml_bytes = options.max_total_xml_bytes - remaining, .unsupported_types = unsupported_types, .manifest_id_mismatches = manifest_id_mismatches };
}
