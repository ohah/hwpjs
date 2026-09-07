const Header = @import("header.zig").Header;
const Chunk = @import("chunks.zig").Chunk;
const transparency = @import("transparency.zig");

/// Selected ancillary semantics only. Other chunks stay deferred in structure.
pub const State = struct {
    transparency: ?transparency.Value = null,
    validated_chunks: usize = 0,
    validated_bytes: usize = 0,
    palette_seen: bool = false,
    data_seen: bool = false,
    /// Atomic on failure; caller has already validated the critical envelope.
    pub fn consume(self: *State, h: Header, palette_entries: usize, chunk: Chunk) !void {
        if (chunk.is("PLTE")) {
            if (self.transparency != null) return error.InvalidPngTransparencyOrder;
            self.palette_seen = true;
        } else if (chunk.is("IDAT")) {
            self.data_seen = true;
        } else if (chunk.is("tRNS")) {
            if (self.transparency != null) return error.DuplicatePngTransparency;
            if (self.data_seen or (h.color_type == 3 and !self.palette_seen)) return error.InvalidPngTransparencyOrder;
            const value = try transparency.parse(h, palette_entries, chunk.payload);
            self.transparency = value;
            self.validated_chunks += 1;
            self.validated_bytes += chunk.payload.len;
        }
    }
};
