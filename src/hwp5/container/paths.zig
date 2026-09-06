const std = @import("std");
const File = @import("../../cfb/reader.zig").File;
const Name = @import("../../cfb/name_order.zig").Name;
const max_extension_units = @as(Name, .{}).units.len - "BIN0000.".len;
pub fn required(file: *const File, path: []const u8, kind: u8) !usize {
    const index = try file.findExact(path) orelse return error.MissingHwpEntry;
    if (file.entries[index].kind != kind) return error.InvalidHwpEntryKind;
    return index;
}
/// CFB names are case-insensitive. Decimal suffixes are canonical, no aliases.
pub fn sectionIndex(name: []const u8) !?u16 {
    if (!std.ascii.startsWithIgnoreCase(name, "Section")) return null;
    const digits = name[7..];
    if (digits.len == 0 or (digits.len > 1 and digits[0] == '0')) return error.InvalidSectionName;
    var index: u32 = 0;
    for (digits) |c| {
        if (c < '0' or c > '9') return error.InvalidSectionName;
        index = index * 10 + c - '0';
        if (index > std.math.maxInt(u16)) return error.InvalidSectionName;
    }
    return @intCast(index);
}
pub fn binary(a: std.mem.Allocator, id: u16, extension: []const u8) ![]u8 {
    // 7 UTF-16 units for BINhhhh plus dot; CFB component limit is 31.
    if (extension.len > max_extension_units * 2 or extension.len % 2 != 0) return error.InvalidBinDataExtension;
    var units: [max_extension_units]u16 = undefined;
    const wire = units[0 .. extension.len / 2];
    @memcpy(std.mem.sliceAsBytes(wire), extension);
    const ext = std.unicode.utf16LeToUtf8Alloc(a, wire) catch |err| switch (err) {
        error.OutOfMemory => return err,
        else => return error.InvalidBinDataExtension,
    };
    defer a.free(ext);
    const name = try std.fmt.allocPrint(a, "BIN{x:0>4}{s}{s}", .{ id, if (ext.len == 0) "" else ".", ext });
    defer a.free(name);
    _ = Name.init(name) catch return error.InvalidBinDataExtension;
    return std.fmt.allocPrint(a, "/BinData/{s}", .{name});
}
