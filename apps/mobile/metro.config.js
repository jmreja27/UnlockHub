const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Monorepo: añadir workspace raíz a los watchFolders por defecto de Expo
config.watchFolders = [...(config.watchFolders ?? []), workspaceRoot];

// Resolver dependencias desde el node_modules del workspace raíz
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Mapear paquetes workspace a su código TypeScript fuente (evita necesitar dist/)
config.resolver.extraNodeModules = {
  '@unlockhub/types': path.resolve(workspaceRoot, 'packages/types/src'),
  '@unlockhub/validators': path.resolve(workspaceRoot, 'packages/validators/src'),
};

module.exports = withNativeWind(config, {
  input: './global.css',
  configPath: path.resolve(projectRoot, 'tailwind.config.js'),
});
