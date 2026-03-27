import { useEffect, useRef, useState, useCallback } from "react";

export default function RadarTrackViz() {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    W: 0, H: 0,
    scan: 0,       // 0-11, current scan index
    beat: 0,       // 0=nothing shown, 1=true, 2=radar, 3=estimate
    truth: [],
    meas: [],
    est: [],
  });

  const [scan, setScan] = useState(0);
  const [beat, setBeat] = useState(0);
  const [caption, setCaption] = useState(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const autoRef = useRef(false);
  const timerRef = useRef(null);

  const MAX = 12;
  const DT = 4;
  const SIGMA_MULT = 0.055; // 2x realistic noise

  function randn() {
    let u=0,v=0;
    while(!u) u=Math.random();
    while(!v) v=Math.random();
    return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
  }

  function buildTrack(W, H) {
    const PAD = Math.round(Math.min(W,H)*0.10);
    const useW = W-PAD*2, useH = H-PAD*2;
    const arcDir = Math.random()<0.5?1:-1;
    const arcAmp = 0.15+Math.random()*0.22;
    const arcPhase = Math.random()*0.3;
    const yStart = 0.25+Math.random()*0.50;
    const pts=[];
    for(let i=0;i<MAX;i++){
      const t=i/(MAX-1);
      const nx=0.05+t*0.90;
      const ny=yStart+arcDir*arcAmp*Math.sin(Math.PI*t+arcPhase);
      pts.push({
        x: PAD+nx*useW,
        y: PAD+Math.max(0.06,Math.min(0.94,ny))*useH,
      });
    }
    return pts;
  }

  function genMeas(truth, W, H) {
    const SIGMA = Math.min(W,H)*SIGMA_MULT;
    return truth.map(p=>({
      x: p.x+randn()*SIGMA,
      y: p.y+randn()*SIGMA,
    }));
  }

  function kalmanTrack(mp, sigmaR) {
    if(mp.length<2) return [{x:mp[0].x,y:mp[0].y}];
    const Q=sigmaR*0.18, R=sigmaR*sigmaR;
    const vx0=mp[1].x-mp[0].x, vy0=mp[1].y-mp[0].y;
    let px=mp[0].x,vx=vx0,Pxx=R,Pvx=0,Pxv=0,Pvvx=R*0.5;
    let py=mp[0].y,vy=vy0,Pyy=R,Pvy=0,Pyv=0,Pvvy=R*0.5;
    const out=[{x:px,y:py}];
    for(let i=1;i<mp.length;i++){
      const pxp=px+vx,Pxxp=Pxx+Pxv+Pvx+Pvvx+Q,Pxvp=Pxv+Pvvx,Pvxp=Pvx+Pvvx,Pvvxp=Pvvx+Q*0.5;
      const Sx=Pxxp+R,Kx=Pxxp/Sx,Kvx=Pvxp/Sx,ix=mp[i].x-pxp;
      px=pxp+Kx*ix; vx=vx+Kvx*ix;
      Pxx=(1-Kx)*Pxxp; Pvx=Pvxp-Kvx*Pxxp; Pxv=Pxvp*(1-Kx); Pvvx=Pvvxp-Kvx*Pxvp;
      const pyp=py+vy,Pyyp=Pyy+Pyv+Pvy+Pvvy+Q,Pyvp=Pyv+Pvvy,Pvyp=Pvy+Pvvy,Pvvyp=Pvvy+Q*0.5;
      const Sy=Pyyp+R,Ky=Pyyp/Sy,Kvy=Pvyp/Sy,iy=mp[i].y-pyp;
      py=pyp+Ky*iy; vy=vy+Kvy*iy;
      Pyy=(1-Ky)*Pyyp; Pvy=Pvyp-Kvy*Pyyp; Pyv=Pyvp*(1-Ky); Pvvy=Pvvyp-Kvy*Pyvp;
      out.push({x:px,y:py});
    }
    return out;
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const {W, H, scan, beat, truth, meas, est} = stateRef.current;

    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#0b0c0f';
    ctx.fillRect(0,0,W,H);

    // Grid
    ctx.strokeStyle='rgba(255,255,255,0.03)'; ctx.lineWidth=1;
    for(let i=1;i<7;i++){
      ctx.beginPath();ctx.moveTo(W*i/7,0);ctx.lineTo(W*i/7,H);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,H*i/7);ctx.lineTo(W,H*i/7);ctx.stroke();
    }

    if(scan>=MAX) return;
    if(scan===0 && beat===0){
      const fs=Math.max(13,Math.round(W*0.018));
      ctx.font=`${fs}px 'JetBrains Mono',monospace`;
      ctx.fillStyle='rgba(255,255,255,0.11)';
      ctx.textAlign='center';
      ctx.fillText('Press "Show true position" to begin',W/2,H/2);
      ctx.textAlign='left';
      return;
    }

    const DR = Math.max(10, Math.round(W*0.013));
    const RR = DR*2.2;

    // Draw historical trail for scans before current
    for(let i=0;i<scan;i++){
      const age=scan-i;
      const a=Math.max(0.06,0.45-age*0.07);

      // True trail dot
      ctx.beginPath(); ctx.arc(truth[i].x,truth[i].y,4,0,Math.PI*2);
      ctx.fillStyle=`rgba(74,222,154,${a})`; ctx.fill();

      // Meas trail dot
      ctx.beginPath(); ctx.arc(meas[i].x,meas[i].y,4,0,Math.PI*2);
      ctx.fillStyle=`rgba(248,112,96,${a})`; ctx.fill();

      // Est trail dot
      ctx.beginPath(); ctx.arc(est[i].x,est[i].y,4,0,Math.PI*2);
      ctx.fillStyle=`rgba(96,168,248,${a})`; ctx.fill();

      // Historical error lines (very faint)
      ctx.beginPath(); ctx.moveTo(truth[i].x,truth[i].y); ctx.lineTo(meas[i].x,meas[i].y);
      ctx.strokeStyle=`rgba(248,112,96,${a*0.4})`; ctx.lineWidth=1; ctx.stroke();
    }

    // Trail lines connecting historical dots
    if(scan>0){
      // True path
      ctx.beginPath(); ctx.moveTo(truth[0].x,truth[0].y);
      for(let i=1;i<scan;i++) ctx.lineTo(truth[i].x,truth[i].y);
      if(beat>=1) ctx.lineTo(truth[scan].x,truth[scan].y);
      ctx.strokeStyle='rgba(74,222,154,0.12)'; ctx.lineWidth=2;
      ctx.setLineDash([6,6]); ctx.stroke(); ctx.setLineDash([]);

      // Est path
      if(scan>0){
        ctx.beginPath(); ctx.moveTo(est[0].x,est[0].y);
        for(let i=1;i<scan;i++) ctx.lineTo(est[i].x,est[i].y);
        if(beat>=3) ctx.lineTo(est[scan].x,est[scan].y);
        ctx.strokeStyle='rgba(96,168,248,0.18)'; ctx.lineWidth=2; ctx.stroke();
      }
    }

    // Current scan — reveal by beat
    const tp=truth[scan], mp=meas[scan], ep=est[scan];

    // Beat 1: true position
    if(beat>=1){
      ctx.beginPath(); ctx.arc(tp.x,tp.y,RR,0,Math.PI*2);
      ctx.strokeStyle='rgba(74,222,154,0.2)'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(tp.x,tp.y,DR,0,Math.PI*2);
      ctx.fillStyle='#4ade9a'; ctx.fill();
    }

    // Beat 2: radar return + error line
    if(beat>=2){
      // Error line — solid, bright
      ctx.beginPath(); ctx.moveTo(tp.x,tp.y); ctx.lineTo(mp.x,mp.y);
      ctx.strokeStyle='rgba(248,112,96,0.85)'; ctx.lineWidth=2.5; ctx.stroke();

      ctx.beginPath(); ctx.arc(mp.x,mp.y,RR,0,Math.PI*2);
      ctx.strokeStyle='rgba(248,112,96,0.2)'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(mp.x,mp.y,DR,0,Math.PI*2);
      ctx.fillStyle='#f87060'; ctx.fill();
    }

    // Beat 3: estimate
    if(beat>=3){
      ctx.beginPath(); ctx.arc(ep.x,ep.y,RR,0,Math.PI*2);
      ctx.strokeStyle='rgba(96,168,248,0.2)'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(ep.x,ep.y,DR,0,Math.PI*2);
      ctx.fillStyle='#60a8f8'; ctx.fill();
    }

    // HUD
    document.getElementById('rt-scan').textContent=`SCAN ${scan+1} / ${MAX}`;
    document.getElementById('rt-time').textContent=`T + ${(scan+1)*DT} s`;
  }, []);

  const initCanvas = useCallback((newTrack=false) => {
    const canvas = canvasRef.current;
    if(!canvas) return;
    const W = canvas.parentElement.getBoundingClientRect().width;
    const H = Math.round(W*0.62);
    canvas.width=W; canvas.height=H;
    const s = stateRef.current;
    s.W=W; s.H=H;
    if(newTrack || s.truth.length===0){
      s.truth = buildTrack(W,H);
    }
    s.meas = genMeas(s.truth,W,H);
    s.est  = kalmanTrack(s.meas, Math.min(W,H)*SIGMA_MULT);
    s.scan=0; s.beat=0;
    setScan(0); setBeat(0); setCaption(null);
    draw();
  }, [draw]);

  useEffect(()=>{
    initCanvas(true);
    const handleResize=()=>{
      const canvas=canvasRef.current;
      if(!canvas) return;
      const W=canvas.parentElement.getBoundingClientRect().width;
      const H=Math.round(W*0.62);
      canvas.width=W; canvas.height=H;
      const s=stateRef.current;
      s.W=W; s.H=H;
      s.truth=buildTrack(W,H);
      s.meas=genMeas(s.truth,W,H);
      s.est=kalmanTrack(s.meas,Math.min(W,H)*SIGMA_MULT);
      s.scan=0; s.beat=0;
      setScan(0); setBeat(0);
      draw();
    };
    window.addEventListener('resize',handleResize);
    return ()=>window.removeEventListener('resize',handleResize);
  },[]);

  // Beat captions per scan
  const beatCaptions = [
    [
      "Scan 1. This is where the contact actually is — the ground truth. The tracking system never has direct access to this.",
      "The radar sweeps past and returns a measurement. It's close to the true position but offset. That gap is measurement noise — unavoidable physics.",
      "The filter makes its best estimate from this first measurement. With only one data point, it doesn't know the contact's velocity yet."
    ],
    [
      "Scan 2. The contact moved. Here is where it actually is now.",
      "A second radar return. Again offset from truth — a different random error this time.",
      "Now the filter has two measurements. It can estimate velocity and position together. The estimate is already more confident than scan 1."
    ],
    [
      "Scan 3. True position.",
      "Radar return — notice the error line length varies scan to scan. Sometimes the radar is closer, sometimes further.",
      "The estimate is converging. Each new measurement refines the filter's model of this contact's motion."
    ],
    [
      "Scan 4. True position.",
      "Radar return. The error line shows the raw measurement gap the filter has to work with.",
      "The filter is now tracking well. It predicted close to where the radar saw the contact, then updated its estimate slightly."
    ],
    [
      "Scan 5. Halfway through. True position.",
      "Radar return. The filter's prediction was close — which is why the estimate barely moves after the update.",
      "A confident track. The filter has learned this contact's speed and heading well enough to predict the next return accurately."
    ],
    [
      "Scan 6. True position — the contact is curving.",
      "Radar return. The measurement is offset in the direction of the curve.",
      "The estimate follows the measurement, adapting to the new heading. This is normal behaviour for a gradual turn."
    ],
    [
      "Scan 7. True position.",
      "Radar return.",
      "The estimate is tracking the arc smoothly. The filter updates its velocity estimate with each scan as the heading changes."
    ],
    [
      "Scan 8. True position.",
      "Radar return. Notice the error line — the noise is consistent throughout the track.",
      "The estimate stays close to truth. A healthy track."
    ],
    [
      "Scan 9. True position.",
      "Radar return.",
      "The filter has been running for nine scans. Its prediction uncertainty is tight — it knows this contact well."
    ],
    [
      "Scan 10. True position.",
      "Radar return.",
      "An anomaly at this point would be clearly visible — the radar return would land far from the prediction, producing a large error line."
    ],
    [
      "Scan 11. True position.",
      "Radar return.",
      "Almost complete. The trail behind shows the full history — each orange return, each blue estimate, each gap."
    ],
    [
      "Scan 12. Final true position.",
      "Final radar return. The error line on every scan was the raw measurement noise. Each one slightly different. Never zero.",
      "Track complete. The blue estimate was built entirely from twelve noisy radar returns. It never touched the green true path — it never can. The gap between prediction and measurement, scan after scan, is what the anomaly detector reasons about."
    ],
  ];

  function getButtonLabel(s, b) {
    if(s >= MAX) return "Complete";
    if(b === 0) return "Show true position";
    if(b === 1) return "Show radar return";
    if(b === 2) return "Show estimate";
    return "Next scan ›";
  }

  function advance() {
    const s = stateRef.current;
    if(s.scan >= MAX) return;

    if(s.beat < 3){
      s.beat++;
      setBeat(s.beat);
      setCaption(beatCaptions[s.scan][s.beat-1]);
    } else {
      if(s.scan < MAX-1){
        s.scan++;
        s.beat=0;
        setScan(s.scan);
        setBeat(0);
        setCaption(null);
      } else {
        s.scan=MAX;
        setScan(MAX);
      }
    }
    draw();
  }

  function stopAuto(){
    autoRef.current=false;
    if(timerRef.current){ clearInterval(timerRef.current); timerRef.current=null; }
    setAutoPlay(false);
  }

  function handleAuto(){
    if(autoRef.current){ stopAuto(); return; }
    autoRef.current=true;
    setAutoPlay(true);
    timerRef.current=setInterval(()=>{
      const s=stateRef.current;
      if(s.scan>=MAX){ stopAuto(); return; }
      advance();
    }, 1400);
  }

  function handleReset(){
    stopAuto();
    const s=stateRef.current;
    s.scan=0; s.beat=0;
    setScan(0); setBeat(0); setCaption(null);
    draw();
  }

  function handleRandomize(){
    stopAuto();
    initCanvas(true);
  }

  const currentScan = stateRef.current.scan;
  const currentBeat = stateRef.current.beat;
  const progress = ((currentScan*3 + currentBeat) / (MAX*3)) * 100;
  const btnLabel = getButtonLabel(scan, beat);

  return (
    <div style={{fontFamily:"'JetBrains Mono',monospace", margin:"2rem 0"}}>

      {/* Legend above canvas */}
      <div style={{display:"flex",gap:"20px",flexWrap:"wrap",marginBottom:"10px",fontSize:"11px",color:"#6b6a64",alignItems:"center"}}>
        {[["#4ade9a","True position"],["#f87060","Radar return"],["#60a8f8","Track estimate"]].map(([color,label])=>(
          <div key={label} style={{display:"flex",alignItems:"center",gap:"7px",whiteSpace:"nowrap"}}>
            <div style={{width:"10px",height:"10px",borderRadius:"50%",background:color,flexShrink:0}}/>
            {label}
          </div>
        ))}
        <div style={{display:"flex",alignItems:"center",gap:"7px",whiteSpace:"nowrap"}}>
          <div style={{width:"18px",height:"0",borderTop:"2px solid rgba(248,112,96,0.7)",flexShrink:0}}/>
          Measurement error — noise 2x scale for visibility
        </div>
      </div>

      {/* Canvas */}
      <div style={{position:"relative",background:"#13151a",border:"0.5px solid rgba(255,255,255,0.08)",borderRadius:"10px",overflow:"hidden",marginBottom:"12px"}}>
        <canvas ref={canvasRef} style={{display:"block",width:"100%"}}/>
        <div style={{position:"absolute",top:"14px",left:"16px",fontSize:"11px",color:"rgba(255,255,255,0.18)",letterSpacing:"0.1em",lineHeight:"2",pointerEvents:"none"}}>
          <div id="rt-scan">SCAN 1 / {MAX}</div>
          <div id="rt-time">T + {DT} s</div>
        </div>
      </div>

      {/* Progress */}
      <div style={{height:"2px",background:"rgba(255,255,255,0.06)",borderRadius:"1px",marginBottom:"12px",overflow:"hidden"}}>
        <div style={{height:"100%",background:"#60a8f8",borderRadius:"1px",width:`${progress}%`,transition:"width 0.25s ease"}}/>
      </div>

      {/* Controls */}
      <div style={{display:"flex",gap:"10px",marginBottom:"12px"}}>
        {[
          {label: btnLabel, onClick: advance, color:"rgba(96,168,248,0.4)", textColor:"#60a8f8"},
          {label: autoPlay?"Pause":"Auto-play", onClick:handleAuto, color:"rgba(255,255,255,0.12)", textColor:"#e2e0d8"},
          {label:"Reset", onClick:handleReset, color:"rgba(255,255,255,0.12)", textColor:"#e2e0d8"},
          {label:"Randomize ↺", onClick:handleRandomize, color:"rgba(74,222,154,0.35)", textColor:"#4ade9a"},
        ].map(({label,onClick,color,textColor})=>(
          <button key={label} onClick={onClick} style={{flex:1,padding:"10px 0",fontSize:"11px",fontFamily:"'JetBrains Mono',monospace",background:"#13151a",border:`0.5px solid ${color}`,color:textColor,borderRadius:"7px",cursor:"pointer",letterSpacing:"0.04em"}}>
            {label}
          </button>
        ))}
      </div>

      {/* Caption */}
      <div style={{background:"#13151a",border:"0.5px solid rgba(255,255,255,0.08)",borderRadius:"8px",padding:"14px 20px",fontSize:"13px",color:"#c8c6be",lineHeight:"1.8",minHeight:"60px"}}>
        {caption ? (
          <span>{caption}</span>
        ) : (
          <span>Press <span style={{color:"#60a8f8",fontWeight:500}}>Show true position</span> to begin. Hit <span style={{color:"#4ade9a"}}>Randomize</span> for a different arc.</span>
        )}
      </div>

    </div>
  );
}
