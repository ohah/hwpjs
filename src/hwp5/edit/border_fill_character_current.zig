//! 현재 DocInfo를 입력받아 조회/멱등성 비교를 공유합니다.
const p = @import("../../model/border_fill_patch.zig");
pub fn observe(input: []const u8, version: @import("../version.zig").Version, identity: u32) !p.Value {
    var it = @import("../record.zig").Iterator.init(input, .{});
    var n: u32 = 0;
    while (try it.next()) |record| if (record.tag == 21) {
        if (n == identity) {
            const shape = try @import("../docinfo/char_shape.zig").CharShape.parse(record.payload, version);
            const resource = try @import("border_fill_docinfo_patch.zig").resource(input, shape.border_fill_id orelse return error.MissingBorderFillReference);
            return @import("border_fill_payload_patch.zig").observe(resource);
        }
        n += 1;
    };
    return error.InvalidCharacterShapeReference;
}
pub fn matches(input: []const u8, version: @import("../version.zig").Version, identity: u32, patch: p.Patch) !bool {
    return p.matches(try observe(input, version, identity), patch);
}
