//! 원본 셀/목록 ID와 테두리 리소스를 연결합니다. 표시 기본값은 만들지 않습니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const borders = @import("border_fill_source.zig");
pub const Cell = struct { table_node: usize, cell_node: usize, list_node: usize, border_fill_id: ?u32, style_index: ?usize };
pub const Report = struct {
    cells: []Cell,
    styles: []borders.Source,
    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        for (self.styles) |*style| style.deinit();
        a.free(self.styles);
        a.free(self.cells);
        self.* = undefined;
    }
};
pub fn readTrees(a: std.mem.Allocator, section: *const Tree, header: *const Tree) !Report {
    var cells: std.ArrayList(Cell) = .empty;
    defer cells.deinit(a);
    var styles: std.ArrayList(borders.Source) = .empty;
    errdefer {
        for (styles.items) |*style| style.deinit();
        styles.deinit(a);
    }
    var indices: std.AutoHashMap(u32, usize) = .init(a);
    defer indices.deinit();
    // Prepare only when an actual cell first requests a style. No-ID cells
    // must not expose invalid header/container/ID errors or allocate an index.
    var source_index: ?borders.Index = null;
    defer if (source_index) |*index| index.deinit();
    for (section.elements, 0..) |element, node| {
        if (!fields.childIs(section, node, "tc")) continue;
        const row = element.parent orelse return error.InvalidTableBorderCell;
        if (!fields.childIs(section, row, "tr")) return error.InvalidTableBorderCell;
        const table = section.elements[row].parent orelse return error.InvalidTableBorderCell;
        if (!fields.childIs(section, table, "tbl")) return error.InvalidTableBorderCell;
        var missing: usize = 0;
        var duplicate: usize = 0;
        const list = fields.uniqueChild(section, node, "subList", &missing, &duplicate) orelse return error.InvalidTableBorderCell;
        const id = try fields.optionalUnsigned(a, section, node, "borderFillIDRef", 4096);
        var index: ?usize = null;
        if (id) |key| {
            if (indices.get(key)) |known| index = known else {
                if (styles.items.len >= 4096) return error.LimitExceeded;
                if (source_index == null) source_index = borders.Index.init(a, header);
                var style = try borders.readWithIndex(a, header, key, &source_index.?);
                errdefer style.deinit();
                const next = styles.items.len;
                try indices.put(key, next);
                try styles.append(a, style);
                index = next;
            }
        }
        if (cells.items.len >= 100000) return error.LimitExceeded;
        try cells.append(a, .{ .table_node = table, .cell_node = node, .list_node = list, .border_fill_id = id, .style_index = index });
    }
    const owned = try cells.toOwnedSlice(a);
    errdefer a.free(owned);
    return .{ .cells = owned, .styles = try styles.toOwnedSlice(a) };
}
pub fn read(a: std.mem.Allocator, session: *const @import("editor_session.zig").Session, section: usize) !Report {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    // 테두리 편집 intent는 아직 없으므로 보존 중인 header가 단일 원본입니다.
    var document = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    var header = try document.readHeaderTree(a, .{});
    defer header.deinit(a);
    var result = try readTrees(a, &session.sections[section].tree, &header);
    errdefer result.deinit(a);
    const selected_profile = try @import("document_provenance.zig").profile(session);
    try @import("source_color_projection.zig").enrichReport(&result, selected_profile);
    return result;
}
