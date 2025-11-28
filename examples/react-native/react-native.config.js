const path = require('node:path');
const { withWorkspaceModule } = require('@craby/devkit');

const modulePackagePath = __dirname;
const config = {};

module.exports = withWorkspaceModule(config, modulePackagePath);
