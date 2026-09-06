const View = @import("list_header.zig").View;
/// Cell-specific bits of the caller-selected list layout; all raw bits survive.
pub const Attributes = struct {
    raw: u32,
    pub fn fromList(view: View) Attributes {
        return .{ .raw = view.attributes };
    }
    pub fn hasInnerMargins(self: Attributes) bool {
        return self.raw & (1 << 16) != 0;
    }
    pub fn isProtected(self: Attributes) bool {
        return self.raw & (1 << 17) != 0;
    }
    pub fn isHeader(self: Attributes) bool {
        return self.raw & (1 << 18) != 0;
    }
    pub fn isEditable(self: Attributes) bool {
        return self.raw & (1 << 19) != 0;
    }
};
