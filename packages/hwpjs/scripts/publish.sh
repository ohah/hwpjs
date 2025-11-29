#!/bin/bash
# Publish script for @ohah/hwpjs
# Usage: ./scripts/publish.sh [--tag next|latest]

set -e

# NPM_OHAH_TOKEN 환경변수 확인 및 로드
if [ -z "$NPM_OHAH_TOKEN" ] && [ -f "$HOME/.zshrc" ]; then
    # .zshrc에서 NPM_OHAH_TOKEN만 추출
    NPM_OHAH_TOKEN=$(grep "^export NPM_OHAH_TOKEN=" "$HOME/.zshrc" 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "")
    if [ -n "$NPM_OHAH_TOKEN" ]; then
        export NPM_OHAH_TOKEN
    fi
fi

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

# Pre-release 확인
IS_PRERELEASE=false
case "$CURRENT_VERSION" in
    *rc*|*beta*|*alpha*)
        IS_PRERELEASE=true
        ;;
esac

# 태그 결정
if [ -n "$1" ] && [ "$1" == "--tag" ] && [ -n "$2" ]; then
    NPM_TAG="$2"
elif [ "$IS_PRERELEASE" = true ]; then
    NPM_TAG="next"
else
    NPM_TAG="latest"
fi

echo -e "${GREEN}📌 NPM tag: ${NPM_TAG}${NC}"

# npm 인증 확인
echo -e "\n${GREEN}🔍 Checking npm authentication...${NC}"

# 환경변수 토큰이 있으면 사용, 없으면 npm whoami 확인
if [ -n "$NPM_OHAH_TOKEN" ]; then
    echo -e "${GREEN}✓ NPM_OHAH_TOKEN found in environment${NC}"
    export NPM_OHAH_TOKEN
else
    echo -e "${YELLOW}⚠️  NPM_OHAH_TOKEN not set, checking npm login...${NC}"
    if ! npm whoami >/dev/null 2>&1; then
        echo -e "${RED}❌ Not logged in to npm. Please set NPM_OHAH_TOKEN or run 'npm login'${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Logged in as: $(npm whoami)${NC}"
fi

# 1. 빌드 확인
echo -e "\n${GREEN}📦 Checking build...${NC}"
if [ ! -d "npm" ] || [ -z "$(ls -A npm 2>/dev/null)" ]; then
    echo -e "${YELLOW}⚠️  npm/ directory is empty. Running build:release...${NC}"
    bun run build:release
else
    echo -e "${GREEN}✓ Build artifacts found${NC}"
fi

# 2. 플랫폼별 패키지 publish
echo -e "\n${GREEN}📤 Publishing platform packages...${NC}"
for platform_dir in npm/*/; do
    if [ -d "$platform_dir" ]; then
        platform=$(basename "$platform_dir")
        echo -e "${GREEN}   Publishing ${platform}...${NC}"
        
        cd "$platform_dir"
        
        # package.json 확인
        if [ ! -f "package.json" ]; then
            echo -e "${YELLOW}   ⚠️  No package.json found, skipping${NC}"
            cd "$PACKAGE_DIR"
            continue
        fi
        
        # 이미 배포된 버전인지 확인
        PLATFORM_PKG_NAME=$(node -p "require('./package.json').name")
        PLATFORM_VERSION=$(node -p "require('./package.json').version")
        
        if npm view "${PLATFORM_PKG_NAME}@${PLATFORM_VERSION}" version >/dev/null 2>&1; then
            echo -e "${YELLOW}   ⚠️  ${PLATFORM_PKG_NAME}@${PLATFORM_VERSION} already published, skipping${NC}"
        else
            npm publish --tag "$NPM_TAG" --access public || {
                echo -e "${YELLOW}   ⚠️  Failed to publish ${platform}, continuing...${NC}"
            }
            echo -e "${GREEN}   ✓ Published ${platform}${NC}"
        fi
        
        cd "$PACKAGE_DIR"
    fi
done

# 3. 메인 패키지 publish
echo -e "\n${GREEN}📤 Publishing main package...${NC}"
cd "$PACKAGE_DIR"

# 이미 배포된 버전인지 확인
if npm view "${PACKAGE_NAME}@${CURRENT_VERSION}" version >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  ${PACKAGE_NAME}@${CURRENT_VERSION} already published${NC}"
    read -p "Do you want to republish? (y/n) " -n 1 -r
    echo
    case "$REPLY" in
        [Yy]*)
            npm publish --tag "$NPM_TAG" --access public
            ;;
        *)
            echo -e "${YELLOW}   Skipping main package publish${NC}"
            ;;
    esac
else
    npm publish --tag "$NPM_TAG" --access public
    echo -e "${GREEN}✓ Main package published${NC}"
fi

echo -e "\n${GREEN}✅ Publish process completed!${NC}"
echo -e "${GREEN}   Package: ${PACKAGE_NAME}@${CURRENT_VERSION}${NC}"
echo -e "${GREEN}   Tag: ${NPM_TAG}${NC}"
echo -e "${GREEN}   Install: npm install ${PACKAGE_NAME}@${NPM_TAG}${NC}"
