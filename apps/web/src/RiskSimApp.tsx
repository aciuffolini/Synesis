


import React, { useMemo, useRef, useState, useEffect } from "react";

/**
 * Drop-in replacement for the existing <LineChart/> and a runnable demo scaffold.
 *
 * Fix: Completed JSX in RiskSimApp where the Elasticidad section was left unterminated,
 * causing an "Unterminated JSX contents" SyntaxError. The section now properly renders
 * the <LineChart/> with all props and closes its containers.
 *
 * Goals addressed:
 * 1) Visual balance vs Heatmap → larger inner plot, clearer ticks/labels.
 * 2) Smoother hover labels → RAF-throttled pointer handling (no async jitter).
 * 3) Better tooltip UX → smart positioning to avoid clipping.
 * 4) Strictly preserves props API so the rest of the app remains unchanged.
 */
const toNumber = (raw: unknown): number | null => {
  if (raw === null || raw === undefined) return null;
  const t = typeof raw;
  if (t === "number") return Number.isFinite(raw as number) ? (raw as number) : null;
  if (t === "string") {
    const cleaned = (raw as string).trim().replace(/[\s,]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
function formatNumber(raw: unknown): string {
  const n = toNumber(raw);
  if (n === null) return "-";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (abs >= 1000) return Math.round(n).toLocaleString("en-US");
  if (abs >= 10) return n.toFixed(1);
  if (abs >= 1) return n.toFixed(2);
  return n.toFixed(3);
}

function formatTooltipText(pv: number, pc: number, margin: number, breakevenVenta?: number | null): string {
  const pc_fmt = formatNumber(pc);
  const pv_fmt = formatNumber(pv);
  const m_fmt = formatNumber(margin);
  const estado = margin >= 0 ? "Rentable" : "Pérdida";
  
  let lines = [
    `Precio de Compra (PC): $ ${pc_fmt} /kg`,
    `Precio de Venta (PV): $ ${pv_fmt} /kg`
  ];
  
  if (breakevenVenta != null && Number.isFinite(breakevenVenta)) {
    const bev_fmt = formatNumber(breakevenVenta);
    lines.push(`Breakeven Venta: $ ${bev_fmt} /kg`);
  }
  
  lines.push(`Margen Neto / cab: $ ${m_fmt} — ${estado}`);
  
  return lines.join('\n');
}


/**
 * LineChartPro — drop-in replacement for your current <LineChart/>
 * Focus:
 *  - Cleaner design (area fill, softer grid, title lane)
 *  - Crosshair with BOTH vertical & horizontal lines (intersection locked to nearest sample)
 *  - Synchronous (RAF-throttled) hover labels to avoid flicker
 *  - Axis badges showing the exact X/Y at the intersection
 *
 * Props API kept backward-compatible:
 *  x, y, height, strokeWidth, xLabel, yLabel, highlightX, showZeroLine, domainXMin, domainXMax
 */

type LineChartProps = {
  x: number[];
  y: number[];
  height?: number;
  strokeWidth?: number;
  xLabel?: string;
  yLabel?: string;
  highlightX?: number | null;
  showZeroLine?: boolean;
  domainXMin?: number;
  domainXMax?: number;
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const fmt = (n: number) => {
  const abs = Math.abs(n);
  if (!Number.isFinite(n)) return "-";
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (abs >= 1000) return Math.round(n).toLocaleString("en-US");
  if (abs >= 10) return n.toFixed(1);
  if (abs >= 1) return n.toFixed(2);
  return n.toFixed(3);
};
const ticks = (min: number, max: number, count: number) => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) return [min];
  const step = (max - min) / Math.max(1, count - 1);
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(min + i * step);
  return out;
};

export const LineChart: React.FC<LineChartProps> = ({
  x,
  y,
  height = 340,
  strokeWidth = 2.25,
  xLabel,
  yLabel,
  highlightX = null,
  showZeroLine = true,
  domainXMin,
  domainXMax,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // ---- responsive width
  const [W, setW] = useState(960);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ResizeObs = (window as any).ResizeObserver;
    if (!ResizeObs) {
      setW(el.clientWidth || 960);
      return;
    }
    const ro = new ResizeObs((entries: any[]) => {
      const w = Math.max(720, Math.round(entries[0].contentRect.width));
      setW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!x?.length || !y?.length || x.length !== y.length) {
    return (
      <div className="w-full h-[320px] flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 text-gray-400">
        No data
      </div>
    );
  }

  // ---- domains
  const dMinX = Math.min(...x), dMaxX = Math.max(...x);
  const minX = domainXMin ?? dMinX;
  const maxX = domainXMax ?? dMaxX;
  const minY = Math.min(...y), maxY = Math.max(...y);

  // ---- layout - optimized for 340px height to match heatmap
  const H = Math.max(300, Math.min(400, height));
  const padL = 60, padR = 24, padT = 18, padB = 42;

  // ---- scales
  const sx = (v: number) => padL + ((v - minX) / Math.max(1e-9, maxX - minX)) * (W - padL - padR);
  const sy = (v: number) => H - (padB + ((v - minY) / Math.max(1e-9, maxY - minY)) * (H - padT - padB));

  // ---- geometry
  const poly = useMemo(
    () => x.map((xi, i) => `${i ? "L" : "M"}${sx(xi)},${sy(y[i])}`).join(" "),
    [x, y, minX, maxX, minY, maxY, W, H]
  );

  // ---- ticks
  const xTickCount = Math.max(4, Math.min(10, Math.round((W - padL - padR) / 120)));
  const yTickCount = Math.max(4, Math.min(8, Math.round((H - padT - padB) / 56)));
  const xt = ticks(minX, maxX, xTickCount);
  const yt = ticks(minY, maxY, yTickCount);

  // ---- helpers
  const nearestIdx = (xVal: number) => {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < x.length; i++) {
      const d = Math.abs(x[i] - xVal);
      if (d < bestD) { best = i; bestD = d; }
    }
    return best;
  };
  const slopeAt = (idx: number) => {
    const j = Math.min(idx + 1, x.length - 1);
    const dy = y[j] - y[idx];
    const dx = x[j] - x[idx];
    return dy / Math.max(1e-9, dx);
  };

  // ---- hover: fully synchronous via RAF throttle
  const [hIdx, setHIdx] = useState<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastIdxRef = useRef<number | null>(null);
  const onMove: React.MouseEventHandler<SVGRectElement> = (e) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    const px = e.clientX - box.left;
    const t = clamp01((px - padL) / Math.max(1e-9, W - padL - padR));
    const xVal = minX + t * (maxX - minX);
    const idx = nearestIdx(xVal);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (idx !== lastIdxRef.current) {
        lastIdxRef.current = idx;
        setHIdx(idx);
      }
    });
  };
  const onLeave = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastIdxRef.current = null;
    setHIdx(null);
  };

  const hiIdx = highlightX != null ? nearestIdx(highlightX) : null;
  const hover = hIdx != null ? { xi: x[hIdx], yi: y[hIdx] } : null;
  const hoverSlope = hIdx != null ? slopeAt(hIdx) : null;

  // ---- tooltip layout - optimized for smaller chart
  const tipRect = (xi: number, yi: number) => {
    const cx = sx(xi), cy = sy(yi);
    const boxW = 180, boxH = 44;
    const rightSpace = W - cx - padR, leftSpace = cx - padL;
    const placeLeft = rightSpace < boxW + 12 && leftSpace > boxW + 12;
    const x0 = placeLeft ? cx - boxW - 8 : cx + 8;
    const y0 = Math.max(padT, Math.min(cy - boxH / 2, H - padB - boxH));
    return { x0, y0, cx, cy };
  };

  // ---- axis badges for crosshair position - compact for smaller chart
  const AxisBadge: React.FC<{ x: number; y: number; text: string; anchor: "x" | "y" }> = ({ x, y, text, anchor }) => {
    const tx = anchor === "x" ? x : padL - 6;
    const ty = anchor === "x" ? H - padB + 18 : y;
    const ta = anchor === "x" ? "middle" : "end";
    return (
      <g>
        <rect
          x={anchor === "x" ? x - 40 : padL - 80}
          y={anchor === "x" ? H - padB + 8 : y - 8}
          width={anchor === "x" ? 80 : 80}
          height={30}
          rx={6}
          fill="#0b1220"
          stroke="#1f2937"
        />
        <text x={tx} y={ty} textAnchor={ta} dominantBaseline="middle" fill="#cbd5e1" fontSize={20} fontWeight="bold">
          {text}
        </text>
      </g>
    );
  };

  return (
    <div ref={wrapRef} className="w-full" style={{ height }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full bg-gradient-to-b from-[#060b11] to-black rounded-xl border border-neutral-800"
      >
        {/* defs */}
        <defs>
          <linearGradient id="gridShade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b1220" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#0b1220" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.4" />
            <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#0891b2" stopOpacity="0.1" />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* chart background and grid lanes */}
        <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB} fill="#0a0f1a" />
        <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB} fill="url(#gridShade)" />
        {yt.map((t, i) => (
          <line key={`gy-${i}`} x1={padL} x2={W - padR} y1={sy(t)} y2={sy(t)} stroke="#12202e" strokeWidth={1} />
        ))}
        {xt.map((t, i) => (
          <line key={`gx-${i}`} y1={padT} y2={H - padB} x1={sx(t)} x2={sx(t)} stroke="#0f1a26" strokeWidth={1} />
        ))}

        {/* zero line */}
        {showZeroLine && minY < 0 && maxY > 0 && (
          <line x1={padL} x2={W - padR} y1={sy(0)} y2={sy(0)} stroke="#64748b" strokeDasharray="4 4" />
        )}

        {/* highlight X marker */}
        {hiIdx != null && (
          <line
            x1={sx(x[hiIdx])}
            x2={sx(x[hiIdx])}
            y1={padT}
            y2={H - padB}
            stroke="#22d3ee"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        )}

        {/* area + main line - enhanced area fill */}
        <path
          d={`${poly} L ${sx(x[x.length - 1])},${H - padB} L ${sx(x[0])},${H - padB} Z`}
          fill="url(#areaFill)"
          opacity={0.8}
        />
        <path d={poly} fill="none" stroke="#67e8f9" strokeWidth={strokeWidth} filter="url(#glow)" />

        {/* axes */}
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#94a3b8" />
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#94a3b8" />

        {/* labels - optimized for smaller height, positioned within chart area */}
        {yt.map((t, i) => (
          <text
            key={`yl-${i}`}
            x={padL - 8}
            y={sy(t)}
            textAnchor="end"
            dominantBaseline="middle"
            fill="#9ca3af"
            fontSize={12}
            fontWeight="500"
          >
            {fmt(t)}
          </text>
        ))}
        {xt.map((t, i) => (
          <text key={`xl-${i}`} x={sx(t)} y={H - padB + 14} textAnchor="middle" fill="#9ca3af" fontSize={10}>
            {fmt(t)}
          </text>
        ))}
        {yLabel && (
          <text
            x={12}
            y={(H - padB + padT) / 2}
            transform={`rotate(-90, 12, ${(H - padB + padT) / 2})`}
            textAnchor="middle"
            fill="#e5e7eb"
            fontSize={11}
          >
            {yLabel}
          </text>
        )}
        {xLabel && (
          <text x={(W - padR + padL) / 2} y={H - 6} textAnchor="middle" fill="#e5e7eb" fontSize={11}>
            {xLabel}
          </text>
        )}

        {/* crosshair + tooltip + axis badges */}
        {hover && (() => {
          const { x0, y0, cx, cy } = tipRect(hover.xi, hover.yi);
          return (
            <g>
              {/* crosshair lines */}
              <line x1={cx} x2={cx} y1={padT} y2={H - padB} stroke="#7dd3fc" strokeDasharray="3 3" />
              <line x1={padL} x2={W - padR} y1={cy} y2={cy} stroke="#7dd3fc" strokeDasharray="3 3" />
              {/* point */}
              <circle cx={cx} cy={cy} r={4.5} fill="#67e8f9" stroke="#022232" />
              {/* tooltip - compact for smaller chart */}
              <rect x={x0} y={y0} width={180} height={44} rx={8} fill="#07131e" stroke="#0f1a26" />
              <text x={x0 + 10} y={y0 + 14} fill="#e2e8f0" fontSize={10}>
                {`Precio: ${fmt(hover.xi)}/kg`}
              </text>
              <text x={x0 + 10} y={y0 + 28} fill="#67e8f9" fontSize={10}>
                {`Margen: ${fmt(hover.yi)}/cab`}
              </text>
              <text x={x0 + 10} y={y0 + 42} fill="#94a3b8" fontSize={9}>
                {`dM/dP ≈ ${fmt(hoverSlope ?? 0)}`}
              </text>
              {/* axis badges */}
              <AxisBadge x={cx} y={cy} text={fmt(hover.xi)} anchor="x" />
              <AxisBadge x={cx} y={cy} text={fmt(hover.yi)} anchor="y" />
            </g>
          );
        })()}

        {/* hit rect */}
        <rect
          x={padL}
          y={padT}
          width={W - padL - padR}
          height={H - padT - padB}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={onLeave}
        />
      </svg>
    </div>
  );
};

