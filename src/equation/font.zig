//! Font policy shared by future measuring and painting, not actual font loading.
pub const Change = enum { roman, italic, bold };
pub const Style = struct { italic: bool = true, bold: bool = false };
pub fn apply(inherited: Style, change: Change) Style {
    return switch (change) {
        .roman => .{ .italic = false, .bold = false },
        .italic => .{ .italic = true, .bold = inherited.bold },
        .bold => .{ .italic = inherited.italic, .bold = true },
    };
}
pub fn number(inherited: Style) Style {
    return .{ .italic = false, .bold = inherited.bold };
}
pub fn function() Style {
    return .{ .italic = false, .bold = false };
}
