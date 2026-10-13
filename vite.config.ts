import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages는 https://<유저명>.github.io/limbus_battle_simulator/ 처럼 하위 경로에서 서비스되므로
// 빌드된 파일이 이 경로를 기준으로 에셋을 찾도록 base를 레포 이름과 맞춰야 한다.
// https://vite.dev/config/
export default defineConfig({
  base: '/limbus_battle_simulator/',
  plugins: [react()],
})
