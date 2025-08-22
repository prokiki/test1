
import React, { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// ===== 工具函数 =====
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function padLeft(str: string, len: number, ch = " ") {
  return (ch.repeat(Math.max(0, len - str.length)) + str).slice(-len);
}

function pick<T>(arr: T[]) { return arr[randInt(0, arr.length - 1)]; }
function chunkArray<T>(arr: T[], size: number): T[][] { const pages: T[][] = []; for (let i = 0; i < arr.length; i += size) pages.push(arr.slice(i, i + size)); return pages; }
function splitIntoThreeGroups<T>(arr: T[]): [T[], T[], T[]] {
  const n = arr.length;
  const per = Math.ceil(n / 3);
  return [arr.slice(0, per), arr.slice(per, 2 * per), arr.slice(2 * per)];
}

// ===== 类型 =====
type Op = "+" | "-" | "×" | "÷";

type OralProblem = { a: number; b: number; op: Op; ans: number };

type VerticalProblem = { a: number; b: number; op: Op; ans: number };

type PageSize = "A4" | "Letter";

type PaperTemplate = "standard" | "tripleOrange"; // 三栏模板

type PracticeType = "custom" | "mulTable" | "twoDigitCarryAdd" | "twoDigitBorrowSub" | "tensHundredsOral";

// ===== 通用计算 =====
function compute(op: Op, a: number, b: number) { switch (op) { case "+": return a + b; case "-": return a - b; case "×": return a * b; case "÷": return Math.floor(a / Math.max(1, b)); } }

// ===== 口算生成 =====
function genOralProblems(opts: { count: number; ops: Op[]; min: number; max: number; nonNegativeSubtract: boolean; divisibleDivision: boolean; }): OralProblem[] {
  const { count, ops, min, max, nonNegativeSubtract, divisibleDivision } = opts; const problems: OralProblem[] = [];
  for (let i = 0; i < count; i++) { const op = pick(ops); let a = randInt(min, max); let b = randInt(min, max);
    if (op === "-") { if (nonNegativeSubtract && a < b) [a, b] = [b, a]; }
    if (op === "÷") { if (b === 0) b = 1; if (divisibleDivision) { const q = randInt(1, Math.max(1, Math.floor(max / Math.max(1, b)))); a = b * q; } }
    problems.push({ a, b, op, ans: compute(op, a, b) as number }); }
  return problems; }

// ===== 专项生成 =====
function genMulTable(count: number, maxFactor = 9): OralProblem[] { return Array.from({ length: count }, () => { const a = randInt(1, maxFactor); const b = randInt(1, maxFactor); return { a, b, op: "×" as const, ans: a * b }; }); }

function genTwoDigitCarryAdd(count: number): VerticalProblem[] { const res: VerticalProblem[] = []; for (let i = 0; i < count; i++) { let a1 = randInt(1, 9), a0 = randInt(0, 9); let b1 = randInt(1, 9), b0 = randInt(0, 9); if (a0 + b0 < 10) b0 = Math.min(9, 10 - a0 + randInt(0, 4)); const a = a1 * 10 + a0; const b = b1 * 10 + b0; res.push({ a, b, op: "+", ans: a + b }); } return res; }

function genTwoDigitBorrowSub(count: number): VerticalProblem[] { const res: VerticalProblem[] = []; for (let i = 0; i < count; i++) { let A = randInt(10, 99), B = randInt(10, 99); if (A <= B || A % 10 >= B % 10) { const x0 = randInt(0, 8), y0 = randInt(x0 + 1, 9); const x1 = randInt(1, 9), y1 = randInt(0, x1 - 1); A = x1 * 10 + x0; B = y1 * 10 + y0; } res.push({ a: A, b: B, op: "-", ans: A - B }); } return res; }

function genTensHundreds(count: number): OralProblem[] { const res: OralProblem[] = []; for (let i = 0; i < count; i++) { const base = pick([10, 100]); const a = randInt(1, 9) * base; const b = randInt(1, 9) * base; const op = pick(["+", "-"] as Op[]); const a1 = Math.max(a, b), b1 = Math.min(a, b); res.push({ a: a1, b: b1, op, ans: compute(op, a1, b1) as number }); } return res; }

// ===== 通用竖式生成 =====
function genVerticalProblems(opts: { count: number; op: Op; digitsA: number; digitsB: number; nonNegativeSubtract: boolean; divisibleDivision: boolean; }): VerticalProblem[] {
  const { count, op, digitsA, digitsB, nonNegativeSubtract, divisibleDivision } = opts;
  const lowA = Math.pow(10, Math.max(0, digitsA - 1)); const highA = Math.pow(10, digitsA) - 1; const lowB = Math.pow(10, Math.max(0, digitsB - 1)); const highB = Math.pow(10, digitsB) - 1;
  const problems: VerticalProblem[] = [];
  for (let i = 0; i < count; i++) { let a = randInt(lowA, highA); let b = randInt(lowB, highB);
    if (op === "-") { if (nonNegativeSubtract && a < b) [a, b] = [b, a]; if ((a % 10) >= (b % 10)) b = b + 1 <= highB ? b + 1 : b; }
    if (op === "÷") { if (b === 0) b = 1; if (divisibleDivision) { const q = randInt(1, Math.max(1, Math.floor(highA / Math.max(1, b)))); a = b * q; } }
    problems.push({ a, b, op, ans: compute(op, a, b) as number }); }
  return problems; }

// ===== 长除法步骤算法 =====
type DivStep = { idx: number; partial: number; qDigit: number; product: number; remainder: number; bringDown?: number };
function longDivisionSteps(dividend: number, divisor: number): { steps: DivStep[]; quotient: number; remainder: number } {
  const digits = String(dividend).split("").map(Number); let current = 0; const steps: DivStep[] = []; let quotientStr = "";
  digits.forEach((d, i) => { current = current * 10 + d; const qDigit = Math.floor(current / divisor); if (qDigit === 0 && quotientStr === "") { steps.push({ idx: i, partial: current, qDigit: 0, product: 0, remainder: current, bringDown: digits[i + 1] }); return; } const product = qDigit * divisor; const remainder = current - product; quotientStr += String(qDigit); steps.push({ idx: i, partial: current, qDigit, product, remainder, bringDown: digits[i + 1] }); current = remainder; });
  const quotient = Number(quotientStr || "0"); const remainder = current; return { steps, quotient, remainder }; }

// ===== 竖式渲染（规范版 +、-、×） =====
function VerticalStandard({ a, b, op, showAnswer, lineHeight = 1.6, showNumber, index }: { a: number; b: number; op: Exclude<Op, "÷">; showAnswer?: boolean; lineHeight?: number; showNumber?: boolean; index?: number; }) {
  const aStr = String(a), bStr = String(b); const len = Math.max(aStr.length, bStr.length) + 1; const aPad = padLeft(aStr, len), bPad = padLeft(bStr, len); const ansStr = String(compute(op, a, b)); const ansPad = padLeft(ansStr, Math.max(len, ansStr.length));
  return (
    <div className="relative inline-block rounded-2xl border p-3 shadow-sm">
      {showNumber && <div className="absolute -top-2 -left-2 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{index}</div>}
      <div className="flex items-start gap-2" style={{ lineHeight }}>
        <div className="font-mono grid grid-cols-[1ch_auto]">
          <div className="text-right whitespace-pre">{padLeft("", 1)}</div>
          <div className="text-right whitespace-pre">{aPad}</div>
          <div className="text-right whitespace-pre">{op}</div>
          <div className="text-right whitespace-pre">{bPad}</div>
          <div className="col-span-2 h-px w-full bg-black my-1" />
          <div className="col-span-2 text-right whitespace-pre min-h-6">{showAnswer ? ansPad : padLeft("", ansPad.length)}</div>
        </div>
      </div>
    </div>
  );
}

// ===== 除法渲染（长除） =====
function VerticalDivision({ a, b, showAnswer, lineHeight = 1.6, showNumber, index }: { a: number; b: number; showAnswer?: boolean; lineHeight?: number; showNumber?: boolean; index?: number; }) {
  const { steps, quotient, remainder } = longDivisionSteps(a, b); const dividendStr = String(a), divisorStr = String(b), quotientStr = String(quotient); const widthCh = Math.max(dividendStr.length, quotientStr.length) + 1;
  return (
    <div className="relative inline-block rounded-2xl border p-3 shadow-sm">
      {showNumber && <div className="absolute -top-2 -left-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">{index}</div>}
      <div className="font-mono text-sm tabular-nums" style={{ lineHeight }}>
        <div className="flex items-stretch">
          <div className="pr-2 flex items-end">{divisorStr}</div>
          <div className="relative">
            <div className="absolute -top-4 right-0 text-right whitespace-pre" style={{ width: `${widthCh}ch` }}>{padLeft(showAnswer ? quotientStr : "", widthCh)}</div>
            <div className="border-t border-black pl-1" style={{ width: `${widthCh}ch` }}>{padLeft(dividendStr, widthCh)}</div>
            <div className="absolute top-0 -left-1 h-full border-l border-black" />
          </div>
        </div>
        <div className="mt-1">
          {steps.map((s, i) => {
            const indent = Math.max(0, i - (String(a).length - String(quotient).length));
            const pad = padLeft("", indent);
            const partialStr = pad + String(s.partial);
            const productStr = pad + String(s.product);
            const remStr = pad + String(s.remainder);
            return (
              <div key={i} className="mb-1">
                <div className="text-right whitespace-pre">{partialStr}</div>
                {s.qDigit > 0 && (
                  <>
                    <div className="text-right whitespace-pre">{"-" + productStr}</div>
                    <div className="h-px w-full bg-black my-0.5" />
                    <div className="text-right whitespace-pre">{remStr}{typeof s.bringDown === "number" ? " ↓" : ""}</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {showAnswer && (<div className="mt-1 text-right text-xs text-gray-700">商：{quotient}，余：{remainder}</div>)}
      </div>
    </div>
  );
}

// ===== 除法渲染（普通：仅商，不展示步骤） =====
function VerticalDivisionSimple({ a, b, showAnswer, lineHeight = 1.6, showNumber, index }: { a: number; b: number; showAnswer?: boolean; lineHeight?: number; showNumber?: boolean; index?: number; }) {
  const { quotient, remainder } = longDivisionSteps(a, b); const dividendStr = String(a), divisorStr = String(b), quotientStr = String(quotient); const widthCh = Math.max(dividendStr.length, quotientStr.length) + 1;
  return (
    <div className="relative inline-block rounded-2xl border p-3 shadow-sm">
      {showNumber && <div className="absolute -top-2 -left-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-600 text-xs font-bold text-white">{index}</div>}
      <div className="font-mono text-sm tabular-nums" style={{ lineHeight }}>
        <div className="flex items-stretch">
          <div className="pr-2 flex items=end">{divisorStr}</div>
          <div className="relative">
            <div className="absolute -top-4 right-0 text-right whitespace-pre" style={{ width: `${widthCh}ch` }}>{padLeft(showAnswer ? quotientStr : "", widthCh)}</div>
            <div className="border-t border-black pl-1" style={{ width: `${widthCh}ch` }}>{padLeft(dividendStr, widthCh)}</div>
            <div className="absolute top=0 -left-1 h-full border-l border-black" />
          </div>
        </div>
        {showAnswer && (<div className="mt-1 text-right text-xs text-gray-700">商：{quotient}{remainder ? ` 余 ${remainder}` : ""}</div>)}
      </div>
    </div>
  );
}

// ===== PDF 导出（A4/Letter） =====
function getPageSize(size: PageSize) { return size === "Letter" ? { w: 612, h: 792, key: "letter" as const } : { w: 595.28, h: 841.89, key: "a4" as const }; }

// 颜色兜底样式表（防止运行时生成 oklch 被 html2canvas 解析失败）
function buildColorFallbackCSS() {
  return `
  .text-gray-400{color:#9ca3af !important;}
  .text-gray-500{color:#6b7280 !important;}
  .text-gray-600{color:#4b5563 !important;}
  .text-gray-700{color:#374151 !important;}
  .text-gray-800{color:#1f2937 !important;}
  .text-gray-900{color:#111827 !important;}
  .text-slate-900{color:#0f172a !important;}
  .bg-white{background-color:#ffffff !important;}
  .bg-slate-50{background-color:#f8fafc !important;}
  .bg-slate-200{background-color:#e2e8f0 !important;}
  .border{border-color:#e5e7eb !important;}
  .border-gray-200{border-color:#e5e7eb !important;}
  .border-gray-300{border-color:#d1d5db !important;}
  .bg-amber-200{background-color:#fde68a !important;}
  .bg-amber-300{background-color:#fcd34d !important;}
  .bg-amber-400{background-color:#fbbf24 !important;}
  .bg-amber-500{background-color:#f59e0b !important;}
  .bg-amber-600{background-color:#d97706 !important;}
  .text-amber-700{color:#b45309 !important;}
  .border-amber-300{border-color:#fcd34d !important;}
  .border-amber-400{border-color:#fbbf24 !important;}
  .bg-emerald-600{background-color:#059669 !important;}
  .bg-emerald-700{background-color:#047857 !important;}
  .text-emerald-600{color:#059669 !important;}
  .bg-indigo-600{background-color:#4f46e5 !important;}
  .bg-indigo-700{background-color:#4338ca !important;}
  .text-indigo-600{color:#4f46e5 !important;}
  .bg-rose-600{background-color:#e11d48 !important;}
  .bg-rose-700{background-color:#be123c !important;}
  .text-rose-600{color:#e11d48 !important;}
  .bg-gradient-to-b{background-image:linear-gradient(to bottom,#f8fafc,#ffffff) !important;}
  .from-slate-50{--tw-gradient-from:#f8fafc !important;}
  .to-white{--tw-gradient-to:#ffffff !important;}
  `;
}
function applyColorFallback(container: HTMLElement): () => void {
  const style = document.createElement('style');
  style.setAttribute('data-oklch-fallback','true');
  style.textContent = buildColorFallbackCSS();
  container.prepend(style);
  return () => { try { style.remove(); } catch {} };
}
function applyPrintSafe(container: HTMLElement): () => void {
  const style = document.createElement('style');
  style.setAttribute('data-print-safe','true');
  style.textContent = buildColorFallbackCSS() + `
.print-safe *{animation:none !important; transition:none !important;}
.print-safe .shadow,.print-safe .shadow-sm,.print-safe .shadow-md,.print-safe .shadow-lg{box-shadow:none !important;}
.print-safe .bg-gradient-to-b{background-image:none !important; background:#ffffff !important;}
`;
  container.classList.add('print-safe');
  container.prepend(style);
  return () => { try { style.remove(); } catch {} container.classList.remove('print-safe'); };
}
async function exportToPDF(container: HTMLElement, filename = "练习题.pdf", pageSize: PageSize = "A4") {
  const cleanupColor = applyColorFallback(container);
  const cleanupPrint = applyPrintSafe(container);
  try {
    const { key } = getPageSize(pageSize);
    const SCALE = 2;
    const canvas = await html2canvas(container, { scale: SCALE, backgroundColor: "#ffffff", useCORS: true });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "pt", key);
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * pageWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    pdf.save(filename);
  } finally {
    cleanupPrint();
    cleanupColor();
  }
}

// ===== 主组件 =====
export default function MathWorksheetGenerator() {
  // 全局设置
  const [title, setTitle] = useState("口算与竖式练习");
  const [withHeader, setWithHeader] = useState(true);
  const [showAnswers, setShowAnswers] = useState(false);
  const [pageSize, setPageSize] = useState<PageSize>("A4");
  const [paperTemplate, setPaperTemplate] = useState<PaperTemplate>("standard");
  const [equalHeightTriple, setEqualHeightTriple] = useState(true); // 三栏等高分割
  const [headerLogo, setHeaderLogo] = useState("");
  const [footerLogo, setFooterLogo] = useState("");
  const [headerRight, setHeaderRight] = useState("姓名：__________ 班级：__________ 日期：__________");
  const [footerText, setFooterText] = useState("学校名称 School");

  // 专项
  const [practiceType, setPracticeType] = useState<PracticeType>("custom");

  // 口算设置
  const [oralCount, setOralCount] = useState(60);
  const [oralOps, setOralOps] = useState<Op[]>(["+", "-", "×", "÷"]);
  const [oralMin, setOralMin] = useState(0);
  const [oralMax, setOralMax] = useState(100);
  const [oralCols, setOralCols] = useState(4);
  const [oralNNSub, setOralNNSub] = useState(true);
  const [oralDivisible, setOralDivisible] = useState(true);
  const [oralPerPage, setOralPerPage] = useState(60);
  const [oralShowNumber, setOralShowNumber] = useState(true);
  const [oralColSeparators, setOralColSeparators] = useState(true);

  // 竖式设置
  const [verticalCount, setVerticalCount] = useState(24);
  const [verticalOp, setVerticalOp] = useState<Op>("+");
  const [digitsA, setDigitsA] = useState(3);
  const [digitsB, setDigitsB] = useState(2);
  const [verticalNNSub, setVerticalNNSub] = useState(true);
  const [verticalCols, setVerticalCols] = useState(2);
  const [verticalDivisible, setVerticalDivisible] = useState(true);
  const [verticalShowSteps, setVerticalShowSteps] = useState(true); // 仅对 + - ×
  const [divisionMode, setDivisionMode] = useState<"long" | "simple">("long"); // 除法模式
  const [verticalLineHeight, setVerticalLineHeight] = useState(1.6);
  const [verticalPerPage, setVerticalPerPage] = useState(24);
  const [verticalShowNumber, setVerticalShowNumber] = useState(true);
  const [verticalColSeparators, setVerticalColSeparators] = useState(true);

  const [tab, setTab] = useState<"oral" | "vertical">("oral");
  const exerciseRef = useRef<HTMLDivElement>(null);

  // 生成题目
  const oralProblems = useMemo(() => {
    if (practiceType === "mulTable") return genMulTable(oralCount, 9);
    if (practiceType === "tensHundredsOral") return genTensHundreds(oralCount);
    return genOralProblems({ count: oralCount, ops: oralOps, min: oralMin, max: oralMax, nonNegativeSubtract: oralNNSub, divisibleDivision: oralDivisible });
  }, [practiceType, oralCount, oralOps, oralMin, oralMax, oralNNSub, oralDivisible]);

  const verticalProblems = useMemo(() => {
    if (practiceType === "twoDigitCarryAdd") return genTwoDigitCarryAdd(verticalCount);
    if (practiceType === "twoDigitBorrowSub") return genTwoDigitBorrowSub(verticalCount);
    return genVerticalProblems({ count: verticalCount, op: verticalOp, digitsA, digitsB, nonNegativeSubtract: verticalNNSub, divisibleDivision: verticalDivisible });
  }, [practiceType, verticalCount, verticalOp, digitsA, digitsB, verticalNNSub, verticalDivisible]);

  // 分页
  const oralPages = useMemo(() => chunkArray(oralProblems, oralPerPage), [oralProblems, oralPerPage]);
  const verticalPages = useMemo(() => chunkArray(verticalProblems, verticalPerPage), [verticalProblems, verticalPerPage]);

  const handleExport = async () => { if (!exerciseRef.current) return; try { await exportToPDF(exerciseRef.current, `${title}.pdf`, pageSize); } catch (err:any) { console.error('导出失败：', err); alert(`导出失败：${err?.message || err}`); } };

  const labelCls = "text-sm font-medium text-gray-700";
  const inputCls = "w-full rounded-xl border px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";
  const sectionCard = "rounded-2xl border bg-white p-4 shadow-sm";
  const needBorderRight = (i: number, cols: number) => (i % cols) !== cols - 1;

  // ---- 轻量单元测试（控制台） ----
  try {
    console.assert(compute('+', 12, 30) === 42, '加法测试失败');
    console.assert(compute('-', 50, 8) === 42, '减法测试失败');
    console.assert(compute('×', 6, 7) === 42, '乘法测试失败');
    const d = longDivisionSteps(126, 3); // 126 ÷ 3 = 42
    console.assert(d.quotient === 42 && d.remainder === 0, '长除法测试失败');
    // 三栏分配
    const groups = splitIntoThreeGroups(Array.from({length:10}, (_,i)=>i+1));
    console.assert(groups[0].length + groups[1].length + groups[2].length === 10, '三栏分配之和错误');
    console.assert(groups[0].length >= groups[1].length && groups[1].length >= groups[2].length, '三栏长度应非增');
    // 长除边界：被除数 < 除数
    const d2 = longDivisionSteps(12, 25);
    console.assert(d2.quotient === 0 && d2.remainder === 12, '长除边界用例失败');
  } catch (e) { console.warn('自测用例异常', e); }

  return (
    <div className="min-h-screen text-slate-900" style={{background: 'linear-gradient(to bottom, #f8fafc, #ffffff)'}}>
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <motion.h1 initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 text-2xl font-bold md:text-3xl">小学生口算/竖式练习题生成器（可导出 PDF）</motion.h1>

        <div className="grid gap-4 md:grid-cols-3">
          {/* 全局设置 */}
          <div className={sectionCard}>
            <div className="mb-3 text-lg font-semibold">全局设置</div>
            <div className="space-y-3">
              <div>
                <div className={labelCls}>标题</div>
                <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2"><input type="checkbox" checked={withHeader} onChange={(e) => setWithHeader(e.target.checked)} /><span className={labelCls}>打印姓名/日期抬头</span></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} /><span className={labelCls}>同时显示答案页</span></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className={labelCls}>纸张大小</div>
                  <select className={inputCls} value={pageSize} onChange={(e) => setPageSize(e.target.value as PageSize)}><option value="A4">A4</option><option value="Letter">Letter</option></select>
                </div>
                <div>
                  <div className={labelCls}>纸张模板</div>
                  <select className={inputCls} value={paperTemplate} onChange={(e) => setPaperTemplate(e.target.value as PaperTemplate)}>
                    <option value="standard">标准白纸</option>
                    <option value="tripleOrange">三栏橙色答题纸</option>
                  </select>
                </div>
              </div>
              {paperTemplate === 'tripleOrange' && (
                <label className="mt-1 flex items-center gap-2">
                  <input type="checkbox" checked={equalHeightTriple} onChange={(e)=>setEqualHeightTriple(e.target.checked)} />
                  <span className={labelCls}>三栏等高分割（每栏高度一致、题目均匀分配）</span>
                </label>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><div className={labelCls}>页脚文字</div><input className={inputCls} value={footerText} onChange={(e) => setFooterText(e.target.value)} /></div>
                <div><div className={labelCls}>页眉右侧文字</div><input className={inputCls} value={headerRight} onChange={(e) => setHeaderRight(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><div className={labelCls}>页眉校徽 URL</div><input className={inputCls} placeholder="https://...logo.png" value={headerLogo} onChange={(e) => setHeaderLogo(e.target.value)} /></div>
                <div><div className={labelCls}>页脚校徽 URL</div><input className={inputCls} placeholder="https://...logo.png" value={footerLogo} onChange={(e) => setFooterLogo(e.target.value)} /></div>
              </div>
              <div>
                <div className={labelCls}>专项练习</div>
                <select className={inputCls} value={practiceType} onChange={(e) => setPracticeType(e.target.value as PracticeType)}>
                  <option value="custom">— 自定义 —</option>
                  <option value="mulTable">乘法口诀（1~9）</option>
                  <option value="twoDigitCarryAdd">两位数进位加法（竖式）</option>
                  <option value="twoDigitBorrowSub">两位数退位减法（竖式）</option>
                  <option value="tensHundredsOral">整十/整百口算</option>
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button className="rounded-2xl bg-indigo-600 px-4 py-2 text-white shadow hover:bg-indigo-700" onClick={() => setTab("oral")}>口算</button>
                <button className="rounded-2xl bg-emerald-600 px-4 py-2 text-white shadow hover:bg-emerald-700" onClick={() => setTab("vertical")}>竖式</button>
                <button className="rounded-2xl bg-rose-600 px-4 py-2 text-white shadow hover:bg-rose-700 ml-auto" onClick={handleExport}>导出 PDF</button>
              </div>
            </div>
          </div>

          {/* 口算设置 */}
          <div className={sectionCard}>
            <div className="mb-3 text-lg font-semibold">口算设置</div>
            <div className="grid grid-cols-2 gap-3">
              <div><div className={labelCls}>数量</div><input type="number" min={1} className={inputCls} value={oralCount} onChange={(e) => setOralCount(parseInt(e.target.value || "0"))} /></div>
              <div><div className={labelCls}>每行列数</div><input type="number" min={2} max={8} className={inputCls} value={oralCols} onChange={(e) => setOralCols(parseInt(e.target.value || "0"))} /></div>
              <div><div className={labelCls}>最小数</div><input type="number" className={inputCls} value={oralMin} onChange={(e) => setOralMin(parseInt(e.target.value || "0"))} /></div>
              <div><div className={labelCls}>最大数</div><input type="number" className={inputCls} value={oralMax} onChange={(e) => setOralMax(parseInt(e.target.value || "0"))} /></div>
              <div className="col-span-2"><div className={labelCls}>运算（可多选）</div>
                <div className="flex flex-wrap gap-3 pt-1">{"+,-,×,÷".split(",").map((sym) => (
                  <label key={sym} className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 shadow-sm">
                    <input type="checkbox" checked={oralOps.includes(sym as Op)} onChange={(e) => setOralOps((prev) => (e.target.checked ? [...prev, sym as Op] : prev.filter((x) => x !== (sym as Op))))} />
                    <span className="font-medium">{sym}</span>
                  </label>
                ))}</div>
              </div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={oralNNSub} onChange={(e) => setOralNNSub(e.target.checked)} /><span className={labelCls}>减法不出负数</span></label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={oralDivisible} onChange={(e) => setOralDivisible(e.target.checked)} /><span className={labelCls}>除法必须整除</span></label>
              <div><div className={labelCls}>每页题数</div><input type="number" min={10} className={inputCls} value={oralPerPage} onChange={(e) => setOralPerPage(parseInt(e.target.value || "0"))} /></div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={oralShowNumber} onChange={(e) => setOralShowNumber(e.target.checked)} /><span className={labelCls}>显示题号</span></label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={oralColSeparators} onChange={(e) => setOralColSeparators(e.target.checked)} /><span className={labelCls}>显示分栏线</span></label>
            </div>
          </div>

          {/* 竖式设置 */}
          <div className={sectionCard}>
            <div className="mb-3 text-lg font-semibold">竖式设置</div>
            <div className="grid grid-cols-2 gap-3">
              <div><div className={labelCls}>数量</div><input type="number" min={1} className={inputCls} value={verticalCount} onChange={(e) => setVerticalCount(parseInt(e.target.value || "0"))} /></div>
              <div><div className={labelCls}>每行列数</div><input type="number" min={1} max={4} className={inputCls} value={verticalCols} onChange={(e) => setVerticalCols(parseInt(e.target.value || "0"))} /></div>
              <div><div className={labelCls}>运算</div><select className={inputCls} value={verticalOp} onChange={(e) => setVerticalOp(e.target.value as Op)}><option value="+">加法</option><option value="-">减法</option><option value="×">乘法</option><option value="÷">除法</option></select></div>
              <div><div className={labelCls}>被运算数位数</div><input type="number" min={1} max={6} className={inputCls} value={digitsA} onChange={(e) => setDigitsA(parseInt(e.target.value || "0"))} /></div>
              <div><div className={labelCls}>运算数位数</div><input type="number" min={1} max={6} className={inputCls} value={digitsB} onChange={(e) => setDigitsB(parseInt(e.target.value || "0"))} /></div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={verticalNNSub} onChange={(e) => setVerticalNNSub(e.target.checked)} /><span className={labelCls}>减法不出负数</span></label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={verticalDivisible} onChange={(e) => setVerticalDivisible(e.target.checked)} /><span className={labelCls}>除法必须整除</span></label>
              <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={verticalShowSteps} onChange={(e) => setVerticalShowSteps(e.target.checked)} /><span className={labelCls}>显示中间步骤/占位格（加/减/乘）</span></label>
              {verticalOp === "÷" && (
                <div className="col-span-2 grid grid-cols-2 gap-3">
                  <div><div className={labelCls}>除法模式</div><select className={inputCls} value={divisionMode} onChange={(e) => setDivisionMode(e.target.value as any)}><option value="long">长除（带步骤）</option><option value="simple">普通除法（仅商）</option></select></div>
                </div>
              )}
              <div className="col-span-2"><div className={labelCls}>竖式行距（1.2~2.0）</div><input type="number" step={0.1} min={1.2} max={2.0} className={inputCls} value={verticalLineHeight} onChange={(e) => setVerticalLineHeight(parseFloat(e.target.value || "1.6"))} /></div>
              <div><div className={labelCls}>每页题数</div><input type="number" min={6} className={inputCls} value={verticalPerPage} onChange={(e) => setVerticalPerPage(parseInt(e.target.value || "0"))} /></div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={verticalShowNumber} onChange={(e) => setVerticalShowNumber(e.target.checked)} /><span className={labelCls}>显示题号</span></label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={verticalColSeparators} onChange={(e) => setVerticalColSeparators(e.target.checked)} /><span className={labelCls}>显示分栏线</span></label>
            </div>
          </div>
        </div>

        {/* 预览 + 导出区域（分页渲染） */}
        <div className="mt-6 rounded-2xl border bg白 p-4 shadow-sm print:shadow-none" ref={exerciseRef}>
          <style>{`
            @page { size: ${"${pageSize}"}; margin: 14mm; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
            .page { page-break-after: always; }
          `}</style>

          {/* 兼容性自检 */}
          <button onClick={() => {
            const root = exerciseRef.current!;
            const offenders: string[] = [];
            const props: (keyof CSSStyleDeclaration)[] = ["color","backgroundColor","borderColor"] as any;
            root.querySelectorAll<HTMLElement>("*").forEach(el => {
              const cs = getComputedStyle(el);
              props.forEach((p:any) => {
                const v = (cs as any)[p] as string;
                if (typeof v === 'string' && v.toLowerCase().includes('oklch')) {
                  offenders.push(`${p}: ${v} <- ${el.tagName}.${el.className}`);
                }
              });
            });
            if (offenders.length === 0) alert('颜色自检通过：未发现 oklch'); else alert('发现不支持的颜色：\\n' + offenders.slice(0,10).join('\\n') + (offenders.length>10?'\\n...':'') );
          }} className="mb-3 rounded-lg border px-3 py-1 text-sm">颜色兼容性自检</button>

          {(tab === "oral" ? oralPages : verticalPages).map((page, pi) => (
            <div key={pi} className={`page p-2 ${paperTemplate === 'tripleOrange' ? 'rounded-xl border-2 border-amber-400' : ''}`}>
              {/* 页眉 */}
              {withHeader && (
                <div className={`mb-3 flex items-center justify-between ${paperTemplate === 'tripleOrange' ? 'text-amber-700 border-b-2 border-amber-300 pb-2' : 'border-b pb-2'}`}>
                  <div className="flex items-center gap-2">
                    {headerLogo ? <img src={headerLogo} alt="logo" className="h-7 w-7 rounded-full object-cover" /> : <div className={`h-7 w-7 rounded-full ${paperTemplate === 'tripleOrange' ? 'bg-amber-200' : 'bg-slate-200'}`} />}
                    <div className={`text-lg font-bold ${paperTemplate === 'tripleOrange' ? 'text-amber-700' : ''}`}>{title}</div>
                  </div>
                  <div className={`text-xs ${paperTemplate === 'tripleOrange' ? 'text-amber-700' : 'text-gray-600'}`}>{headerRight}</div>
                </div>
              )}

              {/* 主体题目 */}
              {tab === "oral" ? (
                <div>
                  <div className={`mb-2 text-lg font-semibold ${paperTemplate === 'tripleOrange' ? 'text-amber-700' : ''}`}>一、口算</div>
                  {paperTemplate === 'tripleOrange' ? (
                    equalHeightTriple ? (() => {
                      const [g1, g2, g3] = splitIntoThreeGroups(page);
                      const groups = [g1, g2, g3];
                      return (
                        <div className="grid rounded-xl border-4 border-amber-400" style={{gridTemplateRows:'1fr 1fr 1fr'}}>
                          {groups.map((group, row) => (
                            <div key={row} className={`p-3 ${row<2? 'border-b-2 border-amber-300':''}`}>
                              <div className="grid gap-y-2" style={{ gridTemplateColumns: `repeat(${oralCols}, minmax(0, 1fr))` }}>
                                {group.map((p, i) => {
                                  const globalIndex = pi*oralPerPage + (row===0? i+1 : row===1? g1.length+i+1 : g1.length+g2.length+i+1);
                                  const cellBorder = oralColSeparators && (i % oralCols) !== (oralCols - 1);
                                  return (
                                    <div key={i} className={`pr-3 ${cellBorder? 'border-r border-amber-300 border-dashed':''}`}>
                                      <div className="font-medium tabular-nums flex items-center gap-2">
                                        {oralShowNumber && <span className="text-xs text-gray-500 w-6 text-right">{globalIndex}.</span>}
                                        <span>{p.a} {p.op} {p.b} = ______</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })() : (
                      <div className="rounded-xl border-4 border-amber-400">
                        {[0,1,2].map((row) => (
                          <div key={row} className={`p-3 ${row<2? 'border-b-2 border-amber-300':''}`}>
                            <div className="grid gap-y-2" style={{ gridTemplateColumns: `repeat(${oralCols}, minmax(0, 1fr))` }}>
                              {page.filter((_, idx) => idx % 3 === row).map((p, i) => {
                                const cellBorder = oralColSeparators && (i % oralCols) !== (oralCols - 1);
                                return (
                                  <div key={i} className={`pr-3 ${cellBorder? 'border-r border-amber-300 border-dashed':''}`}>
                                    <div className="font-medium tabular-nums flex items-center gap-2">
                                      {oralShowNumber && <span className="text-xs text-gray-500 w-6 text-right">{pi*oralPerPage + (row + i*3) + 1}.</span>}
                                      <span>{p.a} {p.op} {p.b} = ______</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="grid gap-y-2" style={{ gridTemplateColumns: `repeat(${oralCols}, minmax(0, 1fr))` }}>
                      {page.map((p, i) => {
                        const globalIndex = pi * oralPerPage + i + 1;
                        const cellBorder = oralColSeparators && (i % oralCols) !== (oralCols - 1);
                        return (
                          <div key={i} className={`pr-3 ${cellBorder? 'border-r':''}`}>
                            <div className="font-medium tabular-nums flex items-center gap-2">
                              {oralShowNumber && <span className="text-xs text-gray-500 w-6 text-right">{globalIndex}.</span>}
                              <span>{p.a} {p.op} {p.b} = ______</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {showAnswers && (
                    <div className="mt-6">
                      <div className={`mb-2 text-lg font-semibold ${paperTemplate === 'tripleOrange' ? 'text-amber-700' : ''}`}>答案：口算</div>
                      <div className="grid gap-y-1 text-sm text-gray-700" style={{ gridTemplateColumns: `repeat(${oralCols}, minmax(0, 1fr))` }}>
                        {page.map((p, i) => {
                          const globalIndex = pi * oralPerPage + i + 1;
                          const cellBorder = oralColSeparators && (i % oralCols) !== (oralCols - 1);
                          return (
                            <div key={i} className={`pr-3 ${cellBorder? 'border-r':''}`}>
                              <div className="tabular-nums flex items-center gap-2">
                                {oralShowNumber && <span className="text-xs text-gray-500 w-6 text-right">{globalIndex}.</span>}
                                <span>{p.a} {p.op} {p.b} = <span className="font-bold">{p.ans}</span></span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className={`mb-2 text-lg font-semibold ${paperTemplate === 'tripleOrange' ? 'text-amber-700' : ''}`}>一、竖式（{verticalOp === "+" ? "加法" : verticalOp === "-" ? "减法" : verticalOp === "×" ? "乘法" : (divisionMode === 'long' ? '除法（长除）' : '除法（普通）')}）</div>
                  {paperTemplate === 'tripleOrange' ? (
                    equalHeightTriple ? (() => {
                      const [g1, g2, g3] = splitIntoThreeGroups(page);
                      const groups = [g1, g2, g3];
                      return (
                        <div className="grid rounded-xl border-4 border-amber-400" style={{gridTemplateRows:'1fr 1fr 1fr'}}>
                          {groups.map((group, row) => (
                            <div key={row} className={`p-3 ${row<2? 'border-b-2 border-amber-300':''}`}>
                              <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${verticalCols}, minmax(0, 1fr))` }}>
                                {group.map((p, i) => {
                                  const globalIndex = pi*verticalPerPage + (row===0? i+1 : row===1? g1.length+i+1 : g1.length+g2.length+i+1);
                                  const cellBorder = verticalColSeparators && (i % verticalCols) !== (verticalCols - 1);
                                  return (
                                    <div key={i} className={`${cellBorder? 'border-r border-dashed border-amber-300 pr-3':''}`}>
                                      {p.op === "÷" ? (
                                        divisionMode === "long" ? (
                                          <VerticalDivision a={p.a} b={p.b} showAnswer={showAnswers} lineHeight={verticalLineHeight} showNumber={verticalShowNumber} index={globalIndex} />
                                        ) : (
                                          <VerticalDivisionSimple a={p.a} b={p.b} showAnswer={showAnswers} lineHeight={verticalLineHeight} showNumber={verticalShowNumber} index={globalIndex} />
                                        )
                                      ) : (
                                        <VerticalStandard a={p.a} b={p.b} op={p.op as Exclude<Op, "÷">} showAnswer={showAnswers} lineHeight={verticalLineHeight} showNumber={verticalShowNumber} index={globalIndex} />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })() : (
                      <div className="rounded-xl border-4 border-amber-400">
                        {[0,1,2].map((row) => (
                          <div key={row} className={`p-3 ${row<2? 'border-b-2 border-amber-300':''}`}>
                            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${verticalCols}, minmax(0, 1fr))` }}>
                              {page.filter((_, idx) => idx % 3 === row).map((p, i) => (
                                <div key={i} className={`${(i % verticalCols)!==(verticalCols-1)? 'border-r border-dashed border-amber-300 pr-3':''}`}>
                                  {p.op === "÷" ? (
                                    divisionMode === "long" ? (
                                      <VerticalDivision a={p.a} b={p.b} showAnswer={showAnswers} showNumber={verticalShowNumber} index={pi*verticalPerPage + (row + i*3) + 1} />
                                    ) : (
                                      <VerticalDivisionSimple a={p.a} b={p.b} showAnswer={showAnswers} showNumber={verticalShowNumber} index={pi*verticalPerPage + (row + i*3) + 1} />
                                    )
                                  ) : (
                                    <VerticalStandard a={p.a} b={p.b} op={p.op as Exclude<Op,"÷">} showAnswer={showAnswers} showNumber={verticalShowNumber} index={pi*verticalPerPage + (row + i*3) + 1} />
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${verticalCols}, minmax(0, 1fr))` }}>
                      {page.map((p, i) => {
                        const globalIndex = pi * verticalPerPage + i + 1;
                        const cellBorder = verticalColSeparators && (i % verticalCols) !== (verticalCols - 1);
                        return (
                          <div key={i} className={`pr-3 ${cellBorder? 'border-r':''}`}>
                            {p.op === "÷" ? (
                              divisionMode === "long" ? (
                                <VerticalDivision a={p.a} b={p.b} showAnswer={showAnswers} lineHeight={verticalLineHeight} showNumber={verticalShowNumber} index={globalIndex} />
                              ) : (
                                <VerticalDivisionSimple a={p.a} b={p.b} showAnswer={showAnswers} lineHeight={verticalLineHeight} showNumber={verticalShowNumber} index={globalIndex} />
                              )
                            ) : (
                              <VerticalStandard a={p.a} b={p.b} op={p.op as Exclude<Op, "÷">} showAnswer={showAnswers} lineHeight={verticalLineHeight} showNumber={verticalShowNumber} index={globalIndex} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {showAnswers && (
                    <div className="mt-6">
                      <div className={`mb-2 text-lg font-semibold ${paperTemplate === 'tripleOrange' ? 'text-amber-700' : ''}`}>答案：竖式（结果）</div>
                      <div className="grid gap-3 text-sm text-gray-700" style={{ gridTemplateColumns: `repeat(${verticalCols}, minmax(0, 1fr))` }}>
                        {page.map((p, i) => {
                          const globalIndex = pi * verticalPerPage + i + 1;
                          const cellBorder = verticalColSeparators && (i % verticalCols) !== (verticalCols - 1);
                          return (
                            <div key={i} className={`pr-3 ${cellBorder? 'border-r':''}`}>
                              <div className="inline-block rounded-2xl border p-3">
                                <div className="mb-2 font-medium text-gray-600">{verticalShowNumber && <span className="mr-2 text-xs text-gray-500">{globalIndex}.</span>}{p.a} {p.op} {p.b}</div>
                                <div className="font-mono text-base font-bold tabular-nums">= {p.ans}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 页脚 */}
              <div className={`mt-4 flex items-center justify之间 ${paperTemplate === 'tripleOrange' ? 'border-t-2 border-amber-300 text-amber-700 pt-2' : 'border-t pt-2 text-gray-500'} text-xs`}>
                <div className="flex items-center gap-2">
                  {footerLogo ? <img src={footerLogo} alt="logo" className="h-5 w-5 rounded-full object-cover" /> : <div className={`h-5 w-5 rounded-full ${paperTemplate === 'tripleOrange' ? 'bg-amber-200' : 'bg-slate-200'}`} />}
                  <span>{footerText}</span>
                </div>
                <div>第 {pi + 1} 页</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 text-xs text-gray-500">提示：若 PDF 导出遇到配色报错，请先点“颜色兼容性自检”；或把模板改为“标准白纸”做对比。</div>
      </div>
    </div>
  );
}
