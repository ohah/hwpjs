/// Table 87 raw views, shared by shape borders and OLE. Reserved values stay raw.
pub const Attributes = struct {
    raw: u32,
    pub fn lineType(self: Attributes) u6 {
        return @truncate(self.raw);
    }
    pub fn lineEnd(self: Attributes) u4 {
        return @truncate(self.raw >> 6);
    }
    pub fn startArrow(self: Attributes) u6 {
        return @truncate(self.raw >> 10);
    }
    pub fn endArrow(self: Attributes) u6 {
        return @truncate(self.raw >> 16);
    }
    pub fn startSize(self: Attributes) u4 {
        return @truncate(self.raw >> 22);
    }
    pub fn endSize(self: Attributes) u4 {
        return @truncate(self.raw >> 26);
    }
    pub fn startFilled(self: Attributes) bool {
        return self.raw & (1 << 30) != 0;
    }
    pub fn endFilled(self: Attributes) bool {
        return self.raw & (1 << 31) != 0;
    }
};
