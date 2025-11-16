// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Suppress React Native Firebase deprecation warnings
const originalWarn = console.warn;
console.warn = (...args) => {
  if (
    args[0] &&
    typeof args[0] === 'string' &&
    (args[0].includes('React Native Firebase namespaced API') ||
     args[0].includes('rnfirebase.io/migrating-to-v22'))
  ) {
    return; // Suppress these specific warnings
  }
  originalWarn.apply(console, args);
};

module.exports = config;
