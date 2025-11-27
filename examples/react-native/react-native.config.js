const path = require('node:path');
const { withWorkspaceModule } = require('@craby/devkit');

const modulePackagePath = path.resolve(__dirname, '..');
const config = {
  assets: ['./src/assets'], // src/assets 디렉토리의 모든 파일을 asset으로 포함
};

module.exports = withWorkspaceModule(config, modulePackagePath);