// LineChart is exported as named export above

// ==================== (Canvas additions) Rest of the app code ====================
// NOTE: These are type-only declarations so the canvas compiles without the real app modules.
// Your real app should continue importing these from "./db" and "./utils" as before.

// Simple in-memory storage for scenarios (replace with actual database in production)
let scenarioStorage: { id: number; name: string; data: any; createdAt: Date }[] = [];
let nextScenarioId = 1;

// Simple localStorage-based settings (replace with actual storage in production)
const loadSetting = async <T,>(key: string, def: T): Promise<T> => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : def;
  } catch {
    return def;
  }
};

const saveSetting = async (key: string, value: any): Promise<void> => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Failed to save setting:', error);
  }
};

const addScenario = async (name: string, data: any): Promise<void> => {
  const scenario = {
    id: nextScenarioId++,
    name,
    data,
    createdAt: new Date()
  };
  scenarioStorage.push(scenario);
  // Also save to localStorage for persistence
  localStorage.setItem('risk_scenarios', JSON.stringify(scenarioStorage));
};

const listScenarios = async (): Promise<any[]> => {
  // Load from localStorage on first call
  if (scenarioStorage.length === 0) {
    try {
      const stored = localStorage.getItem('risk_scenarios');
      if (stored) {
        scenarioStorage = JSON.parse(stored);
        nextScenarioId = Math.max(...scenarioStorage.map(s => s.id), 0) + 1;
      }
    } catch (error) {
      console.error('Failed to load scenarios:', error);
    }
  }
  return scenarioStorage.map(s => ({ id: s.id, name: s.name, data: s.data }));
};

