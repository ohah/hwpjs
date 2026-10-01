//! Logical ownership gate, separate from owned merge content and serialization.
const std = @import("std");
const model = @import("../../model/document.zig");
const Tree = @import("../body/tree.zig").Tree;
const Version = @import("../version.zig").Version;
const owners = @import("paragraph_owner.zig");

fn nodeOf(tree: Tree, p: model.Paragraph) !usize {
    const node = if (p.source_node != null) try p.originalNode() else p.header_template orelse return error.MissingParagraphTemplate;
    if (node >= tree.nodes.len or tree.nodes[node].record.value != .header) return error.SourceBindingMismatch;
    const parent: ?usize = if (p.parent_node) |value| value else null;
    if (parent != tree.nodes[node].parent) return error.SourceBindingMismatch;
    if (p.source_node == null and p.instance_id == 0) return error.InvalidParagraphInstanceId;
    return node;
}

/// Return shared LIST_HEADER, or null for two root paragraphs.
/// Caller separately validates whole topology and content/source eligibility.
pub fn validate(a: std.mem.Allocator, tree: Tree, section: model.Section, left_index: usize, version: Version) !?usize {
    if (section.source_record_count != tree.nodes.len) return error.SourceBindingMismatch;
    if (left_index >= section.paragraphs.len or section.paragraphs.len - left_index < 2) return error.InvalidParagraph;
    const left = section.paragraphs[left_index];
    const right = section.paragraphs[left_index + 1];
    const first = try nodeOf(tree, left);
    const second = try nodeOf(tree, right);
    if (left.parent_node != right.parent_node) return error.ParagraphOwnerMismatch;
    var groups = try owners.inspectGroups(a, tree, version);
    defer groups.deinit(a);
    const first_owner = try owners.logicalOwner(tree, groups, first);
    const second_owner = try owners.logicalOwner(tree, groups, second);
    if (first_owner != second_owner) return error.ParagraphOwnerMismatch;
    try owners.validate(a, tree, first, version);
    try owners.validate(a, tree, second, version);
    return first_owner;
}

test "paragraph merge scope rejects actual sibling cells sharing parent and accepts split pair" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/software.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var file = try @import("../text_source.zig").Source.open(a, input);
    defer file.deinit();
    const raw = try file.decodeSection(a, 0);
    defer a.free(raw);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, file.header.version(), &.{raw});
    defer document.deinit(a);
    var tree = try Tree.parseTextPreview(a, raw, file.header.version(), .{});
    defer tree.deinit(a);
    var groups = try owners.inspectGroups(a, tree, file.header.version());
    defer groups.deinit(a);
    const section = &document.sections[0];
    var rejected: usize = 0;
    for (section.paragraphs[0 .. section.paragraphs.len - 1], 0..) |left, index| {
        const right = section.paragraphs[index + 1];
        if (left.parent_node == null or left.parent_node != right.parent_node) continue;
        if (try owners.logicalOwner(tree, groups, left.source_node.?) == try owners.logicalOwner(tree, groups, right.source_node.?)) continue;
        try std.testing.expectError(error.ParagraphOwnerMismatch, validate(a, tree, section.*, index, file.header.version()));
        rejected += 1;
    }
    try std.testing.expect(rejected > 0);
    try @import("paragraph_split.zig").apply(a, section, raw, file.header.version(), 2, 1, 0xfffffffe, 1000);
    try std.testing.expect((try validate(a, tree, section.*, 2, file.header.version())) != null);
    try std.testing.expectError(error.InvalidParagraph, validate(a, tree, section.*, section.paragraphs.len - 1, file.header.version()));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, borrowed: Tree, current: model.Section, version: Version) !void {
            _ = try validate(allocator, borrowed, current, 2, version);
        }
    }.run, .{ tree, section.*, file.header.version() });
}
