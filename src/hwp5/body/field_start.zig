const Reader = @import("../../binary/reader.zig").Reader;
pub const Properties = struct {
    attributes: u32,
    other: u8,
    command: []const u8,
    instance_id: u32,
    extra: []const u8,
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
