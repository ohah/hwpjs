const Reader = @import("../../binary/reader.zig").Reader;
const Border = @import("border_line.zig").Border;
pub const tag: u10 = 92;
/// Observed 22-byte MEMO_SHAPE prefix; no inferred enum defaults or normalization.
pub const Shape = struct {
    width: u32,
    border: Border,
    fill_color: u32,
    active_color: u32,
    unknown_raw: u32,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !Shape {
        var r: Reader = .{ .bytes = bytes };
        return .{ .width = try r.readInt(u32), .border = try Border.read(&r), .fill_color = try r.readInt(u32), .active_color = try r.readInt(u32), .unknown_raw = try r.readInt(u32), .extra = bytes[r.offset..] };
    }
};
