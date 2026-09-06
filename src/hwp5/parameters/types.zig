pub const HeaderLayout = enum { spec4, observed6 };
pub const NullLayout = enum { spec_u32, observed_empty };
pub const Options = struct {
    header_layout: HeaderLayout,
    null_layout: NullLayout,
    max_depth: u8 = 32,
    max_nodes: usize = 100000,
    pub fn validate(self: Options) !void {
        if (self.max_depth > 64 or self.max_nodes == 0) return error.InvalidParameterLimit;
    }
};
pub const Set = struct { id: u16, count: u16, reserved: ?u16 };
/// Observed array: signed count, shared item ID only when nonempty, then typed values.
pub const Array = struct { count: u16, shared_id: ?u16 };
pub const Value = union(enum) { set: Set, array: Array, null_value: ?u32, integer: u32, string: []const u8, binary_id: u16 };
pub const Node = struct {
    item_id: ?u16,
    wire_type: ?u16,
    id_on_wire: bool,
    parent: ?usize,
    subtree_end: usize,
    raw: []const u8,
    value: Value,
};
