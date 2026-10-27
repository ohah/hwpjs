//! 새 BorderFill과 새 문단 resource를 준비한 뒤, 새 문단의 참조만 바꿉니다.
const std = @import("std");
pub fn write(a: std.mem.Allocator, input: []const u8, version: @import("../version.zig").Version, source_id: u32, alignment: u32, margins: @import("paragraph_margin_payload.zig").Patch, spacing: ?@import("paragraph_spacing_payload.zig").Spacing, flags: @import("../../model/paragraph_flags.zig").Patch, border: @import("../../model/border_fill_patch.zig").Patch, limit: usize) !@import("paragraph_alignment_docinfo.zig").Result {
    const ref = try @import("border_fill_paragraph_current.zig").reference(input, version, source_id);
    const fill = try @import("border_fill_docinfo_patch.zig").write(a, input, version, ref, border, limit);
    defer a.free(fill.bytes);
    const result = try @import("paragraph_alignment_docinfo.zig").writePreparedWithFlags(a, fill.bytes, version, source_id, alignment, margins, spacing, flags, limit);
    errdefer a.free(result.bytes);
    var it = @import("../record.zig").Iterator.init(result.bytes, .{});
    var n: u32 = 0;
    while (try it.next()) |record| if (record.tag == 25) {
        if (n == result.id) {
            if (record.payload.len < 34) return error.UnexpectedEnd;
            const start = record.offset + record.raw.len - record.payload.len + 32;
            std.mem.writeInt(u16, result.bytes[start..][0..2], fill.id, .little);
            return result;
        }
        n += 1;
    };
    return error.InvalidParagraphShapeReference;
}
