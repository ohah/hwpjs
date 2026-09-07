const std = @import("std");
const prefix = @import("type_prefix.zig");
pub const Options = struct { max_bytes: usize = 64 * 1024 * 1024, max_records: usize = 100000 };
pub const Record = struct {
    language: [2]u8,
    country: [2]u8,
    /// Borrowed bytes. UTF-16BE content validity is not certified here.
    text: []const u8,
    extension: []const u8,
};
pub const View = struct {
    data: []const u8,
    count: usize,
    stride: usize,
    storage_start: usize,
    pub fn at(self: View, index: usize) !Record {
        if (index >= self.count) return error.InvalidIccMlucIndex;
        const raw = self.data[16 + index * self.stride ..][0..self.stride];
        const length = std.mem.readInt(u32, raw[4..8], .big);
        const offset = std.mem.readInt(u32, raw[8..12], .big);
        if (length % 2 != 0 or offset < self.storage_start or offset > self.data.len or length > self.data.len - offset) return error.InvalidIccMlucString;
        return .{ .language = raw[0..2].*, .country = raw[2..4].*, .text = self.data[offset..][0..length], .extension = raw[12..] };
    }
};
/// ICC 10.15 structure only. Shared/overlapping string storage is not duplicated.
/// Larger records preserve extension bytes; no meaning is assigned to extensions.
pub fn parse(data: []const u8, options: Options) !View {
    if (data.len > options.max_bytes) return error.LimitExceeded;
    const signature = try prefix.inspect(data);
    if (!std.mem.eql(u8, &signature, "mluc")) return error.InvalidIccMlucType;
    if (data.len < 16) return error.InvalidIccMlucSize;
    const count: usize = std.mem.readInt(u32, data[8..12], .big);
    const stride: usize = std.mem.readInt(u32, data[12..16], .big);
    if (count > options.max_records) return error.LimitExceeded;
    if (stride < 12) return error.InvalidIccMlucRecordSize;
    if (count > (data.len - 16) / stride) return error.InvalidIccMlucSize;
    const view: View = .{ .data = data, .count = count, .stride = stride, .storage_start = 16 + count * stride };
    for (0..count) |i| _ = try view.at(i);
    return view;
}
