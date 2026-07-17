const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;

console.log("[metro.config.cjs] projectRoot=", projectRoot);

const config = getDefaultConfig(projectRoot);

config.watchFolders = [projectRoot];

const monorepoRoot = path.resolve(projectRoot, "..", "..");
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

console.log("[metro.config.cjs] nodeModulesPaths=", config.resolver.nodeModulesPaths);

module.exports = config;