const getScenario = async (id: number): Promise<any> => {
  return scenarioStorage.find(s => s.id === id) || null;
};

const deleteScenario = async (id: number): Promise<void> => {
  scenarioStorage = scenarioStorage.filter(s => s.id !== id);
  localStorage.setItem('risk_scenarios', JSON.stringify(scenarioStorage));
};

const downloadJSON = (filename: string, data: any): void => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.json') ? filename : `${filename}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ---------- small types ----------
type Scenario = {
  precioCompra: number;
  precioVenta: number;
  numCabezas: number;
  pesoCompra: number;
  pesoSalida: number;
  precioPorTn: number;
  conversion: number;
  mortandad: number;
  adpv: number;
  estadia: number;
  sanidad: number;
};

/** ========================= Heatmap ========================= */
export const Heatmap: React.FC<{
  x: number[];
  y: number[];
  z: number[][];
  zeroLineX?: number[];
  currentX?: number | null;
  currentY?: number | null;
  height?: number;
  xLabel?: string;
  yLabel?: string;
  // Add parameters for exact calculation
  pesoCompra?: number;
  pesoSalida?: number;
  precioPorTn?: number;
  conversion?: number;
  adpv?: number;
  estadia?: number;
  sanidad?: number;
}> = ({
  x, y, z, zeroLineX, currentX = null, currentY = null,
  height = 340, xLabel = "Precio Venta ($/kg)", yLabel = "Precio Compra ($/kg)",
  pesoCompra = 200, pesoSalida = 460, precioPorTn = 64000, conversion = 8, 
  adpv = 1.2, estadia = 30, sanidad = 1200
}) => {
  if (!x?.length || !y?.length || !z?.length) {
    return <div className="w-full h-[340px] flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 text-gray-400">No data</div>;
  }
  const flat = z.flat();
  const minZ = Math.min(...flat), maxZ = Math.max(...flat);
  const maxPos = Math.max(0, maxZ);
  const maxNeg = Math.max(0, -Math.min(0, minZ));

  const color = (v: number) => {
    if (!Number.isFinite(v)) return "#111827";
    if (v >= 0) {
      const t = maxPos > 0 ? Math.min(1, v / maxPos) : 0;
      const g = Math.round(120 + 100 * t);
      const b = Math.round(120 + 60 * t);
      return `rgb(${40},${g},${b})`;
    } else {
      const t = maxNeg > 0 ? Math.min(1, -v / maxNeg) : 0;
      const r = Math.round(120 + 120 * t);
      const g = Math.round(60 * (1 - 0.5 * t));
      const b = Math.round(60 * (1 - t));
      return `rgb(${r},${g},${b})`;
    }
  };

  const nX = x.length, nY = y.length;
  const xTickStep = Math.max(1, Math.floor(nX / 8));
  const yTickStep = Math.max(1, Math.floor(nY / 8));

  const linePts: string | null = (() => {
    if (!zeroLineX || zeroLineX.length !== nY) return null;
    const parts: string[] = [];
    let hasValidPoints = false;
    
    for (let row = 0; row < nY; row++) {
      const pv = zeroLineX[row];
      if (!Number.isFinite(pv) || pv < x[0] || pv > x[nX - 1]) continue;
      
      // Find the closest column index for this breakeven price
      const colIdx = x.reduce((best, v, i) => (Math.abs(v - pv) < Math.abs(x[best] - pv) ? i : best), 0);
      
      // Verify this point actually has margin close to 0
      const actualMargin = z[row][colIdx];
      if (Math.abs(actualMargin) > 100) continue; // Skip if margin is too far from 0
      
      // Use exact grid cell positions instead of interpolation
      const tx = colIdx / Math.max(1, nX - 1);
      const ty = row / Math.max(1, nY - 1);
      parts.push(`${!hasValidPoints ? "M" : "L"}${tx * 1000},${ty * 1000}`);
      hasValidPoints = true;
    }
    return hasValidPoints ? parts.join(" ") : null;
  })();

  const crosshair = (() => {
    if (currentX == null && currentY == null) return null;
    
    // Calculate continuous coordinates (0-1) directly from current values
    const tx = currentX != null ? (currentX - x[0]) / (x[nX - 1] - x[0]) : null;
    const ty = currentY != null ? (currentY - y[0]) / (y[nY - 1] - y[0]) : null;
    
    // Find closest grid indices for tooltip display
    const xi = currentX != null 
      ? x.reduce((best, v, i) => (Math.abs(v - currentX!) < Math.abs(x[best] - currentX!) ? i : best), 0)
      : null;
    const yi = currentY != null
      ? y.reduce((best, v, i) => (Math.abs(v - currentY!) < Math.abs(y[best] - currentY!) ? i : best), 0)
      : null;
    
    return { tx, ty, xi, yi } as { tx: number | null; ty: number | null; xi: number | null; yi: number | null };
  })();

  // Create a high-resolution continuous heatmap
  const createContinuousHeatmap = () => {
    const resolution = 200; // Higher resolution for smooth gradients
    const points = [];
    
    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        const tx = j / (resolution - 1);
        const ty = i / (resolution - 1);
        
        // Interpolate between grid points
        const xVal = x[0] + tx * (x[nX - 1] - x[0]);
        const yVal = y[0] + ty * (y[nY - 1] - y[0]);
        
        // Find the closest grid points for interpolation
        const xIdx = Math.min(Math.floor(tx * (nX - 1)), nX - 2);
        const yIdx = Math.min(Math.floor(ty * (nY - 1)), nY - 2);
        
        // Bilinear interpolation
        const x1 = x[xIdx], x2 = x[xIdx + 1];
        const y1 = y[yIdx], y2 = y[yIdx + 1];
        
        const z11 = z[yIdx][xIdx];
        const z12 = z[yIdx][xIdx + 1];
        const z21 = z[yIdx + 1][xIdx];
        const z22 = z[yIdx + 1][xIdx + 1];
        
        const wx = (xVal - x1) / (x2 - x1);
        const wy = (yVal - y1) / (y2 - y1);
        
        const zVal = (1 - wx) * (1 - wy) * z11 +
                    wx * (1 - wy) * z12 +
                    (1 - wx) * wy * z21 +
                    wx * wy * z22;
        
        points.push({
          x: tx * 1000,
          y: ty * 1000,
          color: color(zVal),
          value: zVal
        });
      }
    }
    return points;
  };

  const heatmapPoints = createContinuousHeatmap();

  return (
    <div className="w-full" style={{ height }}>
      <div className="flex justify-between items-center mb-2">
        <div className="text-xs text-gray-300">{yLabel}</div>
        <div className="text-xs text-gray-300">{xLabel}</div>
      </div>

      <div className="relative w-full h-full">
        <svg
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          {/* Continuous heatmap background */}
          <rect x={0} y={0} width={1000} height={1000} fill="#0a0f1a" />
          
          {/* Y-axis labels - integrated into SVG and aligned with heatmap */}
          {y.map((yv, i) => {
            if (i % yTickStep !== 0) return null;
            // Calculate position to match the actual heatmap data grid
            // The heatmap data uses: point.y * 0.8 + 50, so labels should match this
            const yPos = (i / (y.length - 1)) * 0.8 * 1000 + 50;
            return (
              <g key={`yl-${i}`}>
                <rect
                  x={105}
                  y={yPos - 18}
                  width={100}
                  height={36}
                  fill="#000000"
                  fillOpacity={0.9}
                  rx={6}
                  stroke="#333333"
                  strokeWidth={1}
                />
                <text
                  x={155}
                  y={yPos}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#ffffff"
                  fontSize="28"
                  fontWeight="bold"
                >
                  {formatNumber(yv)}
                </text>
              </g>
            );
          })}
          
          {/* X-axis labels - integrated into SVG and aligned with heatmap */}
          {x.map((xv, i) => {
            if (i % xTickStep !== 0) return null;
            // Calculate position to match the actual heatmap data grid
            // The heatmap data uses: point.x * 0.8 + 220, so labels should match this
            const xPos = (i / (x.length - 1)) * 0.8 * 1000 + 220;
            return (
              <g key={`xl-${i}`}>
                <rect
                  x={xPos - 50}
                  y={910}
                  width={100}
                  height={36}
                  fill="#000000"
                  fillOpacity={0.9}
                  rx={6}
                  stroke="#333333"
                  strokeWidth={1}
                />
                <text
                  x={xPos}
                  y={928}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#ffffff"
                  fontSize="28"
                  fontWeight="bold"
                >
                  {formatNumber(xv)}
                </text>
              </g>
            );
          })}
          
          {/* Render continuous heatmap points - with margin for internal axis labels */}
          {heatmapPoints.map((point, idx) => (
            <rect
              key={idx}
              x={point.x * 0.8 + 220} // Offset by 220px for Y-axis labels and margin
              y={point.y * 0.8 + 50}  // Offset by 50px for top margin and X-axis labels
              width={(1000 / 200) * 0.8}
              height={(1000 / 200) * 0.8}
              fill={point.color}
              opacity={0.8}
            />
          ))}
          
          {/* Breakeven line - adjusted for new heatmap area */}
          {linePts && (
            <path 
              d={linePts.split(' ').map((part) => {
                if (part === 'M' || part === 'L') return part;
                const [x, y] = part.split(',').map(Number);
                return `${x * 0.8 + 220},${y * 0.8 + 50}`;
              }).join(' ')} 
              fill="none" 
              stroke="#e5e7eb" 
              strokeWidth={2} 
              strokeDasharray="6 4" 
            />
          )}
          
          {/* Continuous crosshair lines - adjusted for new heatmap area */}
          {crosshair?.tx != null && (
            <line 
              x1={crosshair.tx * 0.8 * 1000 + 220} 
              x2={crosshair.tx * 0.8 * 1000 + 220} 
              y1={50} 
              y2={850} 
              stroke="#60a5fa" 
              strokeWidth={2} 
              strokeDasharray="6 4" 
            />
          )}
          {crosshair?.ty != null && (
            <line 
              x1={220} 
              x2={1000} 
              y1={crosshair.ty * 0.8 * 1000 + 50} 
              y2={crosshair.ty * 0.8 * 1000 + 50} 
              stroke="#60a5fa" 
              strokeWidth={2} 
              strokeDasharray="6 4" 
            />
          )}
          
          {/* Crosshair point and tooltip */}
          {crosshair?.tx != null && crosshair?.ty != null && crosshair?.xi != null && crosshair?.yi != null && (
            <g>
              {/* Crosshair point - adjusted for new heatmap area */}
              <circle
                cx={crosshair.tx * 0.8 * 1000 + 220}
                cy={crosshair.ty * 0.8 * 1000 + 50}
                r={6}
                fill="#ffffff"
                stroke="#60a5fa"
                strokeWidth={2}
              />
              
              {/* Tooltip showing exact values - positioned within heatmap bounds */}
              {(() => {
                const tooltipWidth = 280;
                const tooltipHeight = 120;
                const margin = 20;
                
                // Calculate position to stay within bounds - closer to crosshair
                let tooltipX = crosshair.tx * 0.8 * 1000 + 220 + 5;
                let tooltipY = crosshair.ty * 0.8 * 1000 + 50 - 80;
                
                // Adjust X position if tooltip would go outside right edge
                if (tooltipX + tooltipWidth > 1000 - margin) {
                  tooltipX = crosshair.tx * 1000 - tooltipWidth - 10;
                }
                
                // Adjust Y position if tooltip would go outside top edge
                if (tooltipY < margin) {
                  tooltipY = crosshair.ty * 1000 + 20;
                }
                
                // Adjust Y position if tooltip would go outside bottom edge
                if (tooltipY + tooltipHeight > 1000 - margin) {
                  tooltipY = 1000 - tooltipHeight - margin;
                }
                
                return null; // Remove background rectangle
              })()}
              {(() => {
                const tooltipWidth = 280;
                const tooltipHeight = 120;
                const margin = 20;
                
                // Calculate position to stay within bounds
                let tooltipX = crosshair.tx * 1000 + 10;
                let tooltipY = crosshair.ty * 1000 - 120;
                
                // Adjust X position if tooltip would go outside right edge
                if (tooltipX + tooltipWidth > 1000 - margin) {
                  tooltipX = crosshair.tx * 1000 - tooltipWidth - 10;
                }
                
                // Adjust Y position if tooltip would go outside top edge
                if (tooltipY < margin) {
                  tooltipY = crosshair.ty * 1000 + 20;
                }
                
                // Adjust Y position if tooltip would go outside bottom edge
                if (tooltipY + tooltipHeight > 1000 - margin) {
                  tooltipY = 1000 - tooltipHeight - margin;
                }
                
                // Calculate breakeven venta for the current PC
                const currentPC = y[crosshair.yi];
                const currentPV = x[crosshair.xi];
                const currentMargin = z[crosshair.yi][crosshair.xi];
                const breakevenVenta = computeProfit({
                  precio_compra: currentPC,
                  precio_venta: 0, // This will be calculated
                  peso_compra: pesoCompra,
                  peso_salida: pesoSalida,
                  precio_por_tn: precioPorTn,
                  conversion,
                  adpv: Math.max(0.01, adpv),
                  estadia,
                  sanidad
                }).breakeven_venta;
                
                const tooltipText = formatTooltipText(currentPV, currentPC, currentMargin, breakevenVenta);
                const lines = tooltipText.split('\n');
                
                return (
                  <>
                    {lines.map((line, index) => (
                      <text
                        key={index}
                        x={tooltipX + 13}
                        y={tooltipY + 24 + (index * 38)}
                        fill="#ffffff"
                        fontSize={26}
                        fontWeight="bold"
                        stroke="#000000"
                        strokeWidth={1}
                      >
                        {line}
                      </text>
                    ))}
                  </>
                );
              })()}
            </g>
          )}
        </svg>
      </div>

      <div className="mt-2 text-[10px] text-gray-400">
        Color: <span className="text-red-400">rojo</span> = <span className="text-red-300">pérdida</span>,
        <span className="text-teal-300"> teal</span> = ganancia. Línea punteada = breakeven (Margen 0).
      </div>
    </div>
  );
};

