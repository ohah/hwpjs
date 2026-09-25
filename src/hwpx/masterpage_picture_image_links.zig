const std = @import("std");
const zip = @import("../zip/archive.zig");
const manifest = @import("content_manifest.zig");
const parts = @import("masterpage_parts.zig");
const trees = @import("masterpage_xml_trees.zig");
const pictures = @import("picture_image_links.zig");

pub const Options = struct {
    trees: trees.Options = .{},
    links: pictures.Options = .{},
};
pub const Report = pictures.Report;

pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, items: manifest.Manifest, selected: []const parts.Part, options: Options) !Report {
    var document_trees = try trees.read(a, archive, selected, options.trees);
    defer document_trees.deinit(a);
    return pictures.inspectMasterTrees(a, items, document_trees.trees, options.links);
}
