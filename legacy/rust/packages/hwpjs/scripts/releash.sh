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

# 6. GitHub Release 생성 및 아티팩트 업로드
echo -e "\n${GREEN}📝 Creating GitHub Release...${NC}"

if command -v gh &> /dev/null; then
    # Release가 이미 존재하는지 확인
    if gh release view "$TAG_NAME" --repo ohah/hwpjs >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Release ${TAG_NAME} already exists. Skipping creation.${NC}"
    else
        # Release 생성
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
    fi
    
    # 아티팩트 업로드
    echo -e "\n${GREEN}📦 Uploading artifacts...${NC}"
    cd "$PACKAGE_DIR"
    
    # 임시 디렉토리 생성
    TEMP_DIR=$(mktemp -d)
    trap "rm -rf $TEMP_DIR" EXIT
    
    # 1. Node.js 플랫폼별 아티팩트 압축 및 업로드
    echo -e "${GREEN}   Compressing Node.js platform artifacts...${NC}"
    for platform_dir in npm/*/; do
        if [ -d "$platform_dir" ]; then
            platform=$(basename "$platform_dir")
            echo -e "${GREEN}     Compressing ${platform}...${NC}"
            
            # zip 파일 생성
            zip_file="$TEMP_DIR/node-${platform}.zip"
            cd "$platform_dir"
            zip -r "$zip_file" . -q
            cd "$PACKAGE_DIR"
            
            # 업로드
            echo -e "${GREEN}     Uploading node-${platform}.zip...${NC}"
            gh release upload "$TAG_NAME" "$zip_file" --repo ohah/hwpjs || {
                echo -e "${YELLOW}     ⚠️  Failed to upload node-${platform}.zip, may already exist${NC}"
            }
        fi
    done
    
    # 2. React Native iOS 아티팩트 압축 및 업로드
    if [ -d "ios" ]; then
        echo -e "${GREEN}   Compressing React Native iOS artifacts...${NC}"
        zip_file="$TEMP_DIR/react-native-ios.zip"
        # ios/build 제외하고 압축
        zip -r "$zip_file" ios -q -x "ios/build/*" "ios/**/build/*"
        
        echo -e "${GREEN}     Uploading react-native-ios.zip...${NC}"
        gh release upload "$TAG_NAME" "$zip_file" --repo ohah/hwpjs || {
            echo -e "${YELLOW}     ⚠️  Failed to upload react-native-ios.zip, may already exist${NC}"
        }
    fi
    
    # 3. React Native Android 아티팩트 압축 및 업로드
    if [ -d "android" ]; then
        echo -e "${GREEN}   Compressing React Native Android artifacts...${NC}"
        zip_file="$TEMP_DIR/react-native-android.zip"
        # android/build 제외하고 압축
        zip -r "$zip_file" android -q -x "android/build/*" "android/**/build/*" "android/gradle/*" "android/gradlew" "android/gradlew.bat" "android/local.properties"
        
        echo -e "${GREEN}     Uploading react-native-android.zip...${NC}"
        gh release upload "$TAG_NAME" "$zip_file" --repo ohah/hwpjs || {
            echo -e "${YELLOW}     ⚠️  Failed to upload react-native-android.zip, may already exist${NC}"
        }
    fi
    
    # 4. dist 전체 압축 및 업로드
    if [ -d "dist" ]; then
        echo -e "${GREEN}   Compressing dist artifacts...${NC}"
        zip_file="$TEMP_DIR/dist.zip"
        zip -r "$zip_file" dist -q
        
        echo -e "${GREEN}     Uploading dist.zip...${NC}"
        gh release upload "$TAG_NAME" "$zip_file" --repo ohah/hwpjs || {
            echo -e "${YELLOW}     ⚠️  Failed to upload dist.zip, may already exist${NC}"
        }
    fi
    
    echo -e "${GREEN}✓ All artifacts uploaded${NC}"
else
    echo -e "${YELLOW}⚠️  GitHub CLI (gh) not found. Skipping release creation.${NC}"
    echo -e "${YELLOW}   Please create release manually at:${NC}"
    echo -e "${YELLOW}   https://github.com/ohah/hwpjs/releases/new${NC}"
    echo -e "${YELLOW}   Tag: ${TAG_NAME}${NC}"
fi

echo -e "\n${GREEN}✅ Release process completed!${NC}"
echo -e "${GREEN}   Tag: ${TAG_NAME}${NC}"
echo -e "${GREEN}   Next step: npm publish --access public${NC}"
