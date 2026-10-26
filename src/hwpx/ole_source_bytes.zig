//! Detached packaged OLE bytes only; never activates an object or fetches URLs.
const std = @import("std");
const editor = @import("editor_session.zig");
const links = @import("binary_reference_links.zig");

pub const Options = struct {
    max_bytes: usize = 64 * 1024 * 1024,
    allow_external_packaged_copy: bool = false,
};
pub const Source = struct {
    bytes: []u8,
    declared_external: bool,
    pub fn deinit(self: *Source, a: std.mem.Allocator) void {
        a.free(self.bytes);
        self.* = undefined;
    }
};

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize, node: usize, options: Options) !Source {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const tree = &session.sections[section_index].tree;
    if (node >= tree.elements.len or !tree.elements[node].is(@import("document_xml.zig").paragraph_uri, "ole")) return error.InvalidOleDisplayNode;
    const attribute = try tree.attributeValue(a, node, "", "binaryItemIDRef");
    const id = if (attribute) |value| try value.toUtf8(a, 4096) else return error.MissingOleSource;
    defer a.free(id);
    var document = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    var index = try links.Index.init(a, document.manifest);
    defer index.deinit(a);
    const target = links.resolve(&index, document.manifest, id);
    const item_index = target.item_index orelse return error.MissingOleSource;
    const item = document.manifest.items[item_index];
    const external = item.embedded == false;
    if (external and !options.allow_external_packaged_copy) return error.ExternalOleSource;
    const selected = try @import("ole_payloads.zig").packagedEntry(document.archive, item) orelse return error.MissingOlePackagedCopy;
    return .{ .bytes = try document.archive.decode(document.archive.entries[selected], options.max_bytes), .declared_external = external };
}
