//! Whether collected run leaves completely represent the rich text content.
//! Formatting is deliberately not a typography or layout equivalence claim.
const Tree = @import("chart_tree.zig").Tree;
const uri = "http://schemas.openxmlformats.org/drawingml/2006/main";

fn runComplete(tree: *const Tree, node: usize) bool {
    var child = tree.elements[node].first_child;
    var texts: usize = 0;
    while (child) |index| {
        const element = tree.elements[index];
        if (element.is(uri, "t")) {
            if (element.first_child != null) return false;
            texts += 1;
        } else if (!element.is(uri, "rPr")) return false;
        child = element.next_sibling;
    }
    return texts == 1;
}

fn paragraphComplete(tree: *const Tree, node: usize) bool {
    var child = tree.elements[node].first_child;
    var runs: usize = 0;
    while (child) |index| {
        const element = tree.elements[index];
        if (element.is(uri, "r")) {
            if (!runComplete(tree, index)) return false;
            runs += 1;
        } else if (!element.is(uri, "pPr") and !element.is(uri, "endParaRPr")) return false;
        child = element.next_sibling;
    }
    // Empty paragraphs are not represented by run leaves; do not lose them.
    return runs > 0;
}

pub fn complete(tree: *const Tree, rich: usize) bool {
    var child = tree.elements[rich].first_child;
    var paragraphs: usize = 0;
    while (child) |index| {
        const element = tree.elements[index];
        if (element.is(uri, "p")) {
            if (!paragraphComplete(tree, index)) return false;
            paragraphs += 1;
        } else if (!element.is(uri, "bodyPr") and !element.is(uri, "lstStyle")) return false;
        child = element.next_sibling;
    }
    return paragraphs > 0;
}
