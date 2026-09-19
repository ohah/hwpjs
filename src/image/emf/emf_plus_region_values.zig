pub const NodeType = enum(u32) {
    and_ = 0x0000_0001,
    or_ = 0x0000_0002,
    xor = 0x0000_0003,
    exclude = 0x0000_0004,
    complement = 0x0000_0005,
    rect = 0x1000_0000,
    path = 0x1000_0001,
    empty = 0x1000_0002,
    infinite = 0x1000_0003,

    pub fn parse(raw: u32) !NodeType {
        return switch (raw) {
            1...5, 0x1000_0000...0x1000_0003 => @enumFromInt(raw),
            else => error.InvalidEmfPlusRegionNodeType,
        };
    }

    pub fn hasChildren(self: NodeType) bool {
        return switch (self) {
            .and_, .or_, .xor, .exclude, .complement => true,
            .rect, .path, .empty, .infinite => false,
        };
    }
};

test "EMF+ RegionNodeDataType accepts only the nine sparse values" {
    const std = @import("std");
    inline for (.{ 1, 2, 3, 4, 5, 0x1000_0000, 0x1000_0001, 0x1000_0002, 0x1000_0003 }) |raw|
        _ = try NodeType.parse(raw);
    inline for (.{ 0, 6, 0x0fff_ffff, 0x1000_0004, 0xffff_ffff }) |raw|
        try std.testing.expectError(error.InvalidEmfPlusRegionNodeType, NodeType.parse(raw));
}
