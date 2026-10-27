//! 현재 style_id와 실제 Style record의 리소스 참조만 사용합니다.
const std = @import("std");
const m = @import("../../model/formatting_patch.zig");
pub fn read(session: *@import("style_preservation.zig").Session, a: std.mem.Allocator, owner: m.Owner) !m.ResetResources {
    const selected = try session.paragraph(owner.section, owner.paragraph);
    var source = try session.formattingSource(a);
    defer source.deinit();
    var it = @import("../record.zig").Iterator.init(source.bytes, .{});
    var ordinal: u32 = 0;
    while (try it.next()) |record| if (record.tag == 26) {
        if (ordinal == selected.style_id) {
            const style = try @import("../docinfo/style.zig").Style.parseWithCharacterPolicy(record.payload, .observed_absent);
            if (style.attributes & 7 != 0) return error.UnsupportedResetStyle;
            if (style.para_shape_id >= session.paragraphShapeCount()) return error.InvalidParagraphShapeReference;
            var result: m.ResetResources = .{ .style_id = selected.style_id, .paragraph = style.para_shape_id };
            if (style.char_shape_present) {
                if (style.char_shape_id >= session.characterShapeCount()) return error.InvalidCharacterShapeReference;
                result.character = style.char_shape_id;
            }
            return result;
        }
        ordinal += 1;
    };
    return error.MissingResetStyle;
}
