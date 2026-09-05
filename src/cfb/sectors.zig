const h = @import("header.zig");
pub const Sectors = struct {
    bytes: []const u8,
    header: h.Header,
    pub fn count(self: Sectors) usize {
        return (self.bytes.len - 1) / self.header.sector_size;
    }
    pub fn get(self: Sectors, id: usize) ![]const u8 {
        if (id >= self.count()) return error.InvalidSector;
        const start = (id + 1) * self.header.sector_size;
        return self.bytes[start..@min(self.bytes.len, start + self.header.sector_size)];
    }
};
