const Reader = @import("../../binary/reader.zig").Reader;
pub const Run = struct {
    start: u32,
    char_shape_id: u32,
    pub fn read(r: *Reader) !Run {
        return .{ .start = try r.readInt(u32), .char_shape_id = try r.readInt(u32) };
    }
};
pub const Runs = @import("../../binary/record_array.zig").Records(Run, 8);
