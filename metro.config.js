// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite web desteği (kv-store) .wasm dosyasını statik asset olarak
// bundle etmemizi ister; yoksa web export "Unable to resolve module
// ./wa-sqlite/wa-sqlite.wasm" hatasıyla başarısız olur.
// Kaynak: https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/ (Web kullanımı)
config.resolver.assetExts.push('wasm');

module.exports = config;
