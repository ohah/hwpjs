#!/bin/bash
# Release script for @ohah/hwpjs
# Usage: ./scripts/release.sh [version] [--prerelease]

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 현재 디렉토리 확인
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$PACKAGE_DIR/../.." && pwd)"

cd "$PACKAGE_DIR"

# 버전 확인
CURRENT_VERSION=$(node -p "require('./package.json').version")
PACKAGE_NAME=$(node -p "require('./package.json').name")

echo -e "${GREEN}📦 Package: ${PACKAGE_NAME}${NC}"
echo -e "${GREEN}📌 Current version: ${CURRENT_VERSION}${NC}"

# 버전 인자 확인
if [ -z "$1" ]; then
    VERSION="$CURRENT_VERSION"
    echo -e "${YELLOW}⚠️  No version specified, using current version: ${VERSION}${NC}"
else
    VERSION="$1"
fi

# Pre-release 확인 (case 문 사용)
IS_PRERELEASE=false
case "$VERSION" in
    *rc*|*beta*|*alpha*)
        IS_PRERELEASE=true
        ;;
esac

if [ "$2" == "--prerelease" ]; then
    IS_PRERELEASE=true
fi

if [ "$IS_PRERELEASE" = true ]; then
    echo -e "${YELLOW}📌 This will be a pre-release${NC}"
fi

# 태그 이름
TAG_NAME="@${PACKAGE_NAME#@}@${VERSION}"

echo -e "\n${GREEN}🚀 Starting release process...${NC}"
echo -e "${GREEN}   Tag: ${TAG_NAME}${NC}"

# 1. 빌드 확인
echo -e "\n${GREEN}📦 Checking build...${NC}"
if [ ! -d "npm" ] || [ -z "$(ls -A npm 2>/dev/null)" ]; then
    echo -e "${YELLOW}⚠️  npm/ directory is empty. Running build:release...${NC}"
    bun run build:release
else
    echo -e "${GREEN}✓ Build artifacts found${NC}"
fi

# 2. Git 상태 확인
echo -e "\n${GREEN}🔍 Checking git status...${NC}"
cd "$ROOT_DIR"

if [ -n "$(git status --porcelain)" ]; then
    echo -e "${RED}❌ There are uncommitted changes. Please commit or stash them first.${NC}"
    exit 1
fi

# 3. 태그가 이미 존재하는지 확인
if git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
    echo -e "${RED}❌ Tag ${TAG_NAME} already exists!${NC}"
    read -p "Do you want to delete and recreate it? (y/n) " -n 1 -r
    echo
    case "$REPLY" in
        [Yy]*)
            git tag -d "$TAG_NAME"
            git push origin ":refs/tags/$TAG_NAME" 2>/dev/null || true
            ;;
        *)
            exit 1
            ;;
    esac
fi

# 4. 태그 생성
echo -e "\n${GREEN}🏷️  Creating tag: ${TAG_NAME}${NC}"
git tag "$TAG_NAME"
echo -e "${GREEN}✓ Tag created${NC}"

# 5. 태그 푸시
echo -e "\n${GREEN}📤 Pushing tag to remote...${NC}"
git push origin "$TAG_NAME"
echo -e "${GREEN}✓ Tag pushed${NC}"

# 6. GitHub Release 생성
echo -e "\n${GREEN}📝 Creating GitHub Release...${NC}"

if command -v gh &> /dev/null; then
    if [ "$IS_PRERELEASE" = true ]; then
        gh release create "$TAG_NAME" \
            --title "$TAG_NAME" \
            --generate-notes \
            --prerelease
    else
        gh release create "$TAG_NAME" \
            --title "$TAG_NAME" \
            --generate-notes
    fi
    echo -e "${GREEN}✓ GitHub Release created${NC}"
else
    echo -e "${YELLOW}⚠️  GitHub CLI (gh) not found. Skipping release creation.${NC}"
    echo -e "${YELLOW}   Please create release manually at:${NC}"
    echo -e "${YELLOW}   https://github.com/ohah/hwpjs/releases/new${NC}"
    echo -e "${YELLOW}   Tag: ${TAG_NAME}${NC}"
fi

echo -e "\n${GREEN}✅ Release process completed!${NC}"
echo -e "${GREEN}   Tag: ${TAG_NAME}${NC}"
echo -e "${GREEN}   Next step: npm publish --access public${NC}"
