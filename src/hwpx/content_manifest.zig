const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");

const opf_uri = "http://www.idpf.org/2007/opf/";
pub const xml_media_type = "application/xml";

pub const Item = struct {
    id: []u8,
    href: []u8,
    media_type: []u8,
    /// null means the Hancom extension was absent, not an explicit true.
    embedded: ?bool,
    /// null for explicitly external links. No filesystem/network access.
    entry_index: ?usize,

    pub fn deinit(self: *Item, a: std.mem.Allocator) void {
        a.free(self.id);
        a.free(self.href);
        a.free(self.media_type);
        self.* = undefined;
    }
};

pub const SpineRef = struct { item_index: usize, linear: ?bool };
pub const Manifest = struct {
    items: []Item,
    spine: []SpineRef,
    xml_bytes: usize,

    pub fn deinit(self: *Manifest, a: std.mem.Allocator) void {
        for (self.items) |*item| item.deinit(a);
        a.free(self.items);
        a.free(self.spine);
        self.* = undefined;
    }
};

const UnresolvedRef = struct { id: []u8, linear: ?bool };
pub const Options = struct {
    max_xml_bytes: usize = 1024 * 1024,
    max_attribute_bytes: usize = 4096,
    max_items: usize = 65_535,
    max_spine: usize = 65_535,
};

const Context = struct {
    allocator: std.mem.Allocator,
    options: Options,
    items: std.ArrayList(Item) = .empty,
    refs: std.ArrayList(UnresolvedRef) = .empty,
    id_to_index: std.StringHashMapUnmanaged(usize) = .empty,
    zip_by_name: std.StringHashMapUnmanaged(usize) = .empty,
    manifest_seen: bool = false,
    spine_seen: bool = false,
    in_manifest: bool = false,
    in_spine: bool = false,

    fn deinit(self: *Context) void {
        for (self.items.items) |*item| item.deinit(self.allocator);
        self.items.deinit(self.allocator);
        for (self.refs.items) |ref| self.allocator.free(ref.id);
        self.refs.deinit(self.allocator);
        self.id_to_index.deinit(self.allocator);
        self.zip_by_name.deinit(self.allocator);
    }

    fn parseItem(self: *Context, tag: xml.tags.Tag, scope: *const xml.namespaces.State) !void {
        if (self.items.items.len == self.options.max_items) return error.LimitExceeded;
        const id = (try attrs.attribute(self.allocator, tag, scope, "id", self.options.max_attribute_bytes)) orelse return error.MissingItemId;
        var keep_id = false;
        defer if (!keep_id) self.allocator.free(id);
        if (id.len == 0) return error.MissingItemId;
        if (self.id_to_index.contains(id)) return error.DuplicateManifestId;
        const href = (try attrs.attribute(self.allocator, tag, scope, "href", self.options.max_attribute_bytes)) orelse return error.MissingItemHref;
        var keep_href = false;
        defer if (!keep_href) self.allocator.free(href);
        if (href.len == 0) return error.MissingItemHref;
        const media_type = (try attrs.attribute(self.allocator, tag, scope, "media-type", self.options.max_attribute_bytes)) orelse return error.MissingItemMediaType;
        var keep_media = false;
        defer if (!keep_media) self.allocator.free(media_type);
        if (media_type.len == 0) return error.MissingItemMediaType;
        const raw_embedded = try attrs.attribute(self.allocator, tag, scope, "isEmbeded", self.options.max_attribute_bytes);
        defer if (raw_embedded) |raw| self.allocator.free(raw);
        const embedded: ?bool = if (raw_embedded) |raw|
            if (std.mem.eql(u8, raw, "0")) false else if (std.mem.eql(u8, raw, "1")) true else return error.InvalidEmbeddedValue
        else
            null;
        var entry_index: ?usize = null;
        if (embedded != false) {
            if (!zip.validPath(href)) return error.InvalidItemHref;
            entry_index = self.zip_by_name.get(href) orelse return error.MissingEmbeddedEntry;
        }
        try self.items.append(self.allocator, .{
            .id = id,
            .href = href,
            .media_type = media_type,
            .embedded = embedded,
            .entry_index = entry_index,
        });
        keep_id = true;
        keep_href = true;
        keep_media = true;
        try self.id_to_index.put(self.allocator, id, self.items.items.len - 1);
    }

    fn parseItemref(self: *Context, tag: xml.tags.Tag, scope: *const xml.namespaces.State) !void {
        if (self.refs.items.len == self.options.max_spine) return error.LimitExceeded;
        const id = (try attrs.attribute(self.allocator, tag, scope, "idref", self.options.max_attribute_bytes)) orelse return error.MissingSpineIdref;
        errdefer self.allocator.free(id);
        if (id.len == 0) return error.MissingSpineIdref;
        const raw_linear = try attrs.attribute(self.allocator, tag, scope, "linear", self.options.max_attribute_bytes);
        defer if (raw_linear) |raw| self.allocator.free(raw);
        const linear: ?bool = if (raw_linear) |raw|
            if (std.mem.eql(u8, raw, "yes")) true else if (std.mem.eql(u8, raw, "no")) false else return error.InvalidSpineLinear
        else
            null;
        try self.refs.append(self.allocator, .{ .id = id, .linear = linear });
    }

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        if (tag.kind == .end) {
            if (depth == 2) {
                if (try attrs.element(tag, scope, opf_uri, "manifest")) self.in_manifest = false;
                if (try attrs.element(tag, scope, opf_uri, "spine")) self.in_spine = false;
            }
            return;
        }
        if (depth == 1) {
            if (!try attrs.element(tag, scope, opf_uri, "package")) return error.InvalidPackageRoot;
            return;
        }
        if (depth == 2 and try attrs.element(tag, scope, opf_uri, "manifest")) {
            if (self.manifest_seen) return error.DuplicateManifest;
            self.manifest_seen = true;
            self.in_manifest = tag.kind == .start;
            return;
        }
        if (depth == 2 and try attrs.element(tag, scope, opf_uri, "spine")) {
            if (self.spine_seen) return error.DuplicateSpine;
            self.spine_seen = true;
            self.in_spine = tag.kind == .start;
            return;
        }
        if (depth == 3 and self.in_manifest and try attrs.element(tag, scope, opf_uri, "item")) return self.parseItem(tag, scope);
        if (depth == 3 and self.in_spine and try attrs.element(tag, scope, opf_uri, "itemref")) return self.parseItemref(tag, scope);
    }
};

