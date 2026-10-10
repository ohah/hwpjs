//! 여러 원본 필드 문단을 하나의 텍스트 소유 후보로 결합합니다. 게시는 별도입니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn prepare(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const model.Values, index: usize, right_index: usize, limit: usize) !model.Values {
    var plan = try @import("field_source_merge_plan.zig").prepare(a, trees, section, current, index, right_index, limit / @sizeOf(@import("field_position.zig").Position));
    defer plan.deinit(a);
    const left = &current.paragraphs[index];
    const right = &current.paragraphs[right_index];
    const rows = try a.alloc(model.Paragraph, current.paragraphs.len - 1);
    var initialized: usize = 0;
    errdefer {
        for (rows[0..initialized]) |*row| row.deinit(a);
        a.free(rows);
    }
    for (current.paragraphs, 0..) |*source, ordinal| {
        if (ordinal == right_index) continue;
        rows[initialized] = try source.clone(a);
        initialized += 1;
        if (ordinal != index) continue;
        const row = &rows[initialized - 1];
        row.pieces = try a.dupe(@import("paragraph_joined_values.zig").Piece, &plan.pieces);
        row.field_positions = try a.dupe(@import("field_position.zig").Position, plan.markers);
        var sites: std.ArrayList(@import("text_sites.zig").Site) = .empty;
        defer sites.deinit(a);
        errdefer for (sites.items) |site| a.free(site.text);
        for ([_]*const model.Paragraph{ left, right }) |part| for (part.sites.items) |site| {
            var copied = site;
            copied.text = try a.dupe(u8, site.text);
            errdefer a.free(copied.text);
            try sites.append(a, copied);
        };
        const owned = try sites.toOwnedSlice(a);
        row.sites.deinit(a);
        row.sites = .{ .items = owned };
        if (left.character_styles != null or right.character_styles != null) {
            const Joined = @import("paragraph_joined_values.zig").Joined;
            var one = try Joined.fromParagraph(a, left);
            defer one.deinit(a);
            var two = try Joined.fromParagraph(a, right);
            defer two.deinit(a);
            const styles = try @import("character_style_join.zig").prepareWithFields(a, &trees[section], &one, &two);
            if (row.character_styles) |previous| a.free(previous);
            row.character_styles = styles;
        }
    }
    const candidate: model.Values = .{ .paragraphs = rows };
    _ = try candidate.byteSize(limit);
    return candidate;
}
