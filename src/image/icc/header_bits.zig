/// Shared ICC v2/v4 bit ownership. Interpretation is separate from acceptance.
pub const Flags = struct { embedded: bool, independent_use_prohibited: bool, unassigned_icc_flags: u16, vendor_flags: u16 };
pub fn flags(raw: u32) Flags {
    return .{ .embedded = raw & 1 != 0, .independent_use_prohibited = raw & 2 != 0, .unassigned_icc_flags = @intCast(raw & 0xfffc), .vendor_flags = @intCast(raw >> 16) };
}
pub const Attributes = struct { media_attributes: u4, unassigned_icc_attributes: u32, vendor_attributes: u32 };
pub fn attributes(raw: u64) Attributes {
    return .{ .media_attributes = @intCast(raw & 15), .unassigned_icc_attributes = @intCast(raw & 0xfffffff0), .vendor_attributes = @intCast(raw >> 32) };
}
