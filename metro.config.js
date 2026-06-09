const path = require('path');
const fs = require('fs');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const proPackagePath = path.resolve(__dirname, '../offgrid-pro');
const proStubPath = path.resolve(__dirname, 'src/bootstrap/proStub.js');
const proExists = fs.existsSync(proPackagePath);

const config = {
  // Metro only watches the project root by default; files outside it (like the
  // sibling @offgrid/pro package) must be listed here or require() will fail.
  watchFolders: proExists ? [proPackagePath] : [],
  resolver: {
    // When resolving modules from outside the project root (i.e. @offgrid/pro),
    // Metro falls back here so @babel/runtime and all other peer deps are found.
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
    extraNodeModules: {
      // Exposes src/ as @offgrid/core so @offgrid/pro can import the design system,
      // stores, and registries without a circular package dependency.
      '@offgrid/core': path.resolve(__dirname, 'src'),
      // Points to the real pro package when present on disk (store builds),
      // falls back to a null stub so free builds bundle cleanly.
      '@offgrid/pro': proExists ? proPackagePath : proStubPath,
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
