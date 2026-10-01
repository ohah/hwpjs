const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
pub const modified_mask: u32 = 1 << 15;
pub fn supports(id: u32) bool {
    return (@import("control_rules.zig").expectedCode(id) orelse return false) == 3;
}
pub const Properties = struct {
    attributes: u32,
    other: u8,
    command: []const u8,
    instance_id: u32,
    extra: []const u8,
    /// Only call for a %fmu control. No arithmetic or stale-cache promotion.
    pub fn formulaView(self: Properties) !@import("formula_command.zig").View {
        return @import("formula_command.zig").View.parse(self.command);
    }
    /// Transient serialization only, excluding CTRL_HEADER's control ID.
    pub fn withCommand(self: Properties, a: std.mem.Allocator, command: []const u8, attributes: u32) ![]u8 {
        if (command.len % 2 != 0) return error.InvalidTextSize;
        if (command.len / 2 > std.math.maxInt(u16)) return error.LimitExceeded;
        const prefix = std.math.add(usize, 11, command.len) catch return error.LimitExceeded;
        const length = std.math.add(usize, prefix, self.extra.len) catch return error.LimitExceeded;
        const bytes = try a.alloc(u8, length);
        std.mem.writeInt(u32, bytes[0..4], attributes, .little);
        bytes[4] = self.other;
        std.mem.writeInt(u16, bytes[5..7], @intCast(command.len / 2), .little);
        @memcpy(bytes[7..][0..command.len], command);
        std.mem.writeInt(u32, bytes[7 + command.len ..][0..4], self.instance_id, .little);
        @memcpy(bytes[prefix..], self.extra);
        return bytes;
    }
    pub fn editableReadOnly(self: Properties) bool {
        return self.attributes & 1 != 0;
    }
    pub fn updateKind(self: Properties) u4 {
        return @truncate(self.attributes >> 11);
    }
    pub fn modified(self: Properties) bool {
        return self.attributes & modified_mask != 0;
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
