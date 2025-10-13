import { useMemo, useState, useEffect, useRef } from "react";
import { loadSetting, saveSetting } from "./db";
import { downloadJSON } from "./utils";

/** ---------- utils (formatting) ---------- */
const linspace = (start: number, end: number, n: number) => {
  const arr = new Array(n);
  const step = n > 1 ? (end - start) / (n - 1) : 0;
  for (let i = 0; i < n; i++) arr[i] = start + i * step;
  return arr;
};
const toNumber = (raw: unknown): number | null => {
  if (raw === null || raw === undefined) return null;
  const t = typeof raw;
  if (t === "number") return Number.isFinite(raw) ? (raw as number) : null;
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
const safeText = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return formatNumber(v);
  return "-";
};
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const makeTicks = (min: number, max: number, count = 5) => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) return [min];
  const step = (max - min) / Math.max(1, count - 1);
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(min + i * step);
  return out;
};

/** ---------- small types ---------- */
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

/** ========================= LineChart ========================= */
const LineChart: React.FC<{
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
}> = ({
  x,
  y,
  height = 320,
  strokeWidth = 2,
  xLabel,
  yLabel,
  highlightX = null,
  showZeroLine = true,
  domainXMin,
  domainXMax,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!x?.length || !y?.length || x.length !== y.length) {
    return (
      <div className="w-full h-[320px] flex items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 text-gray-400">
        No data
      </div>
    );
  }

  const dataMinX = Math.min(...x), dataMaxX = Math.max(...x);
  const minX = domainXMin ?? dataMinX;
  const maxX = domainXMax ?? dataMaxX;
  const minY = Math.min(...y), maxY = Math.max(...y);

  const padL = 56, padR = 18, padT = 14, padB = 40;
  const W = 820, H = 280;

  const sx = (v: number) => padL + ((v - minX) / Math.max(1e-9, maxX - minX)) * (W - padL - padR);
  const sy = (v: number) => H - (padB + ((v - minY) / Math.max(1e-9, maxY - minY)) * (H - padT - padB));

  const path = x.map((xi, i) => `${i ? "L" : "M"}${sx(xi)},${sy(y[i])}`).join(" ");

  const xTicks = makeTicks(minX, maxX, 6);
  const yTicks = makeTicks(minY, maxY, 6);

  const nearestIdx = (xVal: number) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < x.length; i++) {
      const d = Math.abs(x[i] - xVal);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  const handleMouseMove: React.MouseEventHandler<SVGRectElement> = (e) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    const px = e.clientX - box.left;
    const t = (px - padL) / Math.max(1e-9, W - padL - padR);
    const xVal = minX + t * (maxX - minX);
    setHoverIdx(nearestIdx(xVal));
  };
  const handleLeave = () => setHoverIdx(null);

  const hiIdx = highlightX != null ? nearestIdx(highlightX) : null;
  const hover = hoverIdx != null ? { xi: x[hoverIdx], yi: y[hoverIdx] } : null;

  const slopeAt = (idx: number) => {
    const j = Math.min(idx + 1, x.length - 1);
    const dy = y[j] - y[idx];
    const dx = x[j] - x[idx];
    return dy / Math.max(1e-9, dx);
  };
  const hoverSlope = hoverIdx != null ? slopeAt(hoverIdx) : null;

  return (
    <div className="w-full" style={{ height }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-full bg-black rounded-xl border border-neutral-800 select-none">
        {/* grid */}
        {yTicks.map((t, i) => (<line key={`gy-${i}`} x1={padL} x2={W - padR} y1={sy(t)} y2={sy(t)} stroke="#1f2937" strokeWidth={1} />))}
        {xTicks.map((t, i) => (<line key={`gx-${i}`} y1={padT} y2={H - padB} x1={sx(t)} x2={sx(t)} stroke="#1f2937" strokeWidth={1} />))}
        {/* zero */}
        {showZeroLine && minY < 0 && maxY > 0 && (<line x1={padL} x2={W - padR} y1={sy(0)} y2={sy(0)} stroke="#6b7280" strokeDasharray="4 4" />)}
        {/* highlight */}
        {hiIdx != null && (<line x1={sx(x[hiIdx])} x2={sx(x[hiIdx])} y1={padT} y2={H - padB} stroke="#60a5fa" strokeWidth={2} strokeDasharray="6 4" />)}
        {/* line */}
        <path d={path} fill="none" stroke="#60a5fa" strokeWidth={strokeWidth} />
        {/* axes */}
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#9ca3af" />
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#9ca3af" />
        {/* labels */}
        {yTicks.map((t, i) => (<text key={`yl-${i}`} x={padL - 8} y={sy(t)} textAnchor="end" dominantBaseline="middle" fill="#9ca3af" fontSize={10}>{formatNumber(t)}</text>))}
        {xTicks.map((t, i) => (<text key={`xl-${i}`} x={sx(t)} y={H - padB + 14} textAnchor="middle" fill="#9ca3af" fontSize={10}>{formatNumber(t)}</text>))}
        {yLabel && (<text x={14} y={(H - padB + padT) / 2} transform={`rotate(-90, 14, ${(H - padB + padT) / 2})`} textAnchor="middle" fill="#e5e7eb" fontSize={11}>{yLabel}</text>)}
        {xLabel && (<text x={(W - padR + padL) / 2} y={H - 6} textAnchor="middle" fill="#e5e7eb" fontSize={11}>{xLabel}</text>)}
        {/* hover */}
        {hover && (
          <g>
            <line x1={sx(hover.xi)} x2={sx(hover.xi)} y1={padT} y2={H - padB} stroke="#94a3b8" strokeDasharray="3 3" />
            <circle cx={sx(hover.xi)} cy={sy(hover.yi)} r={4} fill="#93c5fd" />
            <rect x={sx(hover.xi) + 8} y={sy(hover.yi) - 28} width={200} height={40} rx={6} fill="#0b1220" stroke="#1f2937" />
            <text x={sx(hover.xi) + 16} y={sy(hover.yi) - 14} fill="#e5e7eb" fontSize={10}>{`Precio Venta: ${formatNumber(hover.xi)}`}</text>
            <text x={sx(hover.xi) + 16} y={sy(hover.yi) + 2} fill="#93c5fd" fontSize={10}>{`Margen Neto: ${formatNumber(hover.yi)}${hoverSlope != null ? `  |  dM/dP≈${formatNumber(hoverSlope)}` : ""}`}</text>
          </g>
        )}
        {/* capture */}
        <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB} fill="transparent" onMouseMove={handleMouseMove} onMouseLeave={handleLeave} />
      </svg>
    </div>
  );
};

