/// 레코드 트리 구조 / Record tree structure
///
/// HWP 레코드는 계층 구조로 저장되며, 레벨 정보를 통해 트리 구조를 재구성할 수 있습니다.
/// HWP records are stored in a hierarchical structure, and the tree structure can be reconstructed using level information.
use crate::error::HwpError;
use crate::types::RecordHeader;

/// 레코드 트리 노드 / Record tree node
#[derive(Debug, Clone)]
pub struct RecordTreeNode {
    /// 레코드 헤더 / Record header
    pub header: RecordHeader,
    /// 레코드 데이터 / Record data
    pub data: Vec<u8>,
    /// 자식 노드들 / Child nodes
    pub children: Vec<RecordTreeNode>,
}

impl RecordTreeNode {
    /// 레코드 트리를 파싱합니다. / Parse record tree.
    ///
    /// hwp.js의 parseRecordTree 로직을 정확히 따라갑니다:
    /// Follows hwp.js's parseRecordTree logic exactly:
    /// ```typescript
    /// let parent: HWPRecord = root
    /// for (let i = 0; i < level; i += 1) {
    ///   parent = parent.children.slice(-1).pop()!
    /// }
    /// parent.children.push(new HWPRecord(...))
    /// ```
    ///
    /// # Arguments
    /// * `data` - Section의 원시 바이트 데이터 / Raw byte data of section
    ///
    /// # Returns
    /// 루트 노드 (레벨 0 레코드들이 자식으로 포함됨) / Root node (level 0 records are included as children)
    pub fn parse_tree(data: &[u8]) -> Result<RecordTreeNode, HwpError> {
        let root = RecordTreeNode {
            header: RecordHeader {
                tag_id: 0,
                level: 0,
                size: 0,
                has_extended_size: false,
            },
            data: Vec::new(),
            children: Vec::new(),
        };

        let mut offset = 0;
        // 스택: 각 레벨의 마지막 노드 참조를 저장 / Stack: stores reference to last node at each level
        // hwp.js 방식: for (let i = 0; i < level; i += 1) { parent = parent.children.slice(-1).pop()! }
        // hwp.js way: for (let i = 0; i < level; i += 1) { parent = parent.children.slice(-1).pop()! }
        // 스택[i]는 레벨 i의 마지막 노드 인덱스 / stack[i] is the last node index at level i
        // 레벨 i의 부모는 스택[i-1] (레벨 0의 부모는 루트) / Parent of level i is stack[i-1] (parent of level 0 is root)
        let mut stack: Vec<usize> = Vec::new(); // 각 레벨의 마지막 노드 인덱스 / Last node index at each level
        let mut nodes: Vec<(RecordTreeNode, Vec<usize>)> = Vec::new(); // (노드, 자식 인덱스 리스트) / (node, child indices)
        nodes.push((root, Vec::new()));

        while offset < data.len() {
            // 레코드 헤더 파싱 / Parse record header
            let remaining_data = &data[offset..];
            let (header, header_size) = RecordHeader::parse(remaining_data)
                .map_err(|e| HwpError::from(e))?;
            offset += header_size;

            // 데이터 영역 읽기 / Read data area
            let data_size = header.size as usize;
            if offset + data_size > data.len() {
                return Err(HwpError::InsufficientData {
                    field: format!("Record at offset {}", offset),
                    expected: offset + data_size,
                    actual: data.len(),
                });
            }

            let record_data = &data[offset..offset + data_size];
            offset += data_size;

            // 새 노드 생성 / Create new node
            let new_node = RecordTreeNode {
                header,
                data: record_data.to_vec(),
                children: Vec::new(),
            };

            let new_node_index = nodes.len();
            nodes.push((new_node, Vec::new()));

            // 부모 노드 찾기: hwp.js 로직 정확히 따라가기
            // Find parent node: follow hwp.js logic exactly
            // hwp.js: for (let i = 0; i < level; i += 1) { parent = parent.children.slice(-1).pop()! }
            // 즉, 레벨만큼 깊이 들어가서 마지막 자식을 부모로 선택
            // That is, go level deep and select the last child as parent

            // 스택을 레벨에 맞게 조정: 레벨이 감소하면 상위 레벨로 돌아감
            // Adjust stack to match level: if level decreases, return to higher level
            while stack.len() > header.level as usize {
                stack.pop();
            }

            // 부모 노드 찾기 / Find parent node
            let parent_index = if header.level == 0 {
                0 // 루트 / Root
            } else {
                // 스택을 레벨에 맞게 확장 / Expand stack to match level
                while stack.len() < header.level as usize {
                    // 스택이 부족하면 이전 레벨의 마지막 노드를 사용 / Use last node of previous level if stack is insufficient
                    if let Some(&last) = stack.last() {
                        stack.push(last);
                    } else {
                        stack.push(0); // 루트 / Root
                    }
                }

                // 레벨 i의 부모는 레벨 i-1의 마지막 노드 (스택[i-1])
                // Parent of level i is last node at level i-1 (stack[i-1])
                stack[header.level as usize - 1]
            };

            // 부모에 자식 추가 / Add child to parent
            nodes[parent_index].1.push(new_node_index);

            // 새 노드를 스택에 추가 (다음 레코드의 부모가 될 수 있음)
            // Add new node to stack (can be parent of next record)
            // 스택을 레벨 크기로 확장 / Expand stack to level size
            while stack.len() <= header.level as usize {
                stack.push(0); // 플레이스홀더 / Placeholder
            }
            stack[header.level as usize] = new_node_index;
        }

        // 인덱스 기반 트리를 실제 트리로 변환 / Convert index-based tree to actual tree
        fn build_tree(nodes: &[(RecordTreeNode, Vec<usize>)], index: usize) -> RecordTreeNode {
            let (node, children_indices) = &nodes[index];
            let mut result = RecordTreeNode {
                header: node.header,
                data: node.data.clone(),
                children: Vec::new(),
            };
            for &child_index in children_indices {
                result.children.push(build_tree(nodes, child_index));
            }
            result
        }

        Ok(build_tree(&nodes, 0))
    }

    /// 태그 ID 반환 / Get tag ID
    pub fn tag_id(&self) -> u16 {
        self.header.tag_id
    }

    /// 레벨 반환 / Get level
    pub fn level(&self) -> u16 {
        self.header.level
    }

    /// 데이터 반환 / Get data
    pub fn data(&self) -> &[u8] {
        &self.data
    }

    /// 자식 노드들 반환 / Get children
    pub fn children(&self) -> &[RecordTreeNode] {
        &self.children
    }
}
