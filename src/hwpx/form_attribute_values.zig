//! Owned form attribute values; absence/empty/false/zero remain distinct.
//! Child text/list items, geometry, reference resolution and editing are separate.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
pub const StringField = enum { name, caption, value, selectedValue, radioGroupName, passwordChar, command, groupName, foreColor, backColor, backStyle };
pub const BooleanField = enum { enabled, editable, triState, editEnable, multiLine, numOnly, readOnly, tabStop, drawFrame, printable };
pub const IntegerField = enum { tabOrder, borderTypeIDRef, listBoxRows, listBoxWidth, maxLength };
pub const ButtonState = enum { unchecked, checked, indeterminate };
pub fn stateText(state: ButtonState) []const u8 {
    return switch (state) {
        .unchecked => "UNCHECKED",
        .checked => "CHECKED",
        .indeterminate => "INDETERMINATE",
    };
}
pub const Options = struct { max_attribute_bytes: usize = 65536 };
pub fn parseButtonState(value: []const u8) !ButtonState {
    inline for (std.meta.tags(ButtonState)) |state| if (std.mem.eql(u8, value, stateText(state))) return state;
    return error.UnknownFormButtonState;
}
pub const Values = struct {
    kind: @import("run_anchor.zig").Kind,
    strings: [std.meta.fields(StringField).len]?[]u8 = @splat(null),
    booleans: [std.meta.fields(BooleanField).len]?bool = @splat(null),
    integers: [std.meta.fields(IntegerField).len]?u32 = @splat(null),
    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        for (self.strings) |value| if (value) |bytes| a.free(bytes);
        self.* = undefined;
    }
    pub fn string(self: Values, field: StringField) ?[]const u8 {
        return self.strings[@intFromEnum(field)];
    }
    pub fn boolean(self: Values, field: BooleanField) ?bool {
        return self.booleans[@intFromEnum(field)];
    }
    pub fn integer(self: Values, field: IntegerField) ?u32 {
        return self.integers[@intFromEnum(field)];
    }
    pub fn buttonState(self: Values) !?ButtonState {
        switch (self.kind) {
            .button, .check_button, .radio_button => {},
            else => return error.NotButtonForm,
        }
        const value = self.string(.value) orelse return null;
        return try parseButtonState(value);
    }
};
pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize, options: Options) !Values {
    const kind = @import("run_anchor.zig").kind(tree, node) orelse return error.InvalidFormNode;
    if (!@import("run_anchor.zig").isForm(kind)) return error.InvalidFormNode;
    var result: Values = .{ .kind = kind };
    errdefer result.deinit(a);
    inline for (std.meta.fields(StringField), 0..) |field, index| {
        if (try tree.attributeValue(a, node, "", field.name)) |raw| result.strings[index] = try raw.toUtf8(a, options.max_attribute_bytes);
    }
    inline for (std.meta.fields(BooleanField), 0..) |field, index| {
        if (try tree.attributeValue(a, node, "", field.name)) |raw| result.booleans[index] = try fields.boolean(a, raw, options.max_attribute_bytes);
    }
    inline for (std.meta.fields(IntegerField), 0..) |field, index| {
        result.integers[index] = try fields.optionalUnsigned(a, tree, node, field.name, options.max_attribute_bytes);
    }
    return result;
}
