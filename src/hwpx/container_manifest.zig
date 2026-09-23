const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");

const ocf_uri = "urn:oasis:names:tc:opendocument:xmlns:container";
const package_media = "application/hwpml-package+xml";

pub const Root = struct {
    path: []u8,
    xml_bytes: usize,
    optional_roots: usize,
    missing_optional_roots: usize,

    pub fn deinit(self: *Root, a: std.mem.Allocator) void {
        a.free(self.path);
        self.* = undefined;
    }
};

const Context = struct {
    allocator: std.mem.Allocator,
    archive: zip.Archive,
    max_attribute_bytes: usize,
    path: ?[]u8 = null,
    rootfiles_seen: bool = false,
    in_rootfiles: bool = false,
    optional_roots: usize = 0,
    missing_optional_roots: usize = 0,

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        if (tag.kind == .end) {
            if (depth == 2 and try attrs.element(tag, scope, ocf_uri, "rootfiles")) self.in_rootfiles = false;
            return;
        }
        if (depth == 1) {
            if (!try attrs.element(tag, scope, ocf_uri, "container")) return error.InvalidContainerRoot;
            return;
        }
        if (depth == 2 and try attrs.element(tag, scope, ocf_uri, "rootfiles")) {
            if (self.rootfiles_seen) return error.DuplicateRootfiles;
            self.rootfiles_seen = true;
            self.in_rootfiles = tag.kind == .start;
            return;
        }
        if (depth != 3 or !self.in_rootfiles or !try attrs.element(tag, scope, ocf_uri, "rootfile")) return;
        const path = (try attrs.attribute(self.allocator, tag, scope, "full-path", self.max_attribute_bytes)) orelse return error.MissingRootPath;
        var keep_path = false;
        defer if (!keep_path) self.allocator.free(path);
        const media = (try attrs.attribute(self.allocator, tag, scope, "media-type", self.max_attribute_bytes)) orelse return error.MissingRootMediaType;
        defer self.allocator.free(media);
        if (!zip.validPath(path)) return error.InvalidRootPath;
        if (std.mem.eql(u8, media, package_media)) {
            if (self.path != null) return error.DuplicatePackageRoot;
            if (self.archive.find(path) == null) return error.MissingPackageRoot;
            self.path = path;
            keep_path = true;
        } else {
            self.optional_roots += 1;
            if (self.archive.find(path) == null) self.missing_optional_roots += 1;
        }
    }
};

pub fn read(a: std.mem.Allocator, archive: zip.Archive, max_xml_bytes: usize, max_attribute_bytes: usize) !Root {
    const entry = archive.find("META-INF/container.xml") orelse return error.MissingContainerXml;
    const bytes = try archive.decode(entry, max_xml_bytes);
    defer a.free(bytes);
    var context: Context = .{ .allocator = a, .archive = archive, .max_attribute_bytes = max_attribute_bytes };
    errdefer if (context.path) |path| a.free(path);
    _ = try xml.document.visit(a, bytes, .{
        .validate_namespaces = true,
        .prolog = .{ .input = .{ .max_bytes = max_xml_bytes, .max_characters = max_xml_bytes } },
        .max_elements = 4096,
        .max_events = 8192,
        .max_depth = 64,
    }, .{ .context = &context, .on_tag = Context.onTag });
    if (!context.rootfiles_seen) return error.MissingRootfiles;
    return .{
        .path = context.path orelse return error.MissingPackageRoot,
        .xml_bytes = bytes.len,
        .optional_roots = context.optional_roots,
        .missing_optional_roots = context.missing_optional_roots,
    };
}
