const Reader = @import("../../binary/reader.zig").Reader;
pub const Segment = struct {
    start: u32,
    y: i32,
    height: i32,
    text_height: i32,
    baseline: i32,
    spacing: i32,
    x: i32,
    width: i32,
    flags: u32,
    pub fn read(r: *Reader) !Segment {
        return .{ .start = try r.readInt(u32), .y = try r.readInt(i32), .height = try r.readInt(i32), .text_height = try r.readInt(i32), .baseline = try r.readInt(i32), .spacing = try r.readInt(i32), .x = try r.readInt(i32), .width = try r.readInt(i32), .flags = try r.readInt(u32) };
    }
};
pub const Segments = @import("../../binary/record_array.zig").Records(Segment, 36);
