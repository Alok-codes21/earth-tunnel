export default {
  base: './',
  build: {
    assetsDir: '',
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { entryFileNames: 'app.js', chunkFileNames: '[name].js', assetFileNames: '[name][extname]' } },
  },
};
