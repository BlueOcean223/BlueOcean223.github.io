// 几张插图共用的像素绘制工具，主角是 Clawd。
// 比例照官方动画：身体 16×12 格，四条腿各 2×4，手臂 4×4，眼睛 2×2，没有嘴。
// 坐标以身体左上角为原点，单位是格；SVG 用 shape-rendering="crispEdges" 画方块。
(() => {
  const PAL = {
    O: '#d97757', d: '#bf694d', '#': '#000', g: '#8b8b8b', t: '#9fd8ff',
    w: '#ffffff', p: '#fbfaf6', l: '#e6e1d4', L: '#d6d0c0', m: '#b0aea5', n: '#87867f',
    k: '#3d3c38', K: '#262624', s: '#e8e6dc', a: '#d97757', b: '#7a9cc6', G: '#9cc28a', r: '#d4675f',
  };

  // 右侧手臂的几种位置，左侧取镜像
  const ARM = {
    down: [16, 4, 4, 4], high: [16, 1, 4, 3], up: [11, -4, 4, 4], out: [16, 4, 6, 3],
    wave1: [12, -4, 4, 4], wave2: [13, -4, 4, 4],
    type1: [16, 5, 5, 3], type2: [16, 6, 5, 3], reach: [16, 3, 7, 3],
  };

  function clawd(o = {}) {
    const m = new Map();
    const put = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) m.set(`${x + i},${y + j}`, c); };
    const side = o.face === 'right' || o.face === 'left';
    const sq = o.squash ? 2 : 0;
    const legs = o.legs || 'stand';
    if (legs !== 'none') (side ? [0, 4, 9, 13] : [0, 4, 10, 14]).forEach((x, i) => {
      let h = 4 - sq;
      if ((legs === 'walk1' && i % 2 === 0) || (legs === 'walk2' && i % 2 === 1)) h -= 1;
      put(x, 12 + sq, 2, h, side && i === 0 ? 'd' : 'O');
      if (sq) put(x, 12 + sq, 2, 1, 'd');
    });
    const [al, ar] = o.arms || ['down', 'down'];
    for (const [st, right] of [[al, false], [ar, true]]) {
      const a = ARM[st];
      if (!a) continue;
      const [x, y, w, h] = a;
      put(right ? x : 16 - x - w, y + sq, w, h, side && !right ? 'd' : 'O');
    }
    put(0, sq, 16, 12, 'O');
    if (side) put(0, sq, 3, 12, 'd');
    const ex = side ? [5, 13] : [2, 12];
    const e = o.eyes || 'open';
    ex.forEach((x0, i) => {
      const x = x0 + (o.look || 0), y = sq + 2 + (o.lookY || 0);
      if (e === 'open') put(x, y, 2, 2, '#');
      else if (e === 'blink') put(x, y + 1, 2, 1, '#');
      else if (e === 'wide') put(x, y - 1, 2, 3, '#');
      else if (e === 'flat') put(i ? x : x - 1, y + 1, 3, 1, '#');
      else if (e === 'happy') { put(x, y, 2, 1, '#'); put(x - 1, y + 1, 1, 1, '#'); put(x + 2, y + 1, 1, 1, '#'); }
      else if (e === 'sad') { put(x, y + 1, 2, 1, '#'); put(i ? x : x + 1, y, 1, 1, '#'); }
    });
    if (o.tear) put(ex[0] + (o.look || 0), sq + 5, 1, 2, 't');
    if (o.face === 'left') {
      const f = new Map();
      for (const [k, c] of m) { const [x, y] = k.split(',').map(Number); f.set(`${15 - x},${y}`, c); }
      return f;
    }
    return m;
  }

  // 把字符画转成格子，'.' 和空格是空
  function art(rows) {
    const m = new Map();
    rows.trim().split('\n').forEach((line, y) => [...line.trim()].forEach((c, x) => { if (c !== '.' && c !== ' ') m.set(`${x},${y}`, c); }));
    return m;
  }

  // 同一行相邻同色的格子合并成一个 rect
  function rects(m, ox = 0, oy = 0) {
    const rows = new Map();
    for (const [k, c] of m) { const [x, y] = k.split(',').map(Number); if (!rows.has(y)) rows.set(y, new Map()); rows.get(y).set(x, c); }
    let s = '';
    for (const [y, r] of rows) {
      const xs = [...r.keys()].sort((a, b) => a - b);
      for (let i = 0; i < xs.length;) {
        const c = r.get(xs[i]);
        let j = i;
        while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1 && r.get(xs[j + 1]) === c) j++;
        s += `<rect x="${ox + xs[i]}" y="${oy + y}" width="${j - i + 1}" height="1" fill="${PAL[c] || c}"/>`;
        i = j + 1;
      }
    }
    return s;
  }

  const R = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${PAL[c] || c}"/>`;
  const T = (x, y, s, size, c, extra = '') =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${PAL[c] || c}" font-family="ui-monospace, 'SF Mono', Menlo, monospace" ${extra}>${s}</text>`;

  // 统一的节拍：每 90ms 一下，接近官方动画的帧间隔。减少动态效果时只画第一帧。
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const jobs = [];
  let tick = 0;
  function every(fn) { jobs.push(fn); fn(0); }
  if (!reduce) setInterval(() => { if (document.hidden) return; tick++; for (const f of jobs) f(tick); }, 90);

  // frames 是几段 SVG 片段，seq 是 [帧号, 持续几拍] 的序列，循环播放
  function sprite(el, frames, seq = frames.map((_, i) => [i, 1])) {
    el.innerHTML = frames.map((f, i) => `<g${i === seq[0][0] ? '' : ' display="none"'}>${f}</g>`).join('');
    const kids = [...el.children];
    const total = seq.reduce((a, s) => a + s[1], 0);
    let cur = seq[0][0];
    every((t) => {
      let r = t % total, k = 0;
      while (r >= seq[k][1]) { r -= seq[k][1]; k++; }
      const f = seq[k][0];
      if (f === cur) return;
      kids[cur].setAttribute('display', 'none');
      kids[f].removeAttribute('display');
      cur = f;
    });
  }

  // 敲键盘：手抬起、按下，偶尔眨眼
  const TYPE_SEQ = [[0, 2], [1, 2], [0, 1], [1, 2], [0, 3], [1, 1], [0, 2], [2, 1], [0, 2], [1, 2], [0, 1], [1, 1], [0, 4]];
  function typingFrames(extra = {}) {
    return [
      rects(clawd({ face: 'right', arms: ['down', 'type1'], ...extra })),
      rects(clawd({ face: 'right', arms: ['down', 'type2'], ...extra })),
      rects(clawd({ face: 'right', arms: ['down', 'type1'], eyes: 'blink', ...extra })),
    ];
  }

  // 字节或信号的小标签。size 是字号（格），等宽字体每个字约 0.6 个字号宽
  function chip(x, y, s, kind = 'byte', size = 2.8) {
    const w = s.length * size * 0.6 + 2, h = size + 1.4;
    const [bg, fg, bd] = kind === 'sig' ? ['#d97757', '#ffffff', '#d97757'] : kind === 'back' ? ['#ffffff', '#3d3c38', '#7a9cc6'] : ['#ffffff', '#3d3c38', '#d97757'];
    return `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="0.8" fill="${bg}" stroke="${bd}" stroke-width="0.4" shape-rendering="geometricPrecision"/>`
      + T(x, y + size * 0.36, s, size, fg, 'text-anchor="middle" font-weight="600"');
  }

  // 进程画成一个带眼睛的小方盒
  function proc(x, y, name, eyes = 'open', dim = false) {
    const c = dim ? 'L' : 'm';
    let s = R(x, y, 14, 11, c) + R(x + 1, y + 1, 12, 9, dim ? 'p' : 'w') + R(x + 3, y + 11, 2, 2, c) + R(x + 9, y + 11, 2, 2, c);
    const e = dim ? 'm' : 'k';
    if (eyes === 'closed') s += R(x + 3, y + 5, 3, 1, e) + R(x + 8, y + 5, 3, 1, e);
    else if (eyes === 'wide') s += R(x + 3, y + 3, 2, 3, e) + R(x + 9, y + 3, 2, 3, e);
    else s += R(x + 3, y + 4, 2, 2, e) + R(x + 9, y + 4, 2, 2, e);
    return s + T(x + 7, y - 1.2, name, 2.6, dim ? 'm' : 'n', 'text-anchor="middle"');
  }

  window.Clawd = { PAL, clawd, art, rects, R, T, every, sprite, reduce, TYPE_SEQ, typingFrames, chip, proc };
})();
