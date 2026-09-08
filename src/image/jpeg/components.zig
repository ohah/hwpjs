const Reader = @import("../../binary/reader.zig").Reader;
const Records = @import("../../binary/record_array.zig").Records;
pub const FrameComponent = struct {
    id: u8,
    sampling: u8,
    quantization: u8,
    pub fn read(r: *Reader) !FrameComponent {
        return .{ .id = try r.readInt(u8), .sampling = try r.readInt(u8), .quantization = try r.readInt(u8) };
    }
    pub fn horizontal(self: FrameComponent) u8 {
        return self.sampling >> 4;
    }
    pub fn vertical(self: FrameComponent) u8 {
        return self.sampling & 15;
    }
};
pub const ScanComponent = struct {
    id: u8,
    tables: u8,
    pub fn read(r: *Reader) !ScanComponent {
        return .{ .id = try r.readInt(u8), .tables = try r.readInt(u8) };
    }
    pub fn dc(self: ScanComponent) u8 {
        return self.tables >> 4;
    }
    pub fn ac(self: ScanComponent) u8 {
        return self.tables & 15;
    }
};
pub const FrameComponents = Records(FrameComponent, 3);
pub const ScanComponents = Records(ScanComponent, 2);
