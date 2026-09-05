const state = @import("cfb.zig");
const cfb = @import("../cfb/reader.zig");
const abi = @import("abi_schema.zig");
fn entry(index: usize) ?*const cfb.Entry {
    if (state.get()) |file| {
        if (index < file.entries.len) return &file.entries[index];
    }
    return null;
}
fn field(index: usize, key: u32) []const u8 {
    const e = entry(index) orelse return "";
    return switch (@as(abi.Field, @enumFromInt(key))) {
        .name => e.name,
        .path => e.path,
        .content => e.content,
        .clsid => &e.clsid,
        else => "",
    };
}
export fn cfb_field_ptr(index: usize, key: u32) [*]const u8 {
    return field(index, key).ptr;
}
export fn cfb_field_len(index: usize, key: u32) usize {
    return field(index, key).len;
}
export fn cfb_value(index: usize, key: u32) u64 {
    const e = entry(index) orelse return 0;
    return switch (@as(abi.Value, @enumFromInt(key))) {
        .kind => e.kind,
        .color => e.color,
        .left => e.left,
        .right => e.right,
        .child => e.child,
        .state => e.state,
        .created => e.created,
        .modified => e.modified,
        .start => e.start,
        .size => e.size,
        .uses_fat => @intFromBool(@import("../cfb/format.zig").usesFat(e.size)),
        .has_content => @intFromBool(e.has_content),
        else => 0,
    };
}
