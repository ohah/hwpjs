const Reader = @import("../../binary/reader.zig").Reader;
pub fn supports(id: u32) bool {
    return (@import("control_rules.zig").expectedCode(id) orelse return false) == 3;
}
pub const Properties = struct {
    attributes: u32,
    other: u8,
    command: []const u8,
    instance_id: u32,
    extra: []const u8,
    pub fn editableReadOnly(self: Properties) bool {
        return self.attributes & 1 != 0;
    }
    pub fn updateKind(self: Properties) u4 {
        return @truncate(self.attributes >> 11);
    }
    pub fn modified(self: Properties) bool {
        return self.attributes & 0x8000 != 0;
    }
    pub fn unknownBits(self: Properties) u32 {
        return self.attributes & ~@as(u32, 0xf801);
    }
    /// Table 152, excluding the already consumed control ID. Never executes commands.
    pub fn parse(bytes: []const u8) !Properties {
        var r: Reader = .{ .bytes = bytes };
        const attributes = try r.readInt(u32);
        const other = try r.readInt(u8);
        const command = try @import("../utf16_string.zig").read(&r);
        const instance_id = try r.readInt(u32);
        return .{ .attributes = attributes, .other = other, .command = command, .instance_id = instance_id, .extra = bytes[r.offset..] };
    }
};
