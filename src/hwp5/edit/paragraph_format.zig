//! 기존 문단 모양 참조만 교체하며 DocInfo 리소스를 생성하지 않습니다.
const std = @import("std");
const model = @import("../../model/document.zig");
pub const Edit = struct { section: usize, paragraph: usize, para_shape_id: u32 };

pub fn apply(paragraph: *model.Paragraph, id: u32, resource_count: usize) !void {
    if (id > std.math.maxInt(u16) or id >= resource_count) return error.InvalidParagraphShapeReference;
    paragraph.para_shape_id = @intCast(id);
}
