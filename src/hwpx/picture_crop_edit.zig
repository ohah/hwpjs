//! Current physical picture source rectangle; no display geometry or media replacement.
const std = @import("std");
const editor = @import("editor_session.zig");
const owners = @import("picture_replacement_current.zig");
const model = @import("../model/picture_replacement.zig");
const epoch = @import("../model/history_mutation_epoch.zig");
const raw_crop = @import("picture_crop_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Rect = @import("../model/picture_crop_rectangle.zig").Rectangle;
pub const Bounds = struct { width: u32, height: u32, basis: enum { explicit_pair, absent_75_policy } };
pub const Observation = struct {
    owner: model.Owner,
    ticket: epoch.Ticket,
    raw: raw_crop.Values,
    bounds: Bounds,
    pixels: @import("../image/picture_input.zig").PixelSize,
    pub fn deinit(self: *Observation, a: std.mem.Allocator) void {
        self.owner.deinit(a);
        self.* = undefined;
    }
};
pub const Request = struct { before: Observation, value: Rect };
// Positive explicit pairs and wholly absent dimensions are distinct profiles.
// Partial/zero references remain readable but are not authoring authority.
pub fn qualify(raw: raw_crop.Values, pixels: @import("../image/picture_input.zig").PixelSize) !Bounds {
    if (pixels.width == 0 or pixels.height == 0) return error.MissingPictureCropMediaGeometry;
    for (raw.clip) |value| if (value == null) return error.MissingPictureCropEdges;
    const pair = raw.image_dimensions;
    if (pair[0] != null and pair[1] != null and pair[0].? > 0 and pair[1].? > 0)
        return .{ .width = pair[0].?, .height = pair[1].?, .basis = .explicit_pair };
    if (pair[0] != null or pair[1] != null) return error.UnsupportedPictureCropReference;
    return .{ .width = try std.math.mul(u32, pixels.width, 75), .height = try std.math.mul(u32, pixels.height, 75), .basis = .absent_75_policy };
}
pub fn validateRect(value: Rect, bounds: Bounds) !void {
    if (!value.fits(bounds.width, bounds.height))
        return error.InvalidPictureCropRectangle;
}
pub fn same(raw: raw_crop.Values, value: Rect) bool {
    return std.meta.eql(raw.clip, [4]?i64{ value.left, value.right, value.top, value.bottom });
}
pub fn observe(a: std.mem.Allocator, session: *const editor.Session, section: u32, picture: u32, revision: u32, ticket: epoch.Ticket) !Observation {
    try security(a, session.source, session.options.max_xml_bytes);
    for (session.sections) |part| if (part.created_tables.entries.items.len != 0) return error.UnsupportedInsertPendingTable;
    var serial: [20]u8 = undefined;
    // Identity strings stay Native-only. The unforgeable History scope is separate.
    var owner = try owners.observe(a, session, section, picture, revision, .{ .session = "native-picture-crop", .serial = try std.fmt.bufPrint(&serial, "{d}", .{session.mutation_serial}) });
    errdefer owner.deinit(a);
    const raw = try raw_crop.read(a, &session.sections[section].tree, picture);
    // The reader intentionally coalesces absent attributes to null. Authoring
    // must additionally distinguish a present empty imgDim from no element.
    var missing: usize = 0;
    var duplicate: usize = 0;
    const dim = @import("table_xml_fields.zig").uniqueChild(&session.sections[section].tree, picture, "imgDim", &missing, &duplicate);
    if (dim != null and (raw.image_dimensions[0] == null or raw.image_dimensions[1] == null)) return error.UnsupportedPictureCropReference;
    const bytes = try @import("picture_source_bytes.zig").read(a, session, section, picture, model.max_image_bytes);
    defer a.free(bytes);
    const raster = try mediaGeometry(bytes);
    return .{ .owner = owner, .ticket = ticket, .raw = raw, .bounds = try qualify(raw, raster.pixels), .pixels = raster.pixels };
}
pub fn mediaGeometry(bytes: []const u8) !@import("../image/picture_input.zig").Raster {
    const raster = try @import("../image/picture_input.zig").inspectRaster(bytes, model.max_image_bytes);
    // Orientation and animation have no certified source-to-preview contract
    // in this first profile. Reject metadata, never silently rotate a crop.
    if (std.mem.eql(u8, raster.media.extension, "jpg")) {
        var markers = try @import("../image/jpeg/markers.zig").Iterator.init(bytes, .{});
        while (try markers.next()) |marker| {
            if (@import("../image/jpeg/exif_tiff.zig").isExifMarker(marker)) return error.UnsupportedPictureCropMediaOrientation;
            if (marker.code == 0xda or marker.code == 0xd9) break;
        }
    } else {
        var chunks = try @import("../image/png/chunks.zig").Iterator.init(bytes, .{});
        while (try chunks.next()) |chunk| {
            if (chunk.is("eXIf")) return error.UnsupportedPictureCropMediaOrientation;
            if (chunk.is("acTL")) return error.UnsupportedPictureCropAnimation;
            if (chunk.is("IEND")) break;
        }
    }
    return raster;
}
pub fn validate(a: std.mem.Allocator, session: *const editor.Session, request: Request, ticket: epoch.Ticket, revision: u32) !bool {
    if (!std.meta.eql(ticket, request.before.ticket) or revision != request.before.owner.historyRevision) return error.StalePictureCrop;
    var current = try observe(a, session, request.before.owner.section, request.before.owner.pictureNode, revision, ticket);
    defer current.deinit(a);
    if (!model.matches(current.owner, request.before.owner) or !std.meta.eql(current.raw, request.before.raw) or !std.meta.eql(current.bounds, request.before.bounds) or !std.meta.eql(current.pixels, request.before.pixels)) return error.StalePictureCrop;
    try validateRect(request.value, current.bounds);
    return !same(current.raw, request.value);
}
fn clipNode(tree: *const Tree, picture: usize) !usize {
    var missing: usize = 0;
    var duplicate: usize = 0;
    const node = @import("table_xml_fields.zig").uniqueChild(tree, picture, "imgClip", &missing, &duplicate);
    if (duplicate != 0) return error.DuplicatePictureCropChild;
    return node orelse error.MissingPictureCropEdges;
}
fn equal(a: std.mem.Allocator, value: @import("../xml/attribute_value.zig").Value, requested: i64) !bool {
    return try @import("table_xml_fields.zig").margin(a, value, 4096) == requested;
}
fn serialize(a: std.mem.Allocator, quote: u8, value: i64) ![]u8 {
    return std.fmt.allocPrint(a, "{c}{d}{c}", .{ quote, value, quote });
}
pub fn writeTree(a: std.mem.Allocator, tree: *const Tree, picture: usize, expected: raw_crop.Values, value: Rect, bounds: Bounds, limit: usize) ![]u8 {
    const current = try raw_crop.read(a, tree, picture);
    if (!std.meta.eql(current, expected)) return error.StalePictureCrop;
    try validateRect(value, bounds);
    const node = try clipNode(tree, picture);
    const tag = try @import("xml_numeric_attributes_write.zig").write(a, tree, node, &.{ "left", "right", "top", "bottom" }, i64, .{ value.left, value.right, value.top, value.bottom }, equal, serialize, limit);
    defer a.free(tag);
    const span = tree.elements[node].start_tag;
    return @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = span.start, .end = span.end, .text = "", .serialized_xml = tag }}, limit);
}
pub fn prepare(a: std.mem.Allocator, live: *const editor.Session, before: []const u8, request: Request, ticket: epoch.Ticket, revision: u32) !?editor.Session {
    if (!try validate(a, live, request, ticket, revision)) return null;
    var saved = try editor.open(a, before, live.options);
    defer saved.deinit();
    const section = request.before.owner.section;
    const tree = &saved.sections[section].tree;
    var selected: ?u32 = null;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "pic")) continue;
        const raw = try tree.attributeValue(a, node, "", "id") orelse continue;
        const id = try raw.toUtf8(a, 4096);
        defer a.free(id);
        if (!std.mem.eql(u8, id, request.before.owner.pictureIdentity)) continue;
        if (selected != null) return error.AmbiguousPictureReplacementIdentity;
        selected = std.math.cast(u32, node) orelse return error.LimitExceeded;
    }
    const node = selected orelse return error.MissingPictureReplacementIdentity;
    var current = try observe(a, &saved, section, node, revision, ticket);
    defer current.deinit(a);
    if (!std.mem.eql(u8, current.owner.resourceLink, request.before.owner.resourceLink) or !std.mem.eql(u8, &current.owner.resourceSha256, &request.before.owner.resourceSha256) or !std.meta.eql(current.raw, request.before.raw) or !std.meta.eql(current.bounds, request.before.bounds)) return error.StalePictureCrop;
    const edited = try writeTree(a, tree, node, current.raw, request.value, current.bounds, live.options.max_xml_bytes);
    defer a.free(edited);
    // Fixed display frame: preserve all layout caches and shape/resource fields.
    const output = try @import("../zip/replace_writer.zig").write(a, before, &.{.{ .entry_index = saved.sections[section].entry_index, .bytes = edited }}, .{ .max_output_bytes = live.options.max_output_bytes });
    defer a.free(output);
    return try editor.open(a, output, live.options);
}

