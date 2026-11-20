"""Fixture ownership contract only; this is not normative XSD or Native execution."""
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

P = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'
X = '{urn:future}'
PATH = Path(__file__).resolve().parents[2] / 'src/hwpx/test_fixtures/document_text_selected_run.xml'

def inspect(root):
    parents, owners, cases = {}, {}, {}
    pending = [(root, None, None)]
    while pending:
        node, owner, case = pending.pop()
        if node.tag == P + 'p':
            owner = node.get('id')
        if node.tag == P + 'case':
            case = node
        owners[node], cases[node] = owner, case
        for child in reversed(list(node)):
            parents[child] = node
            pending.append((child, owner, case))
    for node, parent in parents.items():
        if node.tag == P + 'p':
            if parent.tag not in [P + 'subList', root.tag]:
                raise ValueError('ParagraphRequiresRealListOwner')
        if node.tag == P + 'run' and parent.tag != P + 'p':
            raise ValueError('RunRequiresRealParagraph')
    duplicate = [n for n in owners if n.tag == P + 'fieldBegin' and n.get('id') == '7']
    if len(duplicate) != 2 or {owners[n] for n in duplicate} != {'1', '3'}:
        raise ValueError('DistinctPhysicalDuplicateOwnersRequired')
    if sum(cases[n] is not None for n in duplicate) != 1:
        raise ValueError('OnlyOneDuplicateInInactiveCase')
    future = [n for n in owners if n.tag == X + 'futureControl']
    if len(future) != 1 or cases[future[0]] is None:
        raise ValueError('UnknownControlMustRemainInInactiveCase')
    return parents, owners

class FixtureContract(unittest.TestCase):
    def root(self):
        return ET.fromstring(PATH.read_bytes())
    def test_current_fixture_retains_different_physical_owners_and_inactive_unknown(self):
        parents, owners = inspect(self.root())
        self.assertEqual({'1', '2', '3'}, set(v for v in owners.values() if v is not None))
        self.assertGreater(len(parents), 20)
    def test_selected_default_is_an_existing_run_child_not_a_direct_paragraph(self):
        root = self.root()
        inspect(root)
        default = next(root.iter(P + 'default'))
        self.assertEqual([P + 't'], [n.tag for n in default])
        self.assertEqual('KEEP', default[0].text)
        text = ''.join(n.text or '' for n in root[0].iter(P + 't'))
        self.assertEqual('BASELABEL', text)
    def test_old_direct_case_paragraph_is_rejected(self):
        root = self.root()
        case = next(root.iter(P + 'case'))
        case.append(ET.Element(P + 'p', {'id': 'bad'}))
        with self.assertRaisesRegex(ValueError, 'RealListOwner'):
            inspect(root)
    def test_same_text_or_id_cannot_replace_different_physical_owner(self):
        root = self.root()
        nested = next(n for n in root.iter(P + 'p') if n.get('id') == '3')
        nested.set('id', '1')
        with self.assertRaisesRegex(ValueError, 'DistinctPhysical'):
            inspect(root)
    def test_moving_unknown_into_the_active_owner_does_not_pass_fixture_contract(self):
        root = self.root()
        case = next(root.iter(P + 'case'))
        unknown = next(root.iter(X + 'futureControl'))
        case.remove(unknown)
        next(root.iter(P + 'default')).append(unknown)
        with self.assertRaisesRegex(ValueError, 'UnknownControl'):
            inspect(root)

if __name__ == '__main__':
    unittest.main()
