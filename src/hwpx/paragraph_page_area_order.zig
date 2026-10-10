//! 쪽 영역을 유지한 원본과 continuation의 표시 순서/저장 그룹을 분리합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const model = @import("paragraph_structure_values.zig");

fn nestedArea(tree: *const Tree, owner: usize, child: usize) bool {
    if (owner >= tree.elements.len or child >= tree.elements.len) return false;
    var cursor = tree.elements[child].parent;
    var area = false;
    while (cursor) |index| {
        if (index == owner) return area;
        if (@import("retained_header_footer.zig").supported(tree, index)) area = true;
        cursor = tree.elements[index].parent;
    }
    return false;
}

/// 새 continuation은 원본에 남은 쪽 영역 문단 뒤에 표시됩니다.
pub fn afterSplit(tree: *const Tree, rows: []model.Paragraph, left: usize) void {
    if (left + 1 >= rows.len or rows[left].generated_id != null) return;
    const owner = rows[left].template_element;
    const continuation = rows[left + 1];
    var end = left + 2;
    while (end < rows.len and nestedArea(tree, owner, rows[end].template_element)) : (end += 1) {}
    if (end == left + 2) return;
    std.mem.copyForwards(model.Paragraph, rows[left + 1 .. end - 1], rows[left + 2 .. end]);
    rows[end - 1] = continuation;
}

/// 검증된 양쪽 귀속에 따라 중첩 문단을 원자적으로 재배치합니다.
pub fn repartitionSplit(a: std.mem.Allocator, tree: *const Tree, rows: []model.Paragraph, left: usize, right: usize) !void {
    return repartitionSplitMode(a, tree, rows, left, right, false);
}

/// 여러 원본에서 온 선언의 현재 귀속을 사용하되 순서 조립은 공유합니다.
pub fn repartitionSplitWithColumnPageAreas(a: std.mem.Allocator, tree: *const Tree, rows: []model.Paragraph, left: usize, right: usize) !void {
    return repartitionSplitMode(a, tree, rows, left, right, true);
}

fn nestedSourceArea(tree: *const Tree, owner: *const model.Paragraph, child: usize, mixed: bool) bool {
    if (!mixed) return nestedArea(tree, owner.template_element, child);
    for (owner.pieces orelse return false) |piece| if (nestedArea(tree, piece.template_element, child)) return true;
    return false;
}

fn repartitionSplitMode(a: std.mem.Allocator, tree: *const Tree, rows: []model.Paragraph, left: usize, right: usize, mixed: bool) !void {
    if (left >= right or right >= rows.len) return error.InvalidParagraphIndex;
    const group = [_]model.Paragraph{ rows[left], rows[right] };
    if (group[0].template_element != group[1].template_element or group[1].generated_id == null) return error.SourceBindingMismatch;
    if (mixed) {
        const values: model.Values = .{ .paragraphs = rows };
        const grouped = try saveView(a, tree, &values);
        defer if (grouped) |view| a.free(view);
        const view: model.Values = .{ .paragraphs = grouped orelse rows };
        var found: ?usize = null;
        for (view.paragraphs, 0..) |row, ordinal| if (row.sites.items.ptr == group[0].sites.items.ptr) {
            if (found != null) return error.SourceBindingMismatch;
            found = ordinal;
        };
        const range = try @import("column_boundary_group.zig").locate(&view, found orelse return error.SourceBindingMismatch);
        try @import("column_page_area_group_validate.zig").validate(a, tree, view.paragraphs[range.start..range.end]);
    } else {
        var previous: ?usize = null;
        for (&group) |*row| {
            try @import("page_area_current_validate.zig").validatePartitionMember(a, tree, row);
            for (row.page_area_positions orelse return error.MissingPageAreaPositions) |area| {
                if (previous) |before| if (area.source_element <= before) return error.SourceBindingMismatch;
                previous = area.source_element;
            }
        }
    }
    var end = right + 1;
    while (end < rows.len and nestedSourceArea(tree, &group[0], rows[end].template_element, mixed)) : (end += 1) {}
    const ordered = try a.alloc(model.Paragraph, end - left);
    defer a.free(ordered);
    var count: usize = 0;
    for (group) |owner| {
        ordered[count] = owner;
        count += 1;
        for (rows[left + 1 .. end], left + 1..) |child, ordinal| {
            if (ordinal == right) continue;
            if (!nestedSourceArea(tree, &owner, child.template_element, mixed)) return error.CrossParagraphOwner;
            var belongs = false;
            for (owner.page_area_positions.?) |area| {
                var cursor: ?usize = child.template_element;
                while (cursor) |index| {
                    if (index == area.source_element) {
                        belongs = true;
                        break;
                    }
                    cursor = tree.elements[index].parent;
                }
            }
            if (belongs) {
                if (count >= ordered.len) return error.SourceBindingMismatch;
                ordered[count] = child;
                count += 1;
            }
        }
    }
    if (count != ordered.len) return error.SourceBindingMismatch;
    @memcpy(rows[left..end], ordered);
}

/// 저장기에만 빌린 얕은 그룹 뷰를 제공합니다. 사이트/문단은 소유하지 않습니다.
pub fn saveView(a: std.mem.Allocator, tree: *const Tree, values: *const model.Values) !?[]model.Paragraph {
    var needed = false;
    for (values.paragraphs, 0..) |row, index| {
        if (row.generated_id == null or index == 0) continue;
        const previous = values.paragraphs[index - 1];
        if (previous.template_element != row.template_element and nestedSourceArea(tree, &row, previous.template_element, row.column_boundaries != null and row.page_area_positions != null and row.pieces != null)) needed = true;
    }
    if (!needed) return null;
    const rows = try a.alloc(model.Paragraph, values.paragraphs.len);
    errdefer a.free(rows);
    const emitted = try a.alloc(bool, rows.len);
    defer a.free(emitted);
    @memset(emitted, false);
    var count: usize = 0;
    for (values.paragraphs, 0..) |row, index| {
        if (emitted[index]) continue;
        rows[count] = row;
        count += 1;
        emitted[index] = true;
        if (row.generated_id != null) continue;
        var next = index + 1;
        while (next < values.paragraphs.len) : (next += 1) {
            const child = values.paragraphs[next];
            if (nestedSourceArea(tree, &row, child.template_element, row.column_boundaries != null and row.page_area_positions != null and row.pieces != null)) continue;
            if (child.template_element != row.template_element or child.generated_id == null) break;
            rows[count] = child;
            count += 1;
            emitted[next] = true;
        }
    }
    std.debug.assert(count == rows.len);
    return rows;
}
