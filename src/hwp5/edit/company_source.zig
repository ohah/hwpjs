//! Company 원본의 정확한 분류/종결 binding만 검증한다. 편집 권한은 부여하지 않는다.
const std = @import("std");
const Version = @import("../version.zig").Version;
const retained = @import("../body/retained_extended_field.zig");
const company = @import("../body/control_rules.zig").id("%usr");

pub fn has(source: []const u8) !bool {
    var it = @import("../record.zig").Iterator.init(source, .{});
    while (try it.next()) |entry| {
        if (entry.tag == 71 and (try @import("../body/control_header.zig").Header.parse(entry.payload)).id == company) return true;
    }
    return false;
}

/// 첫 통합은 정확히 한 개의 관측 Company field만 허용한다.
pub fn owner(a: std.mem.Allocator, source: []const u8, version: Version) !usize {
    try @import("source_policy.zig").validateCompanyTextSection(a, source, version);
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, source, version, .{});
    defer tree.deinit(a);
    var result: ?usize = null;
    for (tree.nodes) |*node| {
        if (node.record.framing.tag == 71) node.record.value = .{ .control_header = try @import("../body/control_header.zig").Header.parse(node.record.framing.payload) };
    }
    for (tree.nodes) |node| {
        if (node.record.framing.tag != 71) continue;
        const header = try @import("../body/control_header.zig").Header.parse(node.record.framing.payload);
        if (header.id != company) continue;
        if (result != null) return error.UnsupportedRetainedCompanyMultiplicity;
        const parent = node.parent orelse return error.SourceBindingMismatch;
        var protection = try retained.read(a, source, version, parent);
        defer protection.deinit(a);
        if (protection.fields.len != 1 or protection.fields[0].classification.kind != .company) return error.SourceBindingMismatch;
        result = parent;
    }
    const protected = result orelse return error.UnsupportedSectionControl;
    try @import("company_field_links.zig").validate(a, tree, protected);
    return protected;
}

/// 전용 plain transaction의 target 검사. 전체 section/current 검사는 Plan의 책임이다.
pub fn validateParagraph(a: std.mem.Allocator, source: []const u8, version: Version, paragraph: @import("../../model/document.zig").Paragraph) !void {
    const protected = try owner(a, source, version);
    if (paragraph.source_node == null or paragraph.parent_node != null or paragraph.header_template != null) return error.UnsupportedStructuralControl;
    if (try paragraph.originalNode() == protected) return error.ProtectedRetainedCompanyParagraph;
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, source, version, .{});
    defer tree.deinit(a);
    if (!try isPlainBody(a, tree, paragraph)) return error.ProtectedRetainedCompanyParagraph;
}

/// Native write eligibility and capability projection share this body boundary.
pub fn isPlainBody(a: std.mem.Allocator, tree: @import("../body/tree.zig").Tree, paragraph: @import("../../model/document.zig").Paragraph) !bool {
    if (paragraph.source_node == null or paragraph.parent_node != null or paragraph.header_template != null) return false;
    const node = try paragraph.originalNode();
    if (node >= tree.nodes.len or tree.nodes[node].record.framing.tag != 66) return error.SourceBindingMismatch;
    const bytes = try @import("plain_text_content.zig").textBytes(a, paragraph);
    defer a.free(bytes);
    @import("plain_text_content.zig").validatePlain(bytes) catch |err| switch (err) {
        error.UnsupportedParagraphTerminator, error.UnsupportedTextControl => return false,
        else => return err,
    };
    for (tree.nodes[node + 1 .. tree.nodes[node].subtree_end]) |child| {
        if (child.record.framing.tag == 71) return false;
    }
    return true;
}
