//! Borrowed observation only; never an authoritative editing/checkpoint owner.
pub const Cache = struct {
    owner: *const @import("editor_session.zig").Section,
    paragraphs: []const @import("paragraph_structure_values.zig").Paragraph,
    mutation_serial: *const u64,
    captured_serial: u64,

    pub fn valid(self: *const Cache) bool {
        return self.mutation_serial.* == self.captured_serial;
    }
};
