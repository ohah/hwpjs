//! Command-local table ownership across source materialization; no external IDs.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const Kind = enum { root, paragraph, table, row, cell, list };
/// Cache removal needs a physical source owner, not a matching descendant name.
/// Deliberately excludes opaque wrappers and compatibility branches. This does
/// not broaden table relocation or infer ownership from external paragraph IDs.
pub fn admitCacheParagraph(t: *const Tree, paragraph: usize) !void {
    if (paragraph >= t.elements.len or !fields.childIs(t, paragraph, "p")) return error.UnsupportedSourceLineCache;
    var node = paragraph;
    var depth: usize = 0;
    while (t.elements[node].parent) |p| {
        depth += 1;
        if (depth > 64) return error.UnsupportedSourceLineCache;
        const root = t.elements[p].parent == null and t.elements[p].is(@import("document_xml.zig").section_uri, "sec");
        const admitted = if (fields.childIs(t, node, "p"))
            root or fields.childIs(t, p, "subList")
        else if (fields.childIs(t, node, "subList"))
            fields.childIs(t, p, "tc")
        else if (fields.childIs(t, node, "tc"))
            fields.childIs(t, p, "tr")
        else if (fields.childIs(t, node, "tr"))
            fields.childIs(t, p, "tbl")
        else if (fields.childIs(t, node, "tbl"))
            fields.childIs(t, p, "run")
        else if (fields.childIs(t, node, "run"))
            fields.childIs(t, p, "p")
        else
            false;
        if (!admitted) return error.UnsupportedSourceLineCache;
        if (root) return;
        node = p;
    }
    return error.UnsupportedSourceLineCache;
}
fn kind(t: *const Tree, node: usize) !Kind {
    if (node >= t.elements.len) return error.SourceBindingMismatch;
    if (t.elements[node].parent == null) return .root;
    inline for (.{ .{ "p", Kind.paragraph }, .{ "tbl", Kind.table }, .{ "tr", Kind.row }, .{ "tc", Kind.cell }, .{ "subList", Kind.list } }) |entry| {
        if (fields.childIs(t, node, entry[0])) return entry[1];
    }
    return error.UnsupportedSourceTableOwnerPath;
}
fn parent(t: *const Tree, node: usize) !?usize {
    var p = t.elements[node].parent;
    if (p) |run| if (fields.childIs(t, run, "run")) {
        p = t.elements[run].parent;
        if (p == null or !fields.childIs(t, p.?, "p")) return error.UnsupportedSourceTableOwnerPath;
    };
    if (p) |i| _ = try kind(t, i);
    return p;
}
fn rank(t: *const Tree, node: usize, owner: ?usize, k: Kind) !usize {
    var count: usize = 0;
    for (t.elements[0..node], 0..) |_, i| {
        const candidate = kind(t, i) catch continue;
        if (candidate == k) {
            const candidate_owner = parent(t, i) catch continue;
            if (candidate_owner == owner) count += 1;
        }
    }
    return count;
}
pub fn verify(before: *const Tree, before_node: usize, after: *const Tree, after_node: usize) !void {
    var b: ?usize = before_node;
    var c: ?usize = after_node;
    var depth: usize = 0;
    while (b != null and c != null) {
        depth += 1;
        if (depth > 64) return error.LimitExceeded;
        const bk = try kind(before, b.?);
        const ck = try kind(after, c.?);
        if (bk != ck or !std.mem.eql(u8, before.elements[b.?].name.uri, after.elements[c.?].name.uri)) return error.SourceBindingMismatch;
        const bp = try parent(before, b.?);
        const cp = try parent(after, c.?);
        if (try rank(before, b.?, bp, bk) != try rank(after, c.?, cp, ck)) return error.SourceBindingMismatch;
        b = bp;
        c = cp;
    }
    if (b != null or c != null) return error.SourceBindingMismatch;
}
