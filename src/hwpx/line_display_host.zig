//! 선의 원본 문단과 현재 보호 앵커를 연결합니다. 좌표 변환은 별도입니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const common = @import("drawing_display_host.zig");
const policy: common.Policy = .{ .local = "line", .kind = .line, .invalid_node = error.InvalidLineGeometryNode, .switch_host = error.UnsupportedLineSwitchHost, .missing_paragraph = error.MissingLineDisplayParagraph, .unsupported_anchor = error.UnsupportedLineAnchor };

pub fn sourceTemplate(tree: *const Tree, node: usize) !usize {
    return common.sourceTemplate(tree, node, policy);
}

pub fn sourceAnchor(tree: *const Tree, node: usize) !usize {
    return common.sourceAnchor(tree, node, policy);
}

pub fn currentOrdinal(tree: *const Tree, paragraphs: []const Paragraph, first: usize, node: usize) !usize {
    return common.currentOrdinal(tree, paragraphs, first, node, policy);
}

pub fn anchorUnit(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, node: usize) !usize {
    return common.anchorUnit(a, tree, paragraph, node, policy);
}
