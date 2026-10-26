//! Exact paragraph provenance shared by text policy and structural commands.
const tree_module = @import("xml_part_tree.zig");
const sites_module = @import("text_sites.zig");
const scanner = @import("section_text.zig");
const uri = @import("document_xml.zig").paragraph_uri;

/// Nearest paragraph ownership, never a descendant-field search on a host.
pub fn ownsFieldMarker(tree: *const tree_module.Tree, paragraph: usize) !bool {
    var owned = try @import("paragraph_owned_elements.zig").Iterator.init(tree, paragraph);
    while (try owned.next()) |index| {
        const element = tree.elements[index];
        if (element.is(uri, "fieldBegin") or element.is(uri, "fieldEnd")) return true;
    }
    return false;
}

test "field marker ownership excludes nested fields and foreign namespace markers" {
    const std = @import("std");
    const a = std.testing.allocator;
    var tree = try tree_module.parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run><p:tbl><p:p><p:run><p:ctrl><p:fieldBegin id='1'/></p:ctrl><p:t>label</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></p:tbl></p:run></p:p><p:p><p:run><x:fieldBegin/><p:t>ordinary</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var checked: usize = 0;
    for (tree.elements, 0..) |element, index| if (element.is(uri, "p")) {
        try std.testing.expectEqual(checked == 1, try ownsFieldMarker(&tree, index));
        checked += 1;
    };
    try std.testing.expectEqual(@as(usize, 3), checked);
    try std.testing.expectError(error.InvalidTextSites, ownsFieldMarker(&tree, tree.elements.len));
    try std.testing.expectError(error.InvalidTextSites, ownsFieldMarker(&tree, 0));
}

pub fn ancestor(tree: *const tree_module.Tree, element: usize) !usize {
    return (try optionalAncestor(tree, element)) orelse error.SourceBindingMismatch;
}

/// Absent paragraph ownership is distinct from invalid indices or cycles.
pub fn optionalAncestor(tree: *const tree_module.Tree, element: usize) !?usize {
    if (element >= tree.elements.len) return error.InvalidTextSites;
    var parent = tree.elements[element].parent;
    var depth: usize = 0;
    while (parent) |index| {
        if (index >= tree.elements.len or depth >= tree.elements.len) return error.SourceBindingMismatch;
        depth += 1;
        if (tree.elements[index].is(uri, "p")) return index;
        parent = tree.elements[index].parent;
    }
    return null;
}

pub fn resolve(tree: *const tree_module.Tree, sites: *const sites_module.Sites, locations: []const scanner.Location, paragraph: usize) !usize {
    if (locations.len != sites.items.len or paragraph == 0) return error.InvalidTextSites;
    var owner: ?usize = null;
    for (sites.items, locations) |site, location| {
        if (location.paragraph_ordinal != paragraph) continue;
        if (site.element_index >= tree.elements.len) return error.InvalidTextSites;
        const index = try ancestor(tree, site.element_index);
        if (owner) |previous| {
            if (previous != index) return error.SourceBindingMismatch;
        } else owner = index;
    }
    return owner orelse error.MissingTextSite;
}

test "HWPX paragraph site owner preserves exact nested provenance and refuses invalid bindings" {
    const std = @import("std");
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table-bug.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    var checked: usize = 0;
    var nested: usize = 0;
    for (session.sections) |*section| {
        for (section.locations) |location| {
            const owner = try resolve(&section.tree, &section.sites, section.locations, location.paragraph_ordinal);
            try std.testing.expect(section.tree.elements[owner].is(uri, "p"));
            if (section.tree.elements[owner].parent) |parent| {
                if (section.tree.elements[parent].is(uri, "subList")) nested += 1;
            }
            checked += 1;
        }
        if (section.sites.items.len == 0) continue;
        const original = section.sites.items[0].element_index;
        section.sites.items[0].element_index = section.tree.elements.len;
        try std.testing.expectError(error.InvalidTextSites, resolve(&section.tree, &section.sites, section.locations, section.locations[0].paragraph_ordinal));
        section.sites.items[0].element_index = original;
        const parent = section.tree.elements[original].parent;
        section.tree.elements[original].parent = original;
        try std.testing.expectError(error.SourceBindingMismatch, resolve(&section.tree, &section.sites, section.locations, section.locations[0].paragraph_ordinal));
        section.tree.elements[original].parent = section.tree.elements.len;
        try std.testing.expectError(error.SourceBindingMismatch, resolve(&section.tree, &section.sites, section.locations, section.locations[0].paragraph_ordinal));
        section.tree.elements[original].parent = parent;
        try std.testing.expectError(error.InvalidTextSites, resolve(&section.tree, &section.sites, section.locations, 0));
        try std.testing.expectError(error.MissingTextSite, resolve(&section.tree, &section.sites, section.locations, std.math.maxInt(usize)));
    }
    try std.testing.expect(checked > 0);
    try std.testing.expect(nested > 0);
}
