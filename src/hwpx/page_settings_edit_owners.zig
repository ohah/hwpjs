//! One structural pass and one geometry query. No effective-owner guess or shadow authority.
const std = @import("std");
const editor = @import("editor_session.zig");
const geometry = @import("page_geometry.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const t = @import("page_settings_edit_types.zig");
const hp = @import("document_xml.zig").paragraph_uri;
const hs = "http://www.hancom.co.kr/hwpml/2011/section";
pub fn observe(a: std.mem.Allocator, session: *const editor.Session) ![]t.Owner {
    const trees = try a.alloc(Tree, session.sections.len);
    defer a.free(trees);
    for (session.sections, trees) |s, *tree| tree.* = s.tree;
    return inspect(a, trees);
}
pub fn inspect(a: std.mem.Allocator, trees: []const Tree) ![]t.Owner {
    if (trees.len > 512) return error.LimitExceeded;
    var report = try geometry.inspect(a, trees, .{});
    defer report.deinit(a);
    const owners = try a.alloc(t.Owner, trees.len);
    errdefer a.free(owners);
    const counts = try a.alloc(usize, trees.len);
    defer a.free(counts);
    @memset(counts, 0);
    for (owners, 0..) |*owner, i| owner.* = .{ .section = i, .reason = .MissingPageSettings };
    for (report.pages) |page| {
        counts[page.section_ordinal] += 1;
        owners[page.section_ordinal].target = .{ .section = page.section_ordinal, .page_node = page.element_index, .owner_node = trees[page.section_ordinal].elements[page.element_index].parent.?, .margin_node = null, .expected = page };
    }
    for (trees, owners, counts) |*tree, *owner, count| {
        if (count == 0) {
            // A known pagePr exists but has a conditional/nested owner, not genuine absence.
            for (tree.elements) |e| if (e.is(hp, "pagePr")) {
                owner.reason = .UnsupportedPageSettingsOwner;
                break;
            };
            continue;
        }
        if (count != 1) {
            owner.reason = .AmbiguousPageSettings;
            owner.target = null;
            continue;
        }
        const target = &owner.target.?;
        if (target.expected.duplicate_margins != 0) {
            owner.reason = .DuplicatePageMargin;
            owner.target = null;
            continue;
        }
        var sec_count: usize = 0;
        var page_count: usize = 0;
        for (tree.elements) |e| {
            if (e.is(hp, "secPr")) sec_count += 1;
            if (e.is(hp, "pagePr")) page_count += 1;
        }
        const sec = tree.elements[target.owner_node];
        const run = if (sec.parent) |i| tree.elements[i] else {
            owner.reason = .UnsupportedPageSettingsOwner;
            owner.target = null;
            continue;
        };
        const p = if (run.parent) |i| tree.elements[i] else {
            owner.reason = .UnsupportedPageSettingsOwner;
            owner.target = null;
            continue;
        };
        const root = if (p.parent) |i| tree.elements[i] else {
            owner.reason = .UnsupportedPageSettingsOwner;
            owner.target = null;
            continue;
        };
        if (sec_count != 1 or page_count != 1 or !run.is(hp, "run") or !p.is(hp, "p") or !root.is(hs, "sec") or root.parent != null) {
            owner.reason = .UnsupportedPageSettingsOwner;
            owner.target = null;
            continue;
        }
        var child = tree.elements[target.page_node].first_child;
        while (child) |i| : (child = tree.elements[i].next_sibling) {
            if (tree.elements[i].is(hp, "margin")) target.margin_node = i;
        }
        const page = tree.elements[target.page_node];
        var conditional_margin = false;
        for (tree.elements) |e| {
            if (e.is(hp, "margin") and e.start_tag.start > page.start_tag.start and e.end < page.end and e.parent != target.page_node) conditional_margin = true;
        }
        if (conditional_margin) {
            owner.reason = .UnsupportedPageSettingsOwner;
            owner.target = null;
            continue;
        }
        owner.reason = null;
    }
    return owners;
}
pub fn validateTargets(a: std.mem.Allocator, session: *const editor.Session, request: t.Request) !void {
    try t.validate(request.values);
    if (request.targets.len == 0 or request.targets.len > 512 or (request.scope == .section and request.targets.len != 1)) return error.InvalidPageSettingsTargets;
    const owners = try observe(a, session);
    defer a.free(owners);
    if (request.scope == .document and request.targets.len != owners.len) return error.IncompletePageSettingsTargets;
    const seen = try a.alloc(bool, owners.len);
    defer a.free(seen);
    @memset(seen, false);
    for (request.targets) |target| {
        if (target.section >= owners.len or seen[target.section]) return error.InvalidPageSettingsTargets;
        seen[target.section] = true;
        const current = owners[target.section].target orelse return error.UnsupportedPageSettingsOwner;
        if (!std.meta.eql(current, target)) return error.StalePageSettingsSnapshot;
    }
}