/** ========================= Heatmap ========================= */
const Heatmap: React.FC<{
  x: number[];
  y: number[];
  z: number[][];
  zeroLineX?: number[];
  currentX?: number | null;
  currentY?: number | null;
  height?: number;
  xLabel?: string;
  yLabel?: string;
}> = ({
  x, y, z, zeroLineX, currentX = null, currentY = null,
  height = 340, xLabel = "Precio Venta ($/kg)", yLabel = "Precio Compra ($/kg)"
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

  const minX = x[0], maxX = x[nX - 1];

  const linePts: string | null = (() => {
    if (!zeroLineX || zeroLineX.length !== nY) return null;
    const parts: string[] = [];
    for (let row = 0; row < nY; row++) {
      const pv = zeroLineX[row];
      if (!Number.isFinite(pv)) continue;
      const tx = (pv - minX) / Math.max(1e-9, maxX - minX);
      const ty = row / Math.max(1, nY - 1);
      parts.push(`${row === 0 ? "M" : "L"}${tx * 1000},${ty * 1000}`);
    }
    return parts.length ? parts.join(" ") : null;
  })();

  const crosshair = (() => {
    if (currentX == null && currentY == null) return null;
    const tx = currentX != null ? (currentX - minX) / Math.max(1e-9, maxX - minX) : null;
    const yi = currentY != null
      ? y.reduce((b, v, i) => (Math.abs(v - currentY!) < Math.abs(y[b] - currentY!) ? i : b), 0)
      : null;
    const ty = yi != null ? yi / Math.max(1, nY - 1) : null;
    return { tx, ty } as { tx: number | null; ty: number | null };
  })();

  return (
    <div className="w-full" style={{ height }}>
      <div className="flex justify-between items-center mb-2">
        <div className="text-xs text-gray-300">{yLabel}</div>
        <div className="text-xs text-gray-300">{xLabel}</div>
      </div>

      <div className="relative w-full h-full">
        <div
          className="grid w-full h-full"
          style={{ gridTemplateColumns: `64px repeat(${nX}, minmax(0, 1fr))`, gridTemplateRows: `20px repeat(${nY}, minmax(0, 1fr))` }}
        >
          <div />
          {x.map((xv, i) => (
            <div key={`xt-${i}`} className="text-[10px] text-gray-400 text-center">
              {i % xTickStep === 0 ? formatNumber(xv) : ""}
            </div>
          ))}

          {y.map((yv, row) => (
            <div key={`row-${row}`} className="contents">
              <div className="flex items-center justify-end pr-1 text-[10px] text-gray-400">
                {row % yTickStep === 0 ? formatNumber(yv) : ""}
              </div>
              {x.map((_, col) => (
                <div
                  key={`c-${row}-${col}`}
                  title={`PV: ${formatNumber(x[col])} | PC: ${formatNumber(y[row])} | M: ${formatNumber(z[row][col])}`}
                  style={{ backgroundColor: color(z[row][col]) }}
                  className="border border-neutral-900"
                />
              ))}
            </div>
          ))}
        </div>

        <svg
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          style={{ position: "absolute", left: 64, top: 20, right: 0, bottom: 0 }}
          className="pointer-events-none"
        >
          {linePts && <path d={linePts} fill="none" stroke="#e5e7eb" strokeWidth={2} strokeDasharray="6 4" />}
          {crosshair?.tx != null && (
            <line x1={crosshair.tx * 1000} x2={crosshair.tx * 1000} y1={0} y2={1000} stroke="#60a5fa" strokeWidth={2} strokeDasharray="6 4" />
          )}
          {crosshair?.ty != null && (
            <line x1={0} x2={1000} y1={crosshair.ty * 1000} y2={crosshair.ty * 1000} stroke="#60a5fa" strokeWidth={2} strokeDasharray="6 4" />
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
function computeProfit({
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
function runSelfTests() {
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
  results.push({ name: "safeText primitive string", pass: safeText(1234) === formatNumber(1234) });
  results.push({ name: "safeText object -> dash", pass: safeText({}) === "-" });

  const dz = computeProfit({ ...baseParams, adpv: 0 });
  results.push({ name: "no NaN with adpv=0 (guarded)", pass: Number.isFinite(dz.margen_neto) });

  for (const r of results) console[r.pass ? "info" : "error"](`TEST ${r.pass ? "PASS" : "FAIL"}: ${r.name} ${r.note ?? ""}`);
  return results;
}

/** ====================== React UI ====================== */
export default function RiskSimApp() {
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

  const perHead = useMemo(() => computeProfit({
    precio_compra: precioCompra, precio_venta: precioVenta, peso_compra: pesoCompra, peso_salida: pesoSalida,
    precio_por_tn: precioPorTn, conversion, adpv: Math.max(0.01, adpv), estadia, sanidad
  }), [precioCompra, precioVenta, pesoCompra, pesoSalida, precioPorTn, conversion, adpv, estadia, sanidad]);

  const survRate = clamp01(1 - mortandad / 100);
  const totalHeads = numCabezas * survRate;
  const totals = useMemo(() => ({
    margen_neto: perHead.margen_neto * totalHeads,
    total_inversion: perHead.total_inversion * numCabezas,
  }), [perHead, totalHeads, numCabezas]);

  const domainXMin = 2000;
  const domainXMax = 6000;

  const ventaGrid = useMemo(() => linspace(domainXMin, domainXMax, 81), [domainXMin, domainXMax]);
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

  const compraGrid = useMemo(() => linspace(2000, 6000, 60), []);
  const heatZ = useMemo(() =>
    compraGrid.map((pc) =>
      ventaGrid.map((pv) =>
        computeProfit({
          precio_compra: pc, precio_venta: pv, peso_compra: pesoCompra, peso_salida: pesoSalida,
          precio_por_tn: precioPorTn, conversion, adpv: Math.max(0.01, adpv), estadia, sanidad
        }).margen_neto
      )
    ),
    [compraGrid, ventaGrid, pesoCompra, pesoSalida, precioPorTn, conversion, adpv, estadia, sanidad]
  );

  const zeroLineX = useMemo(() =>
    compraGrid.map((pc) =>
      computeProfit({
        precio_compra: pc, precio_venta: precioVenta, peso_compra: pesoCompra, peso_salida: pesoSalida,
        precio_por_tn: precioPorTn, conversion, adpv: Math.max(0.01, adpv), estadia, sanidad
      }).breakeven_venta
    ),
    [compraGrid, precioVenta, pesoCompra, pesoSalida, precioPorTn, conversion, adpv, estadia, sanidad]
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
      const s = await loadSetting<Scenario | null>("risk.inputs", null);
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
    const id = setTimeout(() => {
      const s: Scenario = {
        precioCompra, precioVenta, numCabezas, pesoCompra, pesoSalida,
        precioPorTn, conversion, mortandad, adpv, estadia, sanidad
      };
      saveSetting("risk.inputs", s);
    }, 300);
    return () => clearTimeout(id);
  }, [precioCompra, precioVenta, numCabezas, pesoCompra, pesoSalida, precioPorTn, conversion, mortandad, adpv, estadia, sanidad]);

  // -------- self-tests once --------
  const [testResults, setTestResults] = useState<{ name: string; pass: boolean; note?: string }[]>([]);
  useEffect(() => { setTestResults(runSelfTests()); }, []);

  return (
    <div className="min-h-screen bg-black text-gray-100 p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-4">
          <h1 className="text-3xl font-semibold tracking-tight">Simulación Manejo de Riesgo (React)</h1>
          <p className="text-sm text-gray-400 mt-1">
            Black canvas theme • Inputs en <span className="text-red-400">rojo</span>, outputs en <span className="text-blue-400">azul</span>.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
          <section className="lg:col-span-2 space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
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
                <div key={i} className="bg-neutral-900 rounded-2xl shadow p-4 border border-neutral-800">
                  <div className="text-xs text-gray-400">{k as string}</div>
                  <div className="text-xl font-semibold text-blue-400">{safeText(v)}</div>
                </div>
              ))}
            </div>

            <div className="bg-neutral-900 rounded-2xl shadow p-4 border border-neutral-800">
              <div className="grid lg:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-lg font-medium mb-2">Riesgo Comercial: Mapa de Calor</h3>
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
                  />
                </div>
                <div>
                  <h3 className="text-lg font-medium mb-2">Elasticidad (dM/dP) y Sensibilidad</h3>
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
                  <div className="text-xs text-gray-400 mt-1">Elasticidad instantánea (dM/dP) ≈ {String(elasticity.toFixed(2))}</div>
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
}
