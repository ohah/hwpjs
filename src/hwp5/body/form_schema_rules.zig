pub const Kind = @import("form_object.zig").Kind;
pub const ValueKind = @import("form_property.zig").Kind;
pub const Scope = enum { common, char_shape, button, combo, edit };
pub const Field = enum { name, fore_color, back_color, group_name, tab_stop, tab_order, enabled, border_type, draw_frame, command, editable, printable, char_shape_id, follow_context, auto_size, word_wrap, caption, value, tri_state, back_style, radio_group_name, list_box_rows, text, list_box_width, edit_enable, multi_line, password_char, max_length, scroll_bars, tab_key_behavior, number, read_only, align_text };
pub const field_count = @typeInfo(Field).@"enum".fields.len;
pub const Rule = struct { field: Field, scope: Scope, key: []const u8, kind: ValueKind, types: u8 };
fn mask(comptime kinds: anytype) u8 {
    var result: u8 = 0;
    inline for (kinds) |k| result |= @as(u8, 1) << @intFromEnum(@as(Kind, k));
    return result;
}
const all = mask(.{ .push_button, .check_box, .combo_box, .radio_button, .edit });
const buttons = mask(.{ .push_button, .check_box, .radio_button });
const choices = mask(.{ .check_box, .radio_button });
fn r(field: Field, scope: Scope, key: []const u8, kind: ValueKind, types: u8) Rule {
    return .{ .field = field, .scope = scope, .key = key, .kind = kind, .types = types };
}
/// Observed direct paths and wire types, not value ranges or required defaults.
pub const rules = [_]Rule{
    r(.name, .common, "Name", .wstring, all),
    r(.fore_color, .common, "ForeColor", .integer, all),
    r(.back_color, .common, "BackColor", .integer, all),
    r(.group_name, .common, "GroupName", .wstring, all),
    r(.tab_stop, .common, "TabStop", .boolean, all),
    r(.tab_order, .common, "TabOrder", .integer, all),
    r(.enabled, .common, "Enabled", .boolean, all),
    r(.border_type, .common, "BorderType", .integer, all),
    r(.draw_frame, .common, "DrawFrame", .boolean, all),
    r(.command, .common, "Command", .wstring, all),
    r(.editable, .common, "Editable", .boolean, all),
    r(.printable, .common, "Printable", .boolean, all),
    r(.char_shape_id, .char_shape, "CharShapeID", .integer, all),
    r(.follow_context, .char_shape, "FollowContext", .boolean, all),
    r(.auto_size, .char_shape, "AutoSize", .boolean, all),
    r(.word_wrap, .char_shape, "WordWrap", .boolean, all),
    r(.caption, .button, "Caption", .wstring, buttons),
    r(.value, .button, "Value", .integer, choices),
    r(.tri_state, .button, "TriState", .boolean, choices),
    r(.back_style, .button, "BackStyle", .integer, choices),
    r(.radio_group_name, .button, "RadioGroupName", .wstring, mask(.{.radio_button})),
    r(.list_box_rows, .combo, "ListBoxRows", .integer, mask(.{.combo_box})),
    r(.text, .combo, "Text", .wstring, mask(.{.combo_box})),
    r(.list_box_width, .combo, "ListBoxWidth", .integer, mask(.{.combo_box})),
    r(.edit_enable, .combo, "EditEnable", .boolean, mask(.{.combo_box})),
    r(.text, .edit, "Text", .wstring, mask(.{.edit})),
    r(.multi_line, .edit, "MultiLine", .boolean, mask(.{.edit})),
    r(.password_char, .edit, "PasswordChar", .wstring, mask(.{.edit})),
    r(.max_length, .edit, "MaxLength", .integer, mask(.{.edit})),
    r(.scroll_bars, .edit, "ScrollBars", .integer, mask(.{.edit})),
    r(.tab_key_behavior, .edit, "TabKeyBehavior", .integer, mask(.{.edit})),
    r(.number, .edit, "Number", .boolean, mask(.{.edit})),
    r(.read_only, .edit, "ReadOnly", .boolean, mask(.{.edit})),
    r(.align_text, .edit, "AlignText", .integer, mask(.{.edit})),
};
pub const equals = @import("form_property.zig").equalsAscii;
pub fn scopeFor(kind: Kind, key: []const u8) ?Scope {
    if (kind == .unknown) return null;
    if (equals(key, "CommonSet")) return .common;
    if (equals(key, "CharShapeSet")) return .char_shape;
    const name: []const u8 = switch (kind) {
        .push_button, .check_box, .radio_button => "ButtonSet",
        .combo_box => "ComboBoxSet",
        .edit => "EditSet",
        .unknown => unreachable,
    };
    if (!equals(key, name)) return null;
    return switch (kind) {
        .combo_box => .combo,
        .edit => .edit,
        else => .button,
    };
}
pub fn lookup(kind: Kind, scope: Scope, key: []const u8) ?Rule {
    for (rules) |rule| if (rule.scope == scope and rule.types & (@as(u8, 1) << @intCast(@intFromEnum(kind))) != 0 and equals(key, rule.key)) return rule;
    return null;
}
