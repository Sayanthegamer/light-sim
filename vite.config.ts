import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  plugins: [
    svelte(),
    glsl({
      include: [
        '**/*.glsl', '**/*.vert',
        '**/*.frag', '**/*.vs', '**/*.fs'
      ],
      compress: false,
      watch: true,
      root: 'src/shaders'
    })
  ],
  server: {
    port: 5173,
    host: true
  }
});
