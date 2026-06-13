import { useEffect, useRef, useState } from 'react';

/**
 * BackgroundScene
 * ─ Pixel mountain image base layer (time-aware warm/dark)
 * ─ SVG parallax overlay (mountain shapes, clouds, trees, stars)
 * ─ Canvas layer for an abstract sky field that reacts to the cursor
 */

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h >= 6  && h < 8)  return 'dawn';
  if (h >= 8  && h < 19) return 'day';
  if (h >= 19 && h < 21) return 'dusk';
  return 'night';
}

function drawFlowingCurve(ctx, startX, startY, midX, midY, endX, endY, wobblePhase) {
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  const steps = 58;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = startX + (endX - startX) * t;
    const y = startY + (endY - startY) * t;
    const distortion = Math.sin(wobblePhase + t * Math.PI * 4.2) * 3.8 + Math.cos(wobblePhase - t * Math.PI * 3.1) * 2.2;
    const normY = -(endX - startX);
    const normX = endY - startY;
    const len = Math.sqrt(normX * normX + normY * normY) || 1;
    const offsetX = (normX / len) * distortion;
    const offsetY = (normY / len) * distortion;
    ctx.lineTo(x + offsetX, y + offsetY);
  }
  ctx.stroke();
}

export default function BackgroundScene() {
  const layer1Ref  = useRef(null);
  const layer2Ref  = useRef(null);
  const layer3Ref  = useRef(null);
  const layer4Ref  = useRef(null);
  const cloudsRef  = useRef(null);
  const canvasRef  = useRef(null);
  const rafRef     = useRef(null);

  const mouseRef    = useRef({ x: 0, y: 0 });
  const cursorRef   = useRef({ x: -999, y: -999 }); // screen px
  const parallaxRef = useRef({ x: 0, y: 0 });

  const fieldRef = useRef([
    { x: 0.26, y: 0.28, r: 88, speed: 0.16, drift: 0.9, phase: 0.0 },
    { x: 0.64, y: 0.22, r: 118, speed: 0.12, drift: 0.7, phase: 1.8 },
    { x: 0.52, y: 0.39, r: 156, speed: 0.09, drift: 0.5, phase: 3.3 },
    { x: 0.78, y: 0.34, r: 72, speed: 0.2, drift: 1.1, phase: 2.4 },
  ]);

  const [tod, setTod] = useState(getTimeOfDay);
  useEffect(() => {
    const id = setInterval(() => setTod(getTimeOfDay()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let lastTime = performance.now();

    const onMouseMove = (e) => {
      const cx = window.innerWidth  / 2;
      const cy = window.innerHeight / 2;
      mouseRef.current  = { x: (e.clientX - cx) / cx, y: (e.clientY - cy) / cy };
      cursorRef.current = { x: e.clientX, y: e.clientY };
    };

    const animate = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05); // seconds, capped
      lastTime = now;

      // ── Parallax (smooth) ──
      const ease = 0.06;
      parallaxRef.current.x += (mouseRef.current.x - parallaxRef.current.x) * ease;
      parallaxRef.current.y += (mouseRef.current.y - parallaxRef.current.y) * ease;
      const { x: px, y: py } = parallaxRef.current;

      if (layer1Ref.current) layer1Ref.current.style.transform = `translate(${px*6}px,${py*3}px)`;
      if (layer2Ref.current) layer2Ref.current.style.transform = `translate(${px*11}px,${py*5}px)`;
      if (layer3Ref.current) layer3Ref.current.style.transform = `translate(${px*17}px,${py*7}px)`;
      if (layer4Ref.current) layer4Ref.current.style.transform = `translate(${px*24}px,${py*10}px)`;
      if (cloudsRef.current)  cloudsRef.current.style.transform  = `translate(${px*-8}px,${py*-4}px)`;

      // ── Abstract sky field on canvas ──
      const canvas = canvasRef.current;
      if (!canvas) { rafRef.current = requestAnimationFrame(animate); return; }
      const W = canvas.width  = window.innerWidth;
      const H = canvas.height = window.innerHeight;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, W, H);

      const isNightNow = tod === 'night';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const swayX = cursorRef.current.x ? (cursorRef.current.x / W - 0.5) : 0;
      const swayY = cursorRef.current.y ? (cursorRef.current.y / H - 0.5) : 0;
      const centerX = W * 0.54 + swayX * 70;
      const centerY = H * 0.31 + swayY * 40;

      const haze = ctx.createRadialGradient(centerX, centerY, 12, centerX, centerY, Math.min(W, H) * 0.46);
      haze.addColorStop(0, isNightNow ? 'rgba(198, 123, 92, 0.16)' : 'rgba(232, 200, 160, 0.12)');
      haze.addColorStop(0.4, isNightNow ? 'rgba(107, 122, 92, 0.08)' : 'rgba(107, 122, 92, 0.05)');
      haze.addColorStop(1, 'rgba(44, 44, 44, 0)');
      ctx.fillStyle = haze;
      ctx.globalAlpha = 1;
      ctx.fillRect(0, 0, W, H);

      ctx.globalAlpha = 1;
      ctx.strokeStyle = isNightNow ? 'rgba(180, 170, 160, 0.28)' : 'rgba(44, 44, 44, 0.22)';
      ctx.lineWidth = 1.1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const field = fieldRef.current;
      field.forEach((node, index) => {
        const t = now * 0.0001 * node.speed + node.phase;
        const x = W * node.x + Math.cos(t * 1.6) * 28 + swayX * 36 * node.drift;
        const y = H * node.y + Math.sin(t * 1.3) * 20 + swayY * 24 * node.drift;

        drawFlowingCurve(ctx, x - node.r * 0.88, y - node.r * 0.36, x + node.r * 0.12, y - node.r * 0.68, x + node.r * 0.92, y + node.r * 0.28, t * 2.1);
        drawFlowingCurve(ctx, x - node.r * 0.52, y + node.r * 0.44, x + node.r * 0.28, y + node.r * 0.08, x + node.r * 1.18, y - node.r * 0.52, t * 1.7);
        drawFlowingCurve(ctx, x + node.r * 0.14, y - node.r * 0.88, x - node.r * 0.64, y + node.r * 0.12, x + node.r * 0.76, y + node.r * 0.72, t * 2.4);
      });

      // Main accent sweep linking sky field to landscape
      const sweepY = H * 0.58 + Math.sin(now * 0.0004) * 16 + swayY * 24;
      ctx.strokeStyle = isNightNow ? 'rgba(160, 150, 140, 0.32)' : 'rgba(68, 68, 68, 0.26)';
      ctx.lineWidth = 1.3;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(-20, sweepY);
      ctx.bezierCurveTo(W * 0.22, sweepY - 32, W * 0.56, sweepY + 26, W * 0.82, sweepY - 18);
      ctx.bezierCurveTo(W * 0.92, sweepY - 36, W + 40, sweepY + 14, W + 70, sweepY - 4);
      ctx.stroke();

      // Secondary connective lines to weave the field together
      ctx.strokeStyle = isNightNow ? 'rgba(140, 130, 120, 0.18)' : 'rgba(100, 100, 100, 0.14)';
      ctx.lineWidth = 0.9;
      for (let i = 0; i < 5; i++) {
        const x1 = W * (0.1 + i * 0.22);
        const y1 = H * (0.2 + Math.sin(now * 0.0002 + i) * 0.12);
        const x2 = W * (0.18 + i * 0.21);
        const y2 = H * (0.6 + Math.cos(now * 0.00015 + i * 1.3) * 0.14);
        drawFlowingCurve(ctx, x1, y1, x1 + (x2 - x1) * 0.5, (y1 + y2) * 0.5 + Math.sin(now * 0.0003 + i * 2.1) * 20, x2, y2, now * 0.0008 + i * 0.6);
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tod]);

  const isNight = tod === 'night';

  return (
    <div aria-hidden="true" style={{ position:'fixed', inset:0, zIndex:-1, pointerEvents:'none', overflow:'hidden' }}>
      <style>{`
        @keyframes bgCloud1{0%,100%{transform:translateX(0)}50%{transform:translateX(58px)}}
        @keyframes bgCloud2{0%,100%{transform:translateX(0)}50%{transform:translateX(-50px)}}
        @keyframes bgCloud3{0%,100%{transform:translateX(0)}50%{transform:translateX(34px)}}
        @keyframes bgSway{0%,100%{transform:rotate(-0.7deg)}50%{transform:rotate(0.7deg)}}
        @keyframes bgTwinkle{0%,100%{opacity:0.07}50%{opacity:0.28}}
        @keyframes bgFadeIn{from{opacity:0}to{opacity:1}}
        .bgCloud1{animation:bgCloud1 32s ease-in-out infinite}
        .bgCloud2{animation:bgCloud2 41s ease-in-out infinite}
        .bgCloud3{animation:bgCloud3 26s ease-in-out infinite}
        .bgTree{transform-box:fill-box;transform-origin:bottom center;animation:bgSway 8s ease-in-out infinite}
        .bgTreeB{animation-delay:-2.6s}.bgTreeC{animation-delay:-5.2s}
        .bgTreeD{animation-delay:-1.4s}.bgTreeE{animation-delay:-4.1s}.bgTreeF{animation-delay:-3.3s}
        .bgStar{animation:bgTwinkle 4s ease-in-out infinite}
        .bgStar2{animation-delay:-1.3s}.bgStar3{animation-delay:-2.7s}
        .bgStar4{animation-delay:-0.8s}.bgStar5{animation-delay:-3.2s}
        .bgStar6{animation-delay:-1.9s}.bgStar7{animation-delay:-3.6s}
        .bgScene{animation:bgFadeIn 2s ease-out forwards}
        @media(prefers-reduced-motion:reduce){
          .bgCloud1,.bgCloud2,.bgCloud3,.bgTree,.bgStar{animation:none!important}
        }
      `}</style>

      {/* ── SVG PARALLAX OVERLAY ── */}
      <svg
        className="bgScene"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position:'absolute', inset:0, width:'100%', height:'100%', display:'block' }}
      >
        <g ref={layer1Ref} style={{willChange:'transform'}}>
          <path d="M-20 618 C80 598,165 558,235 545 C295 534,332 512,352 524 C372 536,402 500,424 496 C446 492,504 512,534 506 C568 500,604 480,626 479 C664 478,694 490,726 486 C754 483,782 512,804 511 C824 510,858 490,884 489 C914 488,944 500,964 499 C994 498,1034 511,1064 510 C1115 510,1165 500,1185 501 C1226 502,1264 516,1296 515 C1330 515,1364 508,1385 509 C1414 510,1432 513,1460 512 L1460 900 L-20 900Z"
            fill="#6B7A5C" opacity="0.055"/>
        </g>
        <g ref={layer2Ref} style={{willChange:'transform'}}>
          <path d="M-20 706 C65 690,146 668,246 671 C328 674,386 652,456 643 C516 636,566 622,606 613 C636 607,664 598,704 595 C744 592,786 610,836 620 C886 630,946 640,1026 633 C1098 627,1168 641,1238 639 C1308 637,1374 650,1460 646 L1460 900 L-20 900Z"
            fill="#5C6E4E" opacity="0.07"/>
          <path d="M-20 730 C110 718,240 724,380 720 C480 717,540 705,620 708 C700 711,760 720,880 715 C1000 710,1100 722,1220 718 C1340 714,1400 722,1460 720 L1460 900 L-20 900Z"
            fill="#526244" opacity="0.05"/>
        </g>
        <g ref={layer3Ref} style={{willChange:'transform'}}>
          <path d="M-20 778 C106 764,226 760,366 764 C488 768,586 752,688 756 C766 760,848 768,956 762 C1058 757,1158 768,1278 764 C1368 761,1416 766,1460 764 L1460 900 L-20 900Z"
            fill="#4A5640" opacity="0.055"/>
        </g>
        <g ref={layer4Ref} style={{willChange:'transform'}}>
          <path d="M-20 840 C126 832,294 836,458 842 C608 847,748 832,892 838 C1036 844,1192 832,1368 837 L1460 836 L1460 900 L-20 900Z"
            fill="#2C2C2C" opacity="0.028"/>
        </g>

        {/* Trees — left */}
        <g opacity="0.13">
          <g className="bgTree"><polygon points="50,742 28,797 72,797" fill="#2C2C2C"/><polygon points="50,720 34,764 66,764" fill="#2C2C2C"/><polygon points="50,700 39,732 61,732" fill="#2C2C2C"/><rect x="47" y="797" width="6" height="18" fill="#2C2C2C"/></g>
          <g className="bgTree bgTreeB"><polygon points="116,750 90,812 142,812" fill="#2C2C2C"/><polygon points="116,726 96,770 136,770" fill="#2C2C2C"/><polygon points="116,703 101,744 131,744" fill="#2C2C2C"/><polygon points="116,680 104,708 128,708" fill="#2C2C2C"/><rect x="113" y="812" width="6" height="18" fill="#2C2C2C"/></g>
          <g className="bgTree bgTreeC"><polygon points="178,752 160,790 196,790" fill="#2C2C2C"/><polygon points="178,732 163,760 193,760" fill="#2C2C2C"/><polygon points="178,714 165,737 191,737" fill="#2C2C2C"/><rect x="175" y="790" width="6" height="15" fill="#2C2C2C"/></g>
        </g>

        {/* Trees — center */}
        <g opacity="0.07">
          <polygon points="672,772 658,802 686,802" fill="#2C2C2C"/><polygon points="672,756 660,778 684,778" fill="#2C2C2C"/><rect x="669" y="802" width="5" height="14" fill="#2C2C2C"/>
          <polygon points="756,782 740,815 772,815" fill="#2C2C2C"/><polygon points="756,764 742,788 770,788" fill="#2C2C2C"/><polygon points="756,748 744,770 768,770" fill="#2C2C2C"/><rect x="753" y="815" width="5" height="12" fill="#2C2C2C"/>
        </g>

        {/* Trees — right */}
        <g opacity="0.11">
          <g className="bgTree bgTreeD"><polygon points="1340,747 1318,794 1362,794" fill="#2C2C2C"/><polygon points="1340,724 1324,760 1356,760" fill="#2C2C2C"/><polygon points="1340,704 1329,730 1351,730" fill="#2C2C2C"/><rect x="1337" y="794" width="6" height="18" fill="#2C2C2C"/></g>
          <g className="bgTree bgTreeE"><polygon points="1402,754 1377,810 1427,810" fill="#2C2C2C"/><polygon points="1402,730 1381,772 1423,772" fill="#2C2C2C"/><polygon points="1402,708 1386,744 1418,744" fill="#2C2C2C"/><polygon points="1402,688 1390,714 1414,714" fill="#2C2C2C"/><rect x="1399" y="810" width="6" height="16" fill="#2C2C2C"/></g>
          <g className="bgTree bgTreeF"><polygon points="1290,762 1275,796 1305,796" fill="#2C2C2C"/><polygon points="1290,745 1278,768 1302,768" fill="#2C2C2C"/><rect x="1287" y="796" width="5" height="14" fill="#2C2C2C"/></g>
        </g>

        {/* Clouds */}
        <g ref={cloudsRef} style={{willChange:'transform'}}>
          <g className="bgCloud1">
            <ellipse cx="352" cy="149" rx="88" ry="32" fill="white" opacity={isNight?'0.04':'0.28'}/>
            <ellipse cx="282" cy="160" rx="54" ry="27" fill="white" opacity={isNight?'0.04':'0.28'}/>
            <ellipse cx="424" cy="141" rx="60" ry="25" fill="white" opacity={isNight?'0.04':'0.28'}/>
            <ellipse cx="370" cy="128" rx="46" ry="23" fill="white" opacity={isNight?'0.04':'0.28'}/>
            <ellipse cx="464" cy="150" rx="36" ry="19" fill="white" opacity={isNight?'0.04':'0.28'}/>
          </g>
          <g className="bgCloud2">
            <ellipse cx="1132" cy="116" rx="74" ry="27" fill="white" opacity={isNight?'0.03':'0.22'}/>
            <ellipse cx="1067" cy="126" rx="46" ry="22" fill="white" opacity={isNight?'0.03':'0.22'}/>
            <ellipse cx="1192" cy="108" rx="44" ry="21" fill="white" opacity={isNight?'0.03':'0.22'}/>
            <ellipse cx="1150" cy="98"  rx="38" ry="20" fill="white" opacity={isNight?'0.03':'0.22'}/>
          </g>
          <g className="bgCloud3">
            <ellipse cx="794" cy="84" rx="56" ry="20" fill="white" opacity={isNight?'0.03':'0.17'}/>
            <ellipse cx="750" cy="92" rx="33" ry="15" fill="white" opacity={isNight?'0.03':'0.17'}/>
            <ellipse cx="842" cy="77" rx="35" ry="16" fill="white" opacity={isNight?'0.03':'0.17'}/>
            <ellipse cx="812" cy="68" rx="31" ry="15" fill="white" opacity={isNight?'0.03':'0.17'}/>
          </g>
        </g>

        {/* Stars */}
        <circle className="bgStar"         cx="516"  cy="56" r="1.6" fill={isNight?'#C8C0B0':'#6B7A5C'}/>
        <circle className="bgStar bgStar2" cx="660"  cy="40" r="1.2" fill={isNight?'#C8C0B0':'#6B7A5C'}/>
        <circle className="bgStar bgStar3" cx="836"  cy="51" r="1.5" fill={isNight?'#C8C0B0':'#6B7A5C'}/>
        <circle className="bgStar bgStar4" cx="972"  cy="34" r="1.0" fill={isNight?'#C8C0B0':'#6B7A5C'}/>
        <circle className="bgStar bgStar5" cx="1170" cy="60" r="1.3" fill={isNight?'#C8C0B0':'#6B7A5C'}/>
        <circle className="bgStar bgStar6" cx="428"  cy="30" r="1.0" fill={isNight?'#E8C8A0':'#C67B5C'}/>
        <circle className="bgStar bgStar7" cx="1088" cy="44" r="1.2" fill={isNight?'#E8C8A0':'#C67B5C'}/>

        <path d="M0 600 Q360 594 720 597 Q1080 600 1440 596" stroke="#6B7A5C" strokeWidth="0.6" opacity="0.07" fill="none" strokeDasharray="8 5"/>
      </svg>

      {/* ── CANVAS BIRD LAYER — full JS control, no React interference ── */}
      <canvas
        ref={canvasRef}
        style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }}
      />
    </div>
  );
}