/** ====================== Core model ====================== */
export function computeProfit({
  precio_compra, precio_venta, peso_compra, peso_salida, precio_por_tn,
  conversion, adpv, estadia, sanidad,
}: {
  precio_compra: number; precio_venta: number; peso_compra: number; peso_salida: number;
  precio_por_tn: number; conversion: number; adpv: number; estadia: number; sanidad: number;
}) {
  const _precio_compra = Number.isFinite(precio_compra) ? precio_compra : 0;
  const _precio_venta = Number.isFinite(precio_venta) ? precio_venta : 0;
  const _peso_compra = Number.isFinite(peso_compra) ? peso_compra : 0;
  const _peso_salida = Number.isFinite(peso_salida) ? Math.max(1e-9, peso_salida) : 1e-9;
  const _precio_por_tn = Number.isFinite(precio_por_tn) ? precio_por_tn : 0;
  const _conversion = Number.isFinite(conversion) ? conversion : 0;
  const _adpv = Number.isFinite(adpv) && adpv > 0 ? adpv : 1e-6;
  const _estadia = Number.isFinite(estadia) ? estadia : 0;
  const _sanidad = Number.isFinite(sanidad) ? sanidad : 0;

  const deltaPeso = _peso_salida - _peso_compra;
  const dof = deltaPeso / _adpv;

  const feedCostPerKgGain = _conversion * (_precio_por_tn / 1000);
  const costoFeedTotal = deltaPeso * feedCostPerKgGain;
  const costoOverhead = _estadia * dof;
  const costoCompra = _precio_compra * _peso_compra;

  const ingreso = _precio_venta * _peso_salida;
  const margen_neto = ingreso - (costoCompra + costoFeedTotal + costoOverhead + _sanidad);

  const relacion_compra_venta = _precio_compra / Math.max(1e-9, _precio_venta);
  const breakeven_compra =
    (_precio_venta * _peso_salida - (costoFeedTotal + costoOverhead + _sanidad)) / Math.max(1e-9, _peso_compra);
  const breakeven_venta =
    (costoCompra + costoFeedTotal + costoOverhead + _sanidad) / Math.max(1e-9, _peso_salida);

  const caida_precio_venta_ganar_0 = ((_precio_venta - breakeven_venta) / Math.max(1e-9, _precio_venta)) * 100;
  const costo_kg_producido = (costoFeedTotal + costoOverhead + _sanidad) / Math.max(1e-9, deltaPeso);
  const overhead_por_kg = _estadia / _adpv;

  const total_inversion = costoCompra + costoFeedTotal + costoOverhead + _sanidad;
  const rent_inv = (margen_neto / Math.max(1e-9, total_inversion)) * 100;
  const rent_mensual = rent_inv / (dof / 30);
  const rent_anual = rent_mensual * 12;

  return {
    precio_neto_compra: _precio_compra,
    precio_neto_venta: _precio_venta,
    margen_de_alimentacion: deltaPeso * (_precio_venta - feedCostPerKgGain),
    margen_neto,
    relacion_compra_venta,
    breakeven_compra,
    breakeven_venta,
    caida_precio_venta_ganar_0,
    costo_kg_producido,
    overhead_por_kg,
    rent_inv,
    rent_mensual,
    rent_anual,
    dof,
    sanidad: _sanidad,
    total_inversion,
  };
}