// Same conservative package-root/signature guard as the own picture replacement writer.
fn security(a: std.mem.Allocator, source: []const u8, limit: usize) !void {
    var document = try @import("package.zig").inspectDocument(a, source, .{});
    defer document.deinit(a);
    var protection = try document.inspectProtection(a, .{});
    defer protection.deinit(a);
    if (protection.encrypted_paths.len != 0) return error.EncryptedDocument;
    for (document.archive.entries) |entry| {
        if (entry.name.len >= 9 and std.ascii.eqlIgnoreCase(entry.name[0..9], "META-INF/") and !std.mem.eql(u8, entry.name, "META-INF/container.xml") and !std.mem.eql(u8, entry.name, "META-INF/manifest.xml") and !std.mem.eql(u8, entry.name, "META-INF/container.rdf")) return error.UnsupportedPictureSecurityMetadata;
        if (std.mem.eql(u8, entry.name, "META-INF/container.xml") or std.mem.eql(u8, entry.name, "META-INF/manifest.xml") or std.mem.eql(u8, entry.name, "META-INF/container.rdf") or std.mem.eql(u8, entry.name, document.container.path)) {
            const bytes = try document.archive.decode(entry, limit);
            defer a.free(bytes);
            var gate: SecurityGate = .{ .allocator = a, .package_path = document.container.path };
            _ = try @import("document_xml.zig").visitBytes(a, bytes, limit, .{}, .{ .context = &gate, .on_tag = SecurityGate.onTag });
        }
    }
}

