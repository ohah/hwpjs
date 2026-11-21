//! Exact source owner first, then unique source identity across Native serialization.
const std = @import("std");
const t = @import("../model/picture_replacement.zig");
const editor = @import("editor_session.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").paragraph_uri;
pub const Request = t.Request;
fn attribute(a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8) ![]u8 {
    const raw = (try tree.attributeValue(a, node, "", name)) orelse return error.MissingPictureReplacementIdentity;
    const text = try raw.toUtf8(a, 4096);
    errdefer a.free(text);
    if (text.len == 0) return error.MissingPictureReplacementIdentity;
    return text;
}
pub fn identity(a: std.mem.Allocator, tree: *const Tree, picture: usize) ![]u8 {
    _ = try @import("picture_display_host.zig").sourceTemplate(tree, picture);
    const selected = try attribute(a, tree, picture, "id");
    errdefer a.free(selected);
    var count: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(uri, "pic")) continue;
        const raw = try tree.attributeValue(a, node, "", "id") orelse continue;
        const text = try raw.toUtf8(a, 4096);
        defer a.free(text);
        if (std.mem.eql(u8, text, selected)) count += 1;
    }
    if (count != 1) return error.AmbiguousPictureReplacementIdentity;
    return selected;
}
pub fn link(a: std.mem.Allocator, tree: *const Tree, picture: usize) ![]u8 {
    _ = try @import("picture_display_host.zig").sourceTemplate(tree, picture);
    var img: ?usize = null;
    var cursor = tree.elements[picture].first_child;
    while (cursor) |node| : (cursor = tree.elements[node].next_sibling) {
        if (!tree.elements[node].is(@import("document_xml.zig").core_uri, "img")) continue;
        if (img != null) return error.AmbiguousPictureImage;
        img = node;
    }
    return attribute(a, tree, img orelse return error.MissingPictureImage, "binaryItemIDRef");
}
pub fn observe(a: std.mem.Allocator, session: *const editor.Session, section: u32, picture: u32, revision: u32, binding: @import("../model/object_geometry.zig").Binding) !t.Owner {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const tree = &session.sections[section].tree;
    const id = try identity(a, tree, picture);
    errdefer a.free(id);
    const resource_link = try link(a, tree, picture);
    errdefer a.free(resource_link);
    // Root group locks apply to an inner picture too; size-only protection does
    // not imply permission to rewrite geometry, which this operation never does.
    var ancestor = @as(usize, picture);
    while (true) {
        if ((try @import("object_geometry_owner.zig").protection(a, tree, ancestor)).locked) return error.PictureReplacementReadOnly;
        ancestor = tree.elements[ancestor].parent orelse break;
    }
    const sites = try @import("picture_display_sites.zig").read(a, session, section);
    defer a.free(sites);
    var found = false;
    for (sites) |site| if (site.picture_node == picture) {
        if (found or site.state != .located) return error.UnsupportedPictureReplacementHost;
        found = true;
        const unit = std.math.cast(u32, site.anchor_unit.?) orelse return error.LimitExceeded;
        const positions = try @import("field_source_outside_positions.zig").prepareAction(session, section, site.paragraph.?, unit, try std.math.add(u32, unit, 1), .splice);
        if (positions) |value| session.allocator.free(value);
    };
    if (!found) return error.UnsupportedPictureReplacementHost;
    const bytes = try @import("picture_source_bytes.zig").read(a, session, section, picture, t.max_image_bytes);
    defer a.free(bytes);
    const session_binding = try a.dupe(u8, binding.session);
    errdefer a.free(session_binding);
    const serial_binding = try a.dupe(u8, binding.serial);
    return .{ .format = .hwpx, .section = section, .pictureNode = picture, .pictureIdentity = id, .sourceSha256 = t.hash(tree.source), .resourceSha256 = t.hash(bytes), .resourceLink = resource_link, .historyRevision = revision, .binding = .{ .session = session_binding, .serial = serial_binding } };
}
pub fn validate(a: std.mem.Allocator, session: *const editor.Session, owner: t.Owner) !void {
    var actual = try observe(a, session, owner.section, owner.pictureNode, owner.historyRevision, owner.binding);
    defer actual.deinit(a);
    if (!t.matches(owner, actual)) return error.StalePictureReplacementOwner;
}
pub fn prepare(a: std.mem.Allocator, before: []const u8, request: Request, options: editor.Options) !editor.Session {
    var saved = try editor.open(a, before, options);
    defer saved.deinit();
    if (request.owner.section >= saved.sections.len) return error.StalePictureReplacementOwner;
    const tree = &saved.sections[request.owner.section].tree;
    var selected: ?usize = null;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(uri, "pic")) continue;
        const raw = try tree.attributeValue(a, node, "", "id") orelse continue;
        const id = try raw.toUtf8(a, 4096);
        defer a.free(id);
        if (!std.mem.eql(u8, id, request.owner.pictureIdentity)) continue;
        if (selected != null) return error.AmbiguousPictureReplacementIdentity;
        selected = node;
    }
    const node = selected orelse return error.MissingPictureReplacementIdentity;
    const source_link = try link(a, tree, node);
    defer a.free(source_link);
    if (!std.mem.eql(u8, source_link, request.owner.resourceLink)) return error.StalePictureReplacementOwner;
    const old = try @import("picture_source_bytes.zig").read(a, &saved, request.owner.section, node, t.max_image_bytes);
    defer a.free(old);
    const old_digest = t.hash(old);
    if (!std.mem.eql(u8, &old_digest, &request.owner.resourceSha256)) return error.StalePictureReplacementOwner;
    var output = try @import("picture_resource_replacement.zig").prepare(a, before, request.owner.section, node, request.image, .{});
    defer output.deinit(a);
    // Existing writer only appends a resource and replaces binaryItemIDRef.
    // Candidate remains private until the existing parked History publishes it.
    return editor.open(a, output.bytes, options);
}
