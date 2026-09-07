const std = @import("std");
const File = @import("../../cfb/reader.zig").File;
const encoding = @import("selected_encoding.zig");
pub const Options = struct {
    encoding: encoding.Encoding,
    max_decoded_bytes: usize = 64 * 1024 * 1024,
};
pub const Report = struct {
    present: bool = false,
    declared: bool,
    schema_name_units: ?usize = null,
    schema_units: ?usize = null,
    instance_units: ?usize = null,
    decoded_bytes: usize = 0,
    trailing_bytes: usize = 0,
};
/// Exact optional streams, scalar report. No XML parsing or external resolution.
/// Missing storage/streams are not inferred from the declaration flag.
pub fn inspect(a: std.mem.Allocator, file: *const File, declared: bool, used: []bool, remaining: *usize, options: Options) !Report {
    return inspectWithXml(a, file, declared, used, remaining, options, null);
}
pub fn inspectWithXml(a: std.mem.Allocator, file: *const File, declared: bool, used: []bool, remaining: *usize, options: Options, xml: ?*@import("../xml_validation.zig").Budget) !Report {
    var result: Report = .{ .declared = declared };
    const root = try file.findExact("/XMLTemplate") orelse return result;
    if (file.entries[root].kind != 1) return error.InvalidHwpEntryKind;
    result.present = true;
    inline for (.{
        .{ "/XMLTemplate/_SchemaName", "schema_name_units" },
        .{ "/XMLTemplate/Schema", "schema_units" },
        .{ "/XMLTemplate/Instance", "instance_units" },
    }) |field| {
        if (try file.findExact(field[0])) |index| {
            const entry = file.entries[index];
            if (entry.kind != 2) return error.InvalidHwpEntryKind;
            const limit = @min(remaining.*, options.max_decoded_bytes - result.decoded_bytes);
            const bytes = try encoding.decode(a, entry.content, limit, options.encoding);
            defer a.free(bytes);
            const value = try @import("../xml_template/string.zig").String.parse(bytes);
            if (xml) |budget| {
                if (comptime std.mem.eql(u8, field[1], "schema_units")) try budget.inspect(a, value.value, .schema);
                if (comptime std.mem.eql(u8, field[1], "instance_units")) try budget.inspect(a, value.value, .instance);
            }
            @field(result, field[1]) = value.value.len / 2;
            result.trailing_bytes += value.extra.len;
            result.decoded_bytes += bytes.len;
            remaining.* -= bytes.len;
            used[index] = true;
        }
    }
    return result;
}
