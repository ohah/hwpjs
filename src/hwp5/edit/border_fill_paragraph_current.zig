//! 현재 문단 shape가 실제 참조하는 BorderFill만 읽습니다.
const p = @import("../../model/border_fill_patch.zig");
pub fn reference(input: []const u8, version: @import("../version.zig").Version, identity: u32) !u16 {
    var it = @import("../record.zig").Iterator.init(input, .{});
    var n: u32 = 0;
    while (try it.next()) |record| if (record.tag == 25) {
        if (n == identity) return (try @import("../docinfo/para_shape.zig").ParaShape.parse(record.payload, version)).border_fill_id;
        n += 1;
    };
    return error.InvalidParagraphShapeReference;
}
pub fn observe(input: []const u8, version: @import("../version.zig").Version, identity: u32) !p.Value {
    return @import("border_fill_payload_patch.zig").observe(try @import("border_fill_docinfo_patch.zig").resource(input, try reference(input, version, identity)));
}

pub fn alignment(input: []const u8, version: @import("../version.zig").Version, identity: u32) !u32 {
    var it = @import("../record.zig").Iterator.init(input, .{});
    var n: u32 = 0;
    while (try it.next()) |record| if (record.tag == 25) {
        if (n == identity) return ((try @import("../docinfo/para_shape.zig").ParaShape.parse(record.payload, version)).attributes >> 2) & 7;
        n += 1;
    };
    return error.InvalidParagraphShapeReference;
}