const SecurityGate = struct {
    allocator: std.mem.Allocator,
    package_path: []const u8,
    fn onTag(raw: *anyopaque, tag: @import("../xml/root.zig").tags.Tag, scope: *const @import("../xml/root.zig").namespaces.State, _: usize) anyerror!void {
        if (tag.kind == .end) return;
        const self: *SecurityGate = @ptrCast(@alignCast(raw));
        const attrs = @import("xml_attributes.zig");
        const name = try scope.expandElement(tag.name);
        if (std.mem.eql(u8, name.uri, "http://www.w3.org/2000/09/xmldsig#")) return error.SignedDocument;
        if (!try attrs.element(tag, scope, "urn:oasis:names:tc:opendocument:xmlns:container", "rootfile")) return;
        const path = (try attrs.attribute(self.allocator, tag, scope, "full-path", 4096)) orelse return error.MissingRootPath;
        defer self.allocator.free(path);
        const media = (try attrs.attribute(self.allocator, tag, scope, "media-type", 4096)) orelse return error.MissingRootMediaType;
        defer self.allocator.free(media);
        if ((std.mem.eql(u8, path, self.package_path) and std.mem.eql(u8, media, "application/hwpml-package+xml")) or
            (std.mem.eql(u8, path, "Preview/PrvText.txt") and std.mem.eql(u8, media, "text/plain")) or
            (std.mem.eql(u8, path, "META-INF/container.rdf") and std.mem.eql(u8, media, "application/rdf+xml"))) return;
        return error.UnsupportedPicturePackageRoot;
    }
};
