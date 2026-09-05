pub const Version = struct {
    raw: u32,

    pub fn major(self: Version) u8 {
        return @truncate(self.raw >> 24);
    }
    pub fn minor(self: Version) u8 {
        return @truncate(self.raw >> 16);
    }
    pub fn patch(self: Version) u8 {
        return @truncate(self.raw >> 8);
    }
    pub fn revision(self: Version) u8 {
        return @truncate(self.raw);
    }
    pub fn requireSupported(self: Version) !void {
        // 5.1 framing is verified against real fixtures, not a claim that all
        // version-specific payload fields share the 5.0 layout.
        if (self.major() != 5 or self.minor() > 1) return error.UnsupportedVersion;
    }
};