pub fn read(a: std.mem.Allocator, archive: zip.Archive, root_path: []const u8, options: Options) !Manifest {
    const entry = archive.find(root_path) orelse return error.MissingPackageRoot;
    const bytes = try archive.decode(entry, options.max_xml_bytes);
    defer archive.allocator.free(bytes);
    var context: Context = .{ .allocator = a, .options = options };
    defer context.deinit();
    for (archive.entries, 0..) |member, i| try context.zip_by_name.put(a, member.name, i);
    _ = try xml.document.visit(a, bytes, .{
        .validate_namespaces = true,
        .prolog = .{ .input = .{ .max_bytes = options.max_xml_bytes, .max_characters = options.max_xml_bytes } },
        .max_elements = 1_000_000,
        .max_events = 2_000_000,
        .max_depth = 128,
    }, .{ .context = &context, .on_tag = Context.onTag });
    if (!context.manifest_seen) return error.MissingManifest;
    if (!context.spine_seen) return error.MissingSpine;
    const spine = try a.alloc(SpineRef, context.refs.items.len);
    errdefer a.free(spine);
    for (context.refs.items, spine) |ref, *out| {
        out.* = .{ .item_index = context.id_to_index.get(ref.id) orelse return error.MissingSpineItem, .linear = ref.linear };
    }
    return .{ .items = try context.items.toOwnedSlice(a), .spine = spine, .xml_bytes = bytes.len };
}
