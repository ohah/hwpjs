pub const Kind = enum { matrix, pmatrix, bmatrix, dmatrix, ladder, sladder, pile, lpile, rpile, cases, eqalign };
pub fn isPile(kind: Kind) bool {
    return kind == .pile or kind == .lpile or kind == .rpile;
}
pub fn preservesEmptyRows(kind: Kind) bool {
    return isPile(kind) or kind == .cases or kind == .eqalign;
}
