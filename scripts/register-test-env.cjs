const path = require('path');
const Module = require('module');
const origResolve = Module._resolveFilename;

if (typeof globalThis.__DEV__ === 'undefined') {
  globalThis.__DEV__ = process.env.NODE_ENV !== 'production';
}

if (typeof process.env.EXPO_OS === 'undefined') {
  process.env.EXPO_OS = 'web';
}

if (typeof globalThis.expo === 'undefined') {
  globalThis.expo = {
    EventEmitter: class EventEmitter {
      addListener() { return { remove() {} }; }
      removeListener() {}
      emit() {}
    },
    modules: {},
  };
}

const mockFsPath = path.resolve(__dirname, 'mock-expo-filesystem.cjs');
const mockCryptoPath = path.resolve(__dirname, 'mock-expo-crypto.cjs');
const mockNetworkPath = path.resolve(__dirname, 'mock-expo-network.cjs');
const mockKeepAwakePath = path.resolve(__dirname, 'mock-expo-keep-awake.cjs');
const mockScreenCapturePath = path.resolve(__dirname, 'mock-expo-screen-capture.cjs');
const mockScreenOrientationPath = path.resolve(__dirname, 'mock-expo-screen-orientation.cjs');

Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'react-native') {
    return origResolve.call(this, 'react-native-web', parent, isMain, options);
  }
  if (request === 'expo-file-system/legacy' || request === 'expo-file-system') {
    return mockFsPath;
  }
  if (request === 'expo-crypto') {
    return mockCryptoPath;
  }
  if (request === 'expo-network') {
    return mockNetworkPath;
  }
  if (request === 'expo-keep-awake') {
    return mockKeepAwakePath;
  }
  if (request === 'expo-screen-capture') {
    return mockScreenCapturePath;
  }
  if (request === 'expo-screen-orientation') {
    return mockScreenOrientationPath;
  }
  return origResolve.call(this, request, parent, isMain, options);
};

