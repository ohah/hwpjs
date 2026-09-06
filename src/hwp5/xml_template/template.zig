const string = @import("string.zig");
/// Already decoded stream input. Missing and empty strings are distinct.
/// Compression/CFB lookup and XML validity are deliberately outside this boundary.
pub const Input = struct {
    schema_name: ?[]const u8 = null,
    schema: ?[]const u8 = null,
    instance: ?[]const u8 = null,
};
pub const Template = struct {
    schema_name: ?string.String,
    schema: ?string.String,
    instance: ?string.String,
    total_bytes: usize,
    trailing_bytes: usize,
    pub fn parse(input: Input, max_bytes: usize) !Template {
        var remaining = max_bytes;
        // Bound the aggregate before parsing; no unchecked sum of input lengths.
        for ([_]?[]const u8{ input.schema_name, input.schema, input.instance }) |optional| {
            if (optional) |bytes| {
                if (bytes.len > remaining) return error.LimitExceeded;
                remaining -= bytes.len;
            }
        }
        const name = try optionalString(input.schema_name);
        const schema = try optionalString(input.schema);
        const instance = try optionalString(input.instance);
        var trailing: usize = 0;
        for ([_]?string.String{ name, schema, instance }) |optional| {
            if (optional) |s| trailing += s.extra.len;
        }
        return .{ .schema_name = name, .schema = schema, .instance = instance, .total_bytes = max_bytes - remaining, .trailing_bytes = trailing };
    }
};
fn optionalString(bytes: ?[]const u8) !?string.String {
    return if (bytes) |b| try string.String.parse(b) else null;
}
