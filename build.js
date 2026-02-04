const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function build() {
  try {
    // Build the editor bundle as ESM
    await esbuild.build({
      entryPoints: ['public/js/editor-tiptap.js'],
      bundle: true,
      outfile: 'public/js/editor.js',
      format: 'esm',
      platform: 'browser',
      target: ['es2020'],
      sourcemap: true,
      external: [],
      minify: false
    });

    console.log('✓ Built editor.js from Tiptap');
    
    // Backup old CodeMirror editor
    if (fs.existsSync('public/js/editor-codemirror.js')) {
      console.log('✓ CodeMirror editor already backed up');
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
