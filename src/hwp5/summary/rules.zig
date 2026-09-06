const Value = @import("value.zig").Value;
pub fn known(id: u32) bool {
    return switch (id) {
        0, 1, 2, 3, 4, 5, 6, 8, 9, 11, 12, 13, 14, 20, 21 => true,
        else => false,
    };
}
pub fn validate(id: u32, value: Value) !void {
    if (id == 1 and value != .i16) return error.InvalidSummaryPropertyType;
    if (value == .unsupported) return; // explicit deferred type, never a checked value
    const valid = switch (id) {
        2, 3, 4, 5, 6, 8, 9, 20 => value == .utf16 or value == .encoded_string,
        11, 12, 13 => value == .filetime,
        14, 21 => value == .i32,
        else => true,
    };
    if (!valid) return error.InvalidSummaryPropertyType;
}
