/// Table 4 specifies the envelope, not the meaning of its fields.
/// Borrow both the specified core and any future extension without truncation.
pub const specified_size = 1032;
pub const View = struct {
    core: []const u8,
    extra: []const u8,

    pub fn parse(bytes: []const u8) !View {
        if (bytes.len < specified_size) return error.UnexpectedEnd;
        return .{ .core = bytes[0..specified_size], .extra = bytes[specified_size..] };
    }
};
