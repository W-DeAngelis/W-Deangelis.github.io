import { useEffect, useRef, useState, useCallback } from "react";

export default function RadarTrackViz() {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    W: 0, H: 0, scan: 0, auto: false, timer: null,
    truth: [], meas: []
  });
  const [scan, setScan] = useState(0);
  const [caption, setCaption] = useState(null);
  const [autoPlay, setAutoPlay] = useState(false);

  const MAX = 12;
  const DT = 4;

  function randn() {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function buildTrack(W, H) {
    const PAD = Math.round(Math.min(W, H) * 0.10);
    const useW = W - PAD * 2;
    const useH = H - PAD * 2;
    const arcDir = Math.random() < 0.5 ? 1 : -1;
    const arcAmp = 0.15 + Math.random() * 0.25;
    const arcPhase = Math.random() * 0.3;
    const yStartNorm = 0.25 + Math.random() * 0.50;
    const pts = [];
    for (let i = 0; i < MAX; i++) {
      const t = i / (MAX - 1);
      const nx = 0.04 + t * 0.92;
      const ny = yStartNorm + arcDir * arcAmp * Math.sin(Math.PI * t + arcPhase);
      pts.push({
        x: PAD + nx * useW,
        y: PAD + Math.max(0.05, Math.min(0.95, ny)) * useH,
      });
    }
    return pts;
  }

  function genMeas(truth, W, H) {
    const SIGMA = Math.min(W, H) * 0.032;
    return truth.map(p => ({
      x: p.x + randn() * SIGMA,
      y: p.y + randn() * SIGMA,
    }));
  }

  function kalmanTrack(mp, sigmaR) {
    if (mp.length < 2) return [{ x: mp[0].x, y: mp[0].y }];
    const Q = sigmaR * 0.18, R = sigmaR * sigmaR;
    const vx0 = mp[1].x - mp[0].x;
    const vy0 = mp[1].y - mp[0].y;
    let px = mp[0].x, vx = vx0, Pxx = R, Pvx = 0, Pxv = 0, Pvvx = R * 0.5;
    let py = mp[0].y, vy = vy0, Pyy = R, Pvy = 0, Pyv = 0, Pvvy = R * 0.5;
    const out = [{ x: px, y: py }];
    for (let i = 1; i < mp.length; i++) {
      const pxp = px + vx;
      const Pxxp = Pxx + Pxv + Pvx + Pvvx + Q;
      const Pxvp = Pxv + Pvvx;
      const Pvxp = Pvx + Pvvx;
      const Pvvxp = Pvvx + Q * 0.5;
      const Sx = Pxxp + R, Kx = Pxxp / Sx, Kvx = Pvxp / Sx;
      const ix = mp[i].x - pxp;
      px = pxp + Kx * ix; vx = vx + Kvx * ix;
      Pxx = (1 - Kx) * Pxxp; Pvx = Pvxp - Kvx * Pxxp;
      Pxv = Pxvp * (1 - Kx); Pvvx = Pvvxp - Kvx * Pxvp;

      const pyp = py + vy;
      const Pyyp = Pyy + Pyv + Pvy + Pvvy + Q;
      const Pyvp = Pyv + Pvvy;
      const Pvyp = Pvy + Pvvy;
      const Pvvyp = Pvvy + Q * 0.5;
      const Sy = Pyyp + R, Ky = Pyyp / Sy, Kvy = Pvyp / Sy;
      const iy = mp[i].y - pyp;
      py = pyp + Ky * iy; vy = vy + Kvy * iy;
      Pyy = (1 - Ky) * Pyyp; Pvy = Pvyp - Kvy * Pyyp;
      Pyv = Pyvp * (1 - Ky); Pvvy = Pvvyp - Kvy * Pyvp;

      out.push({ x: px, y: py });
    }
    return out;
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { W, H, scan, truth, meas } = stateRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0b0c0f';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 7; i++) {
      ctx.beginPath(); ctx.moveTo(W * i / 7, 0); ctx.lineTo(W * i / 7, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, H * i / 6); ctx.lineTo(W, H * i / 6); ctx.stroke();
    }

    if (scan === 0) {
      const fs = Math.max(13, Math.round(W * 0.018));
      ctx.font = `${fs}px 'JetBrains Mono', monospace`;
      ctx.fillStyle = 'rgba(255,255,255,0.11)';
      ctx.textAlign = 'center';
      ctx.fillText('Press "Next scan" to begin', W / 2, H / 2);
      ctx.textAlign = 'left';
      return;
    }

    const shown = scan - 1;
    const SIGMA = Math.min(W, H) * 0.032;
    const est = kalmanTrack(meas.slice(0, shown + 1), SIGMA);

    if (shown >= 1) {
      ctx.beginPath();
      ctx.moveTo(truth[0].x, truth[0].y);
      for (let i = 1; i <= shown; i++) ctx.lineTo(truth[i].x, truth[i].y);
      ctx.strokeStyle = 'rgba(74,222,154,0.15)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([7, 7]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (shown >= 1) {
      ctx.beginPath();
      ctx.moveTo(est[0].x, est[0].y);
      for (let i = 1; i <= shown; i++) ctx.lineTo(est[i].x, est[i].y);
      ctx.strokeStyle = 'rgba(96,168,248,0.22)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    for (let i = 0; i < shown; i++) {
      const age = shown - i;
      const a = Math.max(0.08, 0.5 - age * 0.08);
      [[truth[i], `rgba(74,222,154,${a})`],
       [meas[i],  `rgba(248,112,96,${a})`],
       [est[i],   `rgba(96,168,248,${a})`]].forEach(([pt, col]) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
      });
    }

    const tp = truth[shown], mp = meas[shown], ep = est[shown];

    ctx.beginPath();
    ctx.moveTo(tp.x, tp.y);
    ctx.lineTo(mp.x, mp.y);
    ctx.strokeStyle = 'rgba(248,112,96,0.75)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    const DR = Math.max(9, Math.round(W * 0.012));
    const RR = DR * 2.0;
    [[tp, '#4ade9a', 'rgba(74,222,154,0.15)'],
     [mp, '#f87060', 'rgba(248,112,96,0.15)'],
     [ep, '#60a8f8', 'rgba(96,168,248,0.15)']].forEach(([pt, fill, ring]) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, RR, 0, Math.PI * 2);
      ctx.strokeStyle = ring;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, DR, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
    });
  }, []);

  const initCanvas = useCallback((newTrack = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.parentElement.getBoundingClientRect().width;
    const H = Math.round(W * 0.48);
    canvas.width = W;
    canvas.height = H;
    stateRef.current.W = W;
    stateRef.current.H = H;
    if (newTrack || stateRef.current.truth.length === 0) {
      stateRef.current.truth = buildTrack(W, H);
    }
    stateRef.current.meas = genMeas(stateRef.current.truth, W, H);
    stateRef.current.scan = 0;
    setScan(0);
    setCaption(null);
    draw();
  }, [draw]);

  useEffect(() => {
    initCanvas(true);
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const W = canvas.parentElement.getBoundingClientRect().width;
      const H = Math.round(W * 0.48);
      canvas.width = W;
      canvas.height = H;
      stateRef.current.W = W;
      stateRef.current.H = H;
      stateRef.current.truth = buildTrack(W, H);
      stateRef.current.meas = genMeas(stateRef.current.truth, W, H);
      stateRef.current.scan = 0;
      setScan(0);
      draw();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const caps = [
    "First radar return (red). It's close to the true position (green) but offset — that gap is measurement noise. Every radar return carries it. The track estimate (blue) starts here.",
    "Four seconds later, a second sweep. The contact moved. The filter uses both measurements to estimate position and velocity. The blue estimate won't sit exactly on the green truth — it's working from imperfect data.",
    "The track is forming. The filter refines its estimate of heading and speed with each new return. The blue estimate is already close to the green true path.",
    "The red dashed line is the measurement error this scan. It changes every sweep, randomly. Some scans the radar is very close. Others it's further off. The filter accounts for this uncertainty internally.",
    "Healthy track. The blue estimate stays close to the green truth, built entirely from noisy red measurements. The filter has learned the contact's speed and heading well enough to predict the next return.",
    "The arc is bending. Watch how the estimate follows the curve — the filter continuously updates its velocity estimate as the heading changes. This is normal behaviour for a turning contact.",
    "The estimate is tracking the curve. The gap between blue and green stays small because the turn is gradual and the filter adapts scan by scan.",
    "More than halfway through. The filter is confident about the contact's current heading. Any measurement that landed far from the predicted position would stand out clearly now.",
    "The track is well-established. The filter can now predict roughly where the next return should appear before the radar even sweeps. That prediction is the foundation of anomaly detection.",
    "Small, consistent measurement errors. Estimate tracking truth closely. This is what a normal, well-behaved track looks like to the system.",
    "Almost complete. Notice the trail of faded dots — each one a measurement the filter processed and used to refine the estimate. Hit Randomize to see a different arc shape.",
    "Track complete. The blue estimate was built from twelve noisy red measurements, taken every four seconds. It never touched the green true path exactly — it never can. That gap is the problem this project is built to reason about.",
  ];

  function step() {
    const s = stateRef.current;
    if (s.scan >= MAX) return;
    s.scan++;
    setScan(s.scan);
    setCaption(`Scan ${s.scan}. ${caps[s.scan - 1]}`);
    draw();
    if (s.scan >= MAX && s.auto) stopAuto();
  }

  function stopAuto() {
    const s = stateRef.current;
    s.auto = false;
    if (s.timer) { clearInterval(s.timer); s.timer = null; }
    setAutoPlay(false);
  }

  function handleAuto() {
    const s = stateRef.current;
    if (s.auto) { stopAuto(); return; }
    s.auto = true;
    setAutoPlay(true);
    s.timer = setInterval(() => {
      if (stateRef.current.scan >= MAX) { stopAuto(); return; }
      step();
    }, 2200);
  }

  function handleReset() {
    stopAuto();
    const s = stateRef.current;
    s.scan = 0;
    s.meas = genMeas(s.truth, s.W, s.H);
    setScan(0);
    setCaption(null);
    draw();
  }

  function handleRandomize() {
    stopAuto();
    initCanvas(true);
  }

  const progress = (scan / MAX) * 100;

  return (
    <div style={{ fontFamily: "'JetBrains Mono', monospace", margin: "2rem 0" }}>
      <div style={{ position: "relative", background: "#13151a", border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: "10px", overflow: "hidden", marginBottom: "12px" }}>
        <canvas ref={canvasRef} style={{ display: "block", width: "100%" }} />

        {/* Corner legend — bottom left */}
        <div style={{ position: "absolute", bottom: "14px", left: "16px", background: "rgba(11,12,15,0.9)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: "6px", padding: "10px 14px", fontSize: "11px", color: "#6b6a64", lineHeight: "2.2", pointerEvents: "none" }}>
          {[["#4ade9a", "True position"], ["#f87060", "Radar return"], ["#60a8f8", "Track estimate"]].map(([color, label]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: "9px" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: color, flexShrink: 0 }} />
              {label}
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
            <div style={{ width: "18px", height: "0", borderTop: "2.5px dashed rgba(248,112,96,0.7)", flexShrink: 0 }} />
            Measurement error
          </div>
        </div>

        {/* HUD — top right */}
        <div style={{ position: "absolute", top: "14px", right: "16px", fontSize: "11px", color: "rgba(255,255,255,0.18)", letterSpacing: "0.1em", lineHeight: "2", textAlign: "right", pointerEvents: "none" }}>
          <div>SCAN {scan} / {MAX}</div>
          <div>T + {scan * DT} s</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: "2px", background: "rgba(255,255,255,0.06)", borderRadius: "1px", marginBottom: "12px", overflow: "hidden" }}>
        <div style={{ height: "100%", background: "#60a8f8", borderRadius: "1px", width: `${progress}%`, transition: "width 0.35s ease" }} />
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
        {[
          { label: "Next scan ›", onClick: step, color: "rgba(96,168,248,0.4)", textColor: "#60a8f8" },
          { label: autoPlay ? "Pause" : "Auto-play", onClick: handleAuto, color: "rgba(255,255,255,0.12)", textColor: "#e2e0d8" },
          { label: "Reset", onClick: handleReset, color: "rgba(255,255,255,0.12)", textColor: "#e2e0d8" },
          { label: "Randomize ↺", onClick: handleRandomize, color: "rgba(74,222,154,0.35)", textColor: "#4ade9a" },
        ].map(({ label, onClick, color, textColor }) => (
          <button key={label} onClick={onClick} style={{ flex: 1, padding: "10px 0", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", background: "#13151a", border: `0.5px solid ${color}`, color: textColor, borderRadius: "7px", cursor: "pointer", letterSpacing: "0.04em" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Caption */}
      <div style={{ background: "#13151a", border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "14px 20px", fontSize: "13px", color: "#c8c6be", lineHeight: "1.8", minHeight: "68px" }}>
        {caption ? (
          <span><span style={{ color: "#60a8f8", fontWeight: 500 }}>{caption.split('. ')[0]}.</span>{' '}{caption.split('. ').slice(1).join('. ')}</span>
        ) : (
          <span>Press <span style={{ color: "#60a8f8", fontWeight: 500 }}>Next scan</span> to take the first radar sweep. Hit <span style={{ color: "#4ade9a" }}>Randomize</span> to generate a different arc.</span>
        )}
      </div>
    </div>
  );
}
