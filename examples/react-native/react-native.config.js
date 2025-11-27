const path = require('node:path');
const { withWorkspaceModule } = require('@craby/devkit');

const modulePackagePath = path.resolve(__dirname, '..');
const config = {
  assets: ['./noori.hwp'], // HWP 파일을 asset으로 포함
};

module.exports = withWorkspaceModule(config, modulePackagePath);
