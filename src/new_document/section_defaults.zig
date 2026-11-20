//! Authored policy for NEW sections only. No external template/payload values.
//! Table134: Arabic, each column (footnote) / document end (endnote), continue
//! numbering from the prior section; the first section starts at first_number.
//! Table25/26 line type0 is SOLID, width0 is 0.1mm, NOT a 'none' encoding.
//! A zero-length separator and zero gaps are deliberate minimal layout policy.
const Note = @import("../hwp5/body/note_shape.zig");
const Border = @import("../hwp5/body/page_border.zig").Border;
const defaults = @import("defaults.zig");

pub fn note(layout: Note.Layout, kind: Note.attributes.Kind) Note.Shape {
    // Both kinds have raw placement0, but different typed meanings (table134).
    const flags: u32 = switch (kind) {
        .footnote => 0,
        .endnote => 0,
    };
    return .{
        .flags = flags,
        .user_char = 0,
        .prefix = 0,
        .suffix = 0,
        .start_number = defaults.first_number,
        .separator_length = 0,
        .above = 0,
        .below = 0,
        .between = 0,
        .line_type = 0,
        .line_width = 0,
        .color = 0,
        .layout = layout,
        .extra = &.{},
    };
}

/// Table136: body-relative, header/footer excluded, paper fill region.
/// ID0 is the existing optional-one-based 'no border resource' policy. One
/// record is authored: table129 does not require three page-border records.
pub const border: Border = .{
    .flags = 0,
    .left = 0,
    .right = 0,
    .top = 0,
    .bottom = 0,
    .border_fill_id = 0,
    .extra = &.{},
};
