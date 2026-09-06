const d = @import("reader.zig");
/// Cross-record grouping only. Payload/level validation remains in the DocInfo reader.
/// A level-one layout belongs to the most recent level-zero compatible document.
pub const State = struct {
    compatible_root: bool = false,
    pub fn observe(self: *State, r: d.Record) !void {
        if (r.value == .layout_compatibility and !self.compatible_root)
            return error.InvalidCompatibilityOwner;
        if (r.framing.level == 0) self.compatible_root = r.value == .compatible_document;
    }
};