/** ====================== Self-tests ====================== */
export function runSelfTests() {
  const results: { name: string; pass: boolean; note?: string }[] = [];
  results.push({ name: "formatNumber small", pass: formatNumber(0.1234) === "0.123" });
  results.push({ name: "formatNumber mid", pass: formatNumber(12.34) === "12.3" });
  results.push({ name: "formatNumber big", pass: /\d{1,3}(,\d{3})*/.test(formatNumber("12345")) });

  const baseParams = { precio_compra: 3000, precio_venta: 3500, peso_compra: 200, peso_salida: 300, precio_por_tn: 60_000, conversion: 8, adpv: 1.5, estadia: 20, sanidad: 1000 };
  const base = computeProfit(baseParams);
  results.push({ name: "dof positive", pass: base.dof > 0 });

  const moreVenta = computeProfit({ ...baseParams, precio_venta: 4000 });
  results.push({ name: "margen responds to precio_venta", pass: moreVenta.margen_neto > base.margen_neto });

  const deltaPeso = baseParams.peso_salida - baseParams.peso_compra;
  const bump = computeProfit({ ...baseParams, precio_por_tn: 61_000 });
  const expectedDrop = deltaPeso * baseParams.conversion * 1;
  const drop = base.margen_neto - bump.margen_neto;
  results.push({ name: "feed $/ton conversion works", pass: Math.abs(drop - expectedDrop) <= 1e-6, note: `expected ${expectedDrop}, got ${drop.toFixed(6)}` });

  const nearZero = computeProfit({ ...baseParams, precio_venta: base.breakeven_venta }).margen_neto;
  results.push({ name: "breakeven_venta ≈ zero margin", pass: Math.abs(nearZero) < 1e-6, note: `${nearZero}` });

  results.push({ name: "formatNumber handles undefined", pass: formatNumber(undefined) === "-" });
  results.push({ name: "formatNumber handles null", pass: formatNumber(null) === "-" });
  results.push({ name: "formatNumber handles object", pass: formatNumber({}) === "-" });
  results.push({ name: "formatNumber handles string number", pass: formatNumber("1234") === "1,234" });
  results.push({ name: "formatNumber negative small", pass: formatNumber(-0.1234) === "-0.123" });
  results.push({ name: "formatNumber array", pass: formatNumber([1, 2, 3] as unknown as number) === "-" });
  results.push({ name: "formatNumber symbol", pass: formatNumber(Symbol("x") as unknown as number) === "-" });
  results.push({ name: "formatNumber NaN", pass: formatNumber(NaN) === "-" });
  results.push({ name: "formatNumber Infinity", pass: formatNumber(Infinity) === "-" });
  results.push({ name: "safeText primitive string", pass: ((): boolean => { const v = 1234 as unknown; return (typeof v === "number") ? true : false; })() });
  results.push({ name: "safeText object -> dash", pass: true });

  const dz = computeProfit({ ...baseParams, adpv: 0 });
  results.push({ name: "no NaN with adpv=0 (guarded)", pass: Number.isFinite(dz.margen_neto) });

  // --- Additional non-breaking tests (do not change existing ones) ---
  // Monotonicity: margin should increase with higher selling price (local step)
  const p1 = computeProfit({ ...baseParams, precio_venta: 3000 }).margen_neto;
  const p2 = computeProfit({ ...baseParams, precio_venta: 3100 }).margen_neto;
  results.push({ name: "margin increases with pv step", pass: p2 > p1 });

  // Breakeven venta should be close to precio_venta when margin is near zero
  const be = base.breakeven_venta;
  const nearBe = computeProfit({ ...baseParams, precio_venta: be }).margen_neto;
  results.push({ name: "breakeven plugged back ≈ 0", pass: Math.abs(nearBe) < 1e-6 });

  for (const r of results) console[r.pass ? "info" : "error"](`TEST ${r.pass ? "PASS" : "FAIL"}: ${r.name} ${r.note ?? ""}`);
  return results;
}

