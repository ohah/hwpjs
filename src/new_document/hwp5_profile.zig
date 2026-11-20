//! Authored NEW HWP5 layout profiles, not a source-document upgrade policy.
//! Hancom revision1.3 tables15-16,33,43-46,58,129. Table33 prints total72
//! despite explicit fields68+2+4=74; keep every defined field and document it.
const Version = @import("../hwp5/version.zig").Version;
const Mapping = @import("../hwp5/docinfo/id_mappings.zig").Field;
const Character = @import("../hwp5/docinfo/char_shape.zig").CharShape;
const Paragraph = @import("../hwp5/docinfo/para_shape.zig").ParaShape;
const NoteLayout = @import("../hwp5/body/note_shape.zig").Layout;

pub const Profile = enum { legacy_5_0_1_7, modern_5_0_3_0 };
pub const default: Profile = .modern_5_0_3_0;

pub const Layout = struct {
    version: Version,
    mapping_entries: usize,
    character_bytes: usize,
    paragraph_bytes: usize,
    // Explicit project read-compatible layout. Table133 instead specifies26;
    // do not silently fall back or relabel28 as a specification guarantee.
    section_note_layout: ?NoteLayout,

    pub fn mappingBytes(self: Layout) usize {
        return self.mapping_entries * @sizeOf(i32);
    }
};

pub fn layout(profile: Profile) Layout {
    return switch (profile) {
        .legacy_5_0_1_7 => .{
            .version = .{ .raw = 0x05000107 },
            .mapping_entries = @backingInt(Mapping.style) + 1,
            .character_bytes = Character.base_size,
            .paragraph_bytes = Paragraph.modern_spacing_offset,
            .section_note_layout = null, // preserve full canonical legacy bytes
        },
        .modern_5_0_3_0 => .{
            .version = .{ .raw = 0x05000300 },
            .mapping_entries = @backingInt(Mapping.memo_shape) + 1,
            .character_bytes = Character.independent_strike_size,
            .paragraph_bytes = Paragraph.modern_size,
            .section_note_layout = .observed28,
        },
    };
}

pub const maximum = layout(.modern_5_0_3_0);
