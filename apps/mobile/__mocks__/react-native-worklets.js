'use strict';

// Stub para react-native-worklets en Jest — evita inicializar módulos nativos.
// react-native-reanimated v4 requiere react-native-worklets como peer dep;
// su init() llama a NativeWorklets que no existe en el entorno de test.

const NOOP = () => {};
const NOOP_FACTORY = () => NOOP;

module.exports = {
  // Inicialización — no-op en tests
  init: NOOP,

  // Scheduling
  runOnUISync: NOOP_FACTORY,
  scheduleOnUI: NOOP_FACTORY,
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,

  // Shared values / shareables
  makeShareable: jest.fn((val) => val),
  makeShareableCloneRecursive: jest.fn((val) => val),
  makeShareableCloneOnUIRecursive: jest.fn((val) => val),
  isShareableRef: jest.fn(() => false),
  isShareable: jest.fn(() => false),
  shareableMappingCache: { set: NOOP, get: jest.fn(() => null), delete: NOOP },
  createShareable: jest.fn((val) => val),
  isWorkletFunction: jest.fn(() => false),

  // Microtasks
  callMicrotasks: NOOP,

  // Synchronizable / Serializable
  isSynchronizable: jest.fn(() => false),
  createSynchronizable: jest.fn((val) => val),
  createSerializable: jest.fn((val) => val),
  isSerializableRef: jest.fn(() => false),
  registerCustomSerializable: NOOP,
  serializableMappingCache: { set: NOOP, get: jest.fn(() => null), delete: NOOP },

  // Feature flags
  getDynamicFeatureFlag: jest.fn(() => false),
  getStaticFeatureFlag: jest.fn(() => false),
  setDynamicFeatureFlag: NOOP,

  // RuntimeKind enum
  RuntimeKind: { JS: 0, UI: 1 },

  // Debug
  toggleSlowAnimationsOnUIRuntime: NOOP,
};