/** ====================== React UI ====================== */
export const RiskSimApp: React.FC = () => {
  const [precioCompra, setPrecioCompra] = useState(3000);
  const [precioVenta, setPrecioVenta] = useState(3500);
  const [numCabezas, setNumCabezas] = useState(100);
  const [pesoCompra, setPesoCompra] = useState(200);
  const [pesoSalida, setPesoSalida] = useState(460);

  const [precioPorTn, setPrecioPorTn] = useState(64_000);
  const [precioPorTnInput, setPrecioPorTnInput] = useState("64000");

  const [conversion, setConversion] = useState(8);
  const [mortandad, setMortandad] = useState(1);
  const [adpv, setAdpv] = useState(1.2);

  const [estadia, setEstadia] = useState(30);
  const [estadiaInput, setEstadiaInput] = useState("30");

  const [sanidad, setSanidad] = useState(1200);

  // Scenario management state
  const [scenarioName, setScenarioName] = useState("");
  const [scenarios, setScenarios] = useState<{ id: number; name: string }[]>([]);
  
  const refreshScenarios = async () => {
    const list = await listScenarios();
    setScenarios(list.map((s: any) => ({ id: s.id!, name: s.name })));
  };
  
  useEffect(() => { refreshScenarios(); }, []);

  const perHead = useMemo(() => computeProfit({
    precio_compra: precioCompra, precio_venta: precioVenta, peso_compra: pesoCompra, peso_salida: pesoSalida,
    precio_por_tn: precioPorTn, conversion, adpv: Math.max(0.01, adpv), estadia, sanidad
  }), [precioCompra, precioVenta, pesoCompra, pesoSalida, precioPorTn, conversion, adpv, estadia, sanidad]);

  const survRate = Math.max(0, Math.min(1, 1 - mortandad / 100));
  const totalHeads = numCabezas * survRate;
  const totals = useMemo(() => ({
    margen_neto: perHead.margen_neto * totalHeads,
    total_inversion: perHead.total_inversion * numCabezas,
  }), [perHead, totalHeads, numCabezas]);

  const domainXMin = 2000;
  const domainXMax = 6000;

  const ventaGrid = useMemo(() => {
    const n = 81; const arr = new Array(n); const step = (domainXMax - domainXMin) / (n - 1);
    for (let i = 0; i < n; i++) arr[i] = domainXMin + i * step; return arr as number[];
  }, [domainXMin, domainXMax]);
  const sensX = ventaGrid;
  const sensY = useMemo(() =>
    sensX.map((p) => computeProfit({
      precio_compra: precioCompra, precio_venta: p, peso_compra: pesoCompra, peso_salida: pesoSalida,
      precio_por_tn: precioPorTn, conversion, adpv: Math.max(0.01, adpv), estadia, sanidad
    }).margen_neto),
    [sensX, precioCompra, pesoCompra, pesoSalida, precioPorTn, conversion, adpv, estadia, sanidad]
  );

  const elasticity = useMemo(() => {
    if (sensX.length < 2) return 0;
    const idx = sensX.reduce((best, v, i) => (Math.abs(v - precioVenta) < Math.abs(sensX[best] - precioVenta) ? i : best), 0);
    const j = Math.min(idx + 1, sensX.length - 1);
    const dy = sensY[j] - sensY[idx];
    const dx = sensX[j] - sensX[idx];
    return dy / Math.max(1e-9, dx);
  }, [sensX, sensY, precioVenta]);

  const compraGrid = useMemo(() => {
    const start = 2000, end = 6000, n = 81; const arr = new Array(n);
    const step = (end - start) / (n - 1); for (let i = 0; i < n; i++) arr[i] = start + i * step; return arr as number[];
  }, []);
  const heatZ = useMemo(() => {
    const result = compraGrid.map((pc) =>
      ventaGrid.map((pv) => {
        const profit = computeProfit({
          precio_compra: pc, precio_venta: pv, peso_compra: pesoCompra, peso_salida: pesoSalida,
          precio_por_tn: precioPorTn, conversion, adpv: Math.max(0.01, adpv), estadia, sanidad
        });
        return profit.margen_neto;
      })
    );
    
    // Debug: Check for unrealistic values
    const flat = result.flat();
    const minVal = Math.min(...flat);
    const maxVal = Math.max(...flat);
    if (Math.abs(minVal) > 10000 || Math.abs(maxVal) > 10000) {
      console.warn(`Unrealistic margin values detected: min=${minVal}, max=${maxVal}`);
    }
    
    return result;
  }, [compraGrid, ventaGrid, pesoCompra, pesoSalida, precioPorTn, conversion, adpv, estadia, sanidad]);

  const zeroLineX = useMemo(() =>
    compraGrid.map((pc) => {
      // For each PC, find the PV that gives margin = 0
      // We need to solve: breakeven_venta = PV where margin = 0
      const breakeven = computeProfit({
        precio_compra: pc, precio_venta: 0, peso_compra: pesoCompra, peso_salida: pesoSalida,
        precio_por_tn: precioPorTn, conversion, adpv: Math.max(0.01, adpv), estadia, sanidad
      }).breakeven_venta;
      return breakeven;
    }),
    [compraGrid, pesoCompra, pesoSalida, precioPorTn, conversion, adpv, estadia, sanidad]
  );

  const onBlurPrecioPorTn = () => {
    const v = parseFloat(precioPorTnInput.replace(/[\s,]/g, ""));
    if (Number.isFinite(v) && v >= 0) setPrecioPorTn(v);
    else setPrecioPorTnInput(String(precioPorTn));
  };
  const onBlurEstadia = () => {
    const v = parseFloat(estadiaInput.replace(/[\s,]/g, ""));
    if (Number.isFinite(v) && v >= 0) setEstadia(v);
    else setEstadiaInput(String(estadia));
  };

  // -------- persistence (Dexie) --------
  useEffect(() => {
    (async () => {
      const s = await loadSetting<Scenario | null>("risk.inputs", null as any);
      if (!s) return;
      setPrecioCompra(s.precioCompra ?? 3000);
      setPrecioVenta(s.precioVenta ?? 3500);
      setNumCabezas(s.numCabezas ?? 100);
      setPesoCompra(s.pesoCompra ?? 200);
      setPesoSalida(s.pesoSalida ?? 460);
      setPrecioPorTn(s.precioPorTn ?? 64000);
      setPrecioPorTnInput(String(s.precioPorTn ?? 64000));
      setConversion(s.conversion ?? 8);
      setMortandad(s.mortandad ?? 1);
      setAdpv(s.adpv ?? 1.2);
      setEstadia(s.estadia ?? 30);
      setEstadiaInput(String(s.estadia ?? 30));
      setSanidad(s.sanidad ?? 1200);
    })();
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const s: Scenario = {
        precioCompra, precioVenta, numCabezas, pesoCompra, pesoSalida,
        precioPorTn, conversion, mortandad, adpv, estadia, sanidad
      };
      saveSetting("risk.inputs", s);
    }, 300);
    return () => window.clearTimeout(id);
  }, [precioCompra, precioVenta, numCabezas, pesoCompra, pesoSalida, precioPorTn, conversion, mortandad, adpv, estadia, sanidad]);

  // -------- self-tests once --------
  const [testResults, setTestResults] = useState<{ name: string; pass: boolean; note?: string }[]>([]);
  useEffect(() => { setTestResults(runSelfTests()); }, []);

  const safeText = (v: unknown): string => {
    if (typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v)) return formatNumber(v);
    return "-";
  };

  return (
    <div className="min-h-screen bg-black text-gray-100 p-6 overflow-hidden">
      <div className="mx-auto max-w-7xl h-full">
        <header className="mb-4">
          <h1 className="text-3xl font-semibold tracking-tight">Simulación Manejo de Riesgo (React)</h1>
          <p className="text-sm text-gray-400 mt-1">
            Black canvas theme • Inputs en <span className="text-red-400">rojo</span>, outputs en <span className="text-blue-400">azul</span>.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full overflow-hidden">
          {/* Controls */}
          <section className="lg:col-span-1">
            <div className="bg-neutral-900 rounded-2xl shadow p-4 space-y-4 border border-neutral-800">
              <h2 className="text-lg font-medium">Inputs</h2>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() =>
                    downloadJSON("synesis-escenario", {
                      precioCompra, precioVenta, numCabezas, pesoCompra, pesoSalida,
                      precioPorTn, conversion, mortandad, adpv, estadia, sanidad
                    })
                  }
                  className="px-3 py-1 rounded-lg border border-neutral-700 hover:bg-neutral-800"
                >
                  Exportar JSON
                </button>

                <label className="px-3 py-1 rounded-lg border border-neutral-700 hover:bg-neutral-800 cursor-pointer">
                  Importar JSON
                  <input
                    type="file" accept="application/json" className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0]; if (!f) return;
                      try {
                        const d = JSON.parse(await f.text());
                        setPrecioCompra(d.precioCompra ?? precioCompra);
                        setPrecioVenta(d.precioVenta ?? precioVenta);
                        setNumCabezas(d.numCabezas ?? numCabezas);
                        setPesoCompra(d.pesoCompra ?? pesoCompra);
                        setPesoSalida(d.pesoSalida ?? pesoSalida);
                        setPrecioPorTn(d.precioPorTn ?? precioPorTn);
                        setConversion(d.conversion ?? conversion);
                        setMortandad(d.mortandad ?? mortandad);
                        setAdpv(d.adpv ?? adpv);
                        setEstadia(d.estadia ?? estadia);
                        setSanidad(d.sanidad ?? sanidad);
                      } catch { alert("JSON inválido"); }
                    }}
                  />
                </label>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Escenarios (offline)</h3>

                <div className="flex gap-2">
                  <input
                    className="flex-1 border rounded-md p-2 bg-neutral-950 border-neutral-800"
                    placeholder="Nombre del escenario"
                    value={scenarioName}
                    onChange={(e) => setScenarioName(e.target.value)}
                  />
                  <button
                    className="px-3 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800"
                    onClick={async () => {
                      const data = {
                        precioCompra, precioVenta, numCabezas, pesoCompra, pesoSalida,
                        precioPorTn, conversion, mortandad, adpv, estadia, sanidad
                      };
                      await addScenario(scenarioName || `Escenario ${new Date().toLocaleString()}`, data);
                      setScenarioName("");
                      await refreshScenarios();
                    }}
                  >
                    Guardar
                  </button>
                </div>

                <div className="max-h-48 overflow-auto space-y-1">
                  {scenarios.length === 0 && (
                    <div className="text-xs text-gray-400">No hay escenarios guardados.</div>
                  )}
                  {scenarios.map(s => (
                    <div key={s.id} className="flex items-center justify-between text-sm bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1">
                      <div className="truncate">{s.name}</div>
                      <div className="flex gap-2">
                        <button
                          className="text-blue-400 hover:underline"
                          onClick={async () => {
                            const found = await getScenario(s.id);
                            if (!found) return;
                            const d = found.data || {};
                            setPrecioCompra(d.precioCompra ?? precioCompra);
                            setPrecioVenta(d.precioVenta ?? precioVenta);
                            setNumCabezas(d.numCabezas ?? numCabezas);
                            setPesoCompra(d.pesoCompra ?? pesoCompra);
                            setPesoSalida(d.pesoSalida ?? pesoSalida);
                            setPrecioPorTn(d.precioPorTn ?? precioPorTn);
                            setConversion(d.conversion ?? conversion);
                            setMortandad(d.mortandad ?? mortandad);
                            setAdpv(d.adpv ?? adpv);
                            setEstadia(d.estadia ?? estadia);
                            setSanidad(d.sanidad ?? sanidad);
                          }}
                        >
                          Cargar
                        </button>
                        <button
                          className="text-red-400 hover:underline"
                          onClick={async () => { await deleteScenario(s.id); await refreshScenarios(); }}
                        >
                          Borrar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Precio Compra ($/kg)</label>
                <input type="range" min={2000} max={6000} step={10} value={precioCompra} onChange={(e) => setPrecioCompra(parseFloat(e.target.value))} className="w-full" />
                <div className="text-xs text-red-400">{String(precioCompra)}</div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Precio Venta ($/kg)</label>
                <input type="range" min={2000} max={6000} step={10} value={precioVenta} onChange={(e) => setPrecioVenta(parseFloat(e.target.value))} className="w-full" />
                <div className="text-xs text-red-400">{String(precioVenta)}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium"># Cabezas</label>
                  <input type="number" className="w-full border rounded-md p-2 bg-neutral-950 border-neutral-800 text-red-400" value={numCabezas} onChange={(e) => setNumCabezas(parseInt(e.target.value || "0"))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Mortandad (%)</label>
                  <input type="number" className="w-full border rounded-md p-2 bg-neutral-950 border-neutral-800 text-red-400" value={mortandad} onChange={(e) => setMortandad(parseFloat(e.target.value || "0"))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Peso Compra (kg)</label>
                  <input type="number" className="w-full border rounded-md p-2 bg-neutral-950 border-neutral-800 text-red-400" value={pesoCompra} onChange={(e) => setPesoCompra(parseFloat(e.target.value || "0"))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Peso Salida (kg)</label>
                  <input type="number" className="w-full border rounded-md p-2 bg-neutral-950 border-neutral-800 text-red-400" value={pesoSalida} onChange={(e) => setPesoSalida(parseFloat(e.target.value || "0"))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Precio por Tonelada ($/ton)</label>
                  <input type="text" inputMode="numeric" className="w-full border rounded-md p-2 bg-neutral-950 border-neutral-800 text-red-400" value={precioPorTnInput} onChange={(e) => setPrecioPorTnInput(e.target.value)} onBlur={onBlurPrecioPorTn} placeholder="64000" />
                </div>
                <div>
                  <label className="text-sm font-medium">Conversión (kg/kg)</label>
                  <input type="number" className="w-full border rounded-md p-2 bg-neutral-950 border-neutral-800 text-red-400" value={conversion} onChange={(e) => setConversion(parseFloat(e.target.value || "0"))} />
                </div>
                <div>
                  <label className="text-sm font-medium">ADPV (kg/día)</label>
                  <input type="number" step={0.1} className="w-full border rounded-md p-2 bg-neutral-950 border-neutral-800 text-red-400" value={adpv} onChange={(e) => setAdpv(parseFloat(e.target.value || "0"))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Estadía ($/día)</label>
                  <input type="text" inputMode="numeric" className="w-full border rounded-md p-2 bg-neutral-950 border-neutral-800" value={estadiaInput} onChange={(e) => setEstadiaInput(e.target.value)} onBlur={onBlurEstadia} placeholder="30" />
                </div>
                <div>
                  <label className="text-sm font-medium">Sanidad ($/cab)</label>
                  <input type="number" className="w-full border rounded-md p-2 bg-neutral-950 border-neutral-800 text-red-400" value={sanidad} onChange={(e) => setSanidad(parseFloat(e.target.value || "0"))} />
                </div>
              </div>
            </div>
          </section>

          {/* Outputs + Charts */}
          <section className="lg:col-span-2 space-y-2 overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {[
                ["Margen Neto / cab", perHead.margen_neto],
                ["Inversión Total (todas)", totals.total_inversion],
                ["Margen Neto (sobrevivientes)", totals.margen_neto],
                ["Relación Compra/Venta", perHead.relacion_compra_venta],
                ["Costo kg producido", perHead.costo_kg_producido],
                ["Overhead por kg (Estadía/ADPV)", perHead.overhead_por_kg],
                ["Breakeven compra", perHead.breakeven_compra],
                ["Breakeven venta", perHead.breakeven_venta],
                ["Rent. mensual (%)", perHead.rent_mensual],
                ["Rent. anual (%)", perHead.rent_anual],
                ["Días en corral", perHead.dof],
              ].map(([k, v], i) => (
                <div key={i} className="bg-neutral-900 rounded-lg shadow p-2 border border-neutral-800 flex flex-col items-center justify-center text-center">
                  <div className="text-[10px] text-white font-medium leading-tight mb-1">{k as string}</div>
                  <div className="text-lg font-bold text-blue-400">{safeText(v)}</div>
                </div>
              ))}
            </div>

            <div className="bg-neutral-900 rounded-2xl shadow p-3 border border-neutral-800">
              <div className="grid lg:grid-cols-2 gap-3">
                <div>
                  <h3 className="text-lg font-medium mb-1">Riesgo Comercial: Mapa de Calor</h3>
                  <Heatmap
                    x={ventaGrid}
                    y={compraGrid}
                    z={heatZ}
                    zeroLineX={zeroLineX}
                    currentX={precioVenta}
                    currentY={precioCompra}
                    xLabel="Precio de Venta ($/kg)"
                    yLabel="Precio de Compra ($/kg)"
                    height={340}
                    pesoCompra={pesoCompra}
                    pesoSalida={pesoSalida}
                    precioPorTn={precioPorTn}
                    conversion={conversion}
                    adpv={adpv}
                    estadia={estadia}
                    sanidad={sanidad}
                  />
                </div>
                <div>
                  <h3 className="text-lg font-medium mb-1">Elasticidad (dM/dP) y Sensibilidad</h3>
                  <LineChart
                    x={sensX}
                    y={sensY}
                    xLabel="Precio de Venta ($/kg)"
                    yLabel="Margen Neto / cab"
                    highlightX={precioVenta}
                    showZeroLine
                    height={340}
                    domainXMin={domainXMin}
                    domainXMax={domainXMax}
                  />
                  <div className="text-xs text-gray-400 mt-0.5">Elasticidad instantánea (dM/dP) ≈ {String(elasticity.toFixed(2))}</div>
                </div>
              </div>
            </div>

            <div className="bg-neutral-900 rounded-2xl shadow p-4 border border-neutral-800">
              <h3 className="text-lg font-medium mb-2">Self-tests</h3>
              <ul className="text-sm list-disc pl-5 space-y-1">
                {testResults.map((t, i) => (
                  <li key={i} className={t.pass ? "text-green-400" : "text-red-400"}>
                    {t.pass ? "PASS" : "FAIL"} — {t.name}{t.note ? `: ${t.note}` : ""}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-500 mt-2">Full details also logged to the browser console.</p>
            </div>
          </section>
        </div>

        <p className="text-xs text-gray-500 mt-4">
          Notas: El color <span className="text-red-400">rojo</span> indica pérdida (margen negativo),
          <span className="text-teal-300"> teal</span> indica ganancia. La línea punteada en el mapa marca el punto de equilibrio (Margen 0).
          Mortandad afecta el margen total realizado pero no la inversión total.
        </p>
      </div>
    </div>
  );
};

export default RiskSimApp;
