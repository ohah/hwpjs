//! 독립 파일 변환. 열린 편집 Session과 이력에는 접근하지 않는다.
const std = @import("std");
const package = @import("package.zig");

pub const Options = struct {
    max_input_bytes: usize = 64 * 1024 * 1024,
    max_output_bytes: usize = 128 * 1024 * 1024,
    max_xml_bytes: usize = 32 * 1024 * 1024,
    max_sections: usize = 4096,
    max_nodes: usize = 1_000_000,
};

pub fn transform(a: std.mem.Allocator, input: []const u8, section: usize, table_nodes: []const usize, options: Options) ![]u8 {
    if (input.len == 0 or input.len > options.max_input_bytes) return error.LimitExceeded;
    if (table_nodes.len == 0 or table_nodes.len > 4096) return error.InvalidTableDeletionTargets;
    var document = try package.inspectDocument(a, input, .{});
    defer document.deinit(a);
    try @import("file_transform_security.zig").validate(a, &document, options.max_xml_bytes);
    // 선택 구역 밖의 서명도 변경된 문서를 더 이상 보증하지 못한다.
    var trees = try document.readXmlTrees(a, .{ .max_total_owned_xml_bytes = options.max_input_bytes, .header = .{ .max_xml_bytes = options.max_xml_bytes }, .section = .{ .max_xml_bytes = options.max_xml_bytes, .max_nodes = options.max_nodes } });
    defer trees.deinit(a);
    try @import("file_transform_security.zig").validateTree(&trees.header);
    for (trees.sections) |*tree| try @import("file_transform_security.zig").validateTree(tree);
    var structure = try document.inspectStructure(a, .{ .max_sections = options.max_sections });
    defer structure.deinit(a);
    if (section >= structure.sections.len) return error.InvalidSectionIndex;
    const item = structure.sections[section].item_index;
    const entry_index = document.manifest.items[item].entry_index orelse return error.ExternalSpineXml;
    const xml = try document.archive.decode(document.archive.entries[entry_index], options.max_xml_bytes);
    defer a.free(xml);
    var tree = try @import("section_tree.zig").parse(a, xml, section, item, .{ .max_xml_bytes = options.max_xml_bytes, .max_nodes = options.max_nodes });
    defer tree.deinit(a);
    var candidate = try @import("table_deletion.zig").prepareMany(a, &tree, table_nodes, options.max_xml_bytes);
    defer candidate.deinit(a);
    return @import("../zip/replace_writer.zig").write(a, input, &.{.{ .entry_index = entry_index, .bytes = candidate.bytes }}, .{ .max_output_bytes = options.max_output_bytes });
}
