//! Internal XML span plan only. It cannot publish a file or commit a Session.
//! A complete note deletion must also resolve numbering/page references and
//! protected current-owner admission in the common History transaction.
const std = @import("std");
const trees = @import("xml_part_tree.zig");
const owners = @import("note_mutation_owner.zig");
const writer = @import("xml_source_writer.zig");
pub const Target = struct {
    section: usize,
    note_node: usize,
    kind: owners.Kind,
    expected_source_sha256: [32]u8,
    expected_marker_sha256: [32]u8,
};
pub const Plan = struct {
    owner: owners.Owner,
    source_sha256: [32]u8,
    marker_sha256: [32]u8,
    removals: [2]writer.Change,
    count: usize,
    // Deliberately no `bytes` or `committed` field. This plan is not a completed
    // note delete result, serializer receipt, origin, or current-owner lease.
    pub fn changes(self: *const Plan) []const writer.Change {
        return self.removals[0..self.count];
    }
    pub fn verifySource(self: *const Plan, tree: *const trees.Tree) !void {
        const current = digest(tree.source);
        if (!std.mem.eql(u8, &self.source_sha256, &current))
            return error.SourceHashMismatch;
    }
};
pub fn digest(bytes: []const u8) [32]u8 {
    var value: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &value, .{});
    return value;
}

pub fn prepare(a: std.mem.Allocator, tree: *const trees.Tree, target: Target) !Plan {
    const source_digest = digest(tree.source);
    if (!std.mem.eql(u8, &source_digest, &target.expected_source_sha256))
        return error.SourceHashMismatch;
    const owner = try owners.read(tree, target.note_node);
    if (owner.section != target.section or owner.kind != target.kind)
        return error.SourceBindingMismatch;
    const marker_digest = digest(tree.sourceOf(owner.control_node));
    if (!std.mem.eql(u8, &marker_digest, &target.expected_marker_sha256))
        return error.StaleNoteMutationOwner;
    // Validate the exact host's known cache only. Do not sweep/delete caches
    // belonging to unrelated paragraphs or opaque source objects.
    try @import("source_grid_line_cache.zig").validate(a, tree, owner.paragraph_node);
    const marker = tree.elements[owner.control_node];
    var result: Plan = .{
        .owner = owner,
        .source_sha256 = source_digest,
        .marker_sha256 = marker_digest,
        .removals = undefined,
        .count = 1,
    };
    result.removals[0] = .{ .start = marker.start_tag.start, .end = marker.end, .text = "", .serialized_xml = "" };
    var child = tree.elements[owner.paragraph_node].first_child;
    while (child) |node| : (child = tree.elements[node].next_sibling) {
        if (!tree.elements[node].is(@import("document_xml.zig").paragraph_uri, "linesegarray")) continue;
        if (result.count != 1) return error.UnsupportedSourceLineCache;
        result.removals[1] = .{ .start = tree.elements[node].start_tag.start, .end = tree.elements[node].end, .text = "", .serialized_xml = "" };
        result.count = 2;
    }
    if (result.count == 2 and result.removals[1].start < result.removals[0].start)
        std.mem.swap(writer.Change, &result.removals[0], &result.removals[1]);
    return result;
}
