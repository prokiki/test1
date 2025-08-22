# 小学生口算/竖式练习题生成器（可导出 PDF）

- React + TypeScript + Vite
- 一键生成口算/竖式练习题，支持长除法步骤、三栏橙色答题纸、PDF 导出
- 直接 `npm i && npm run dev` 运行；`npm run build && npm run deploy` 发布到 GitHub Pages

## 本地运行
```bash
npm install
npm run dev
```

## GitHub Pages
1. 修改 vite.config.ts 中的 `base` 为你的仓库名（示例：`/math-worksheet/`）
2. 构建并部署：
```bash
npm run build
npm run deploy
```
3. 在仓库 Settings → Pages 选择 `gh-pages` 分支，稍等即可访问：`https://你的用户名.github.io/仓库名/`