const grid = document.getElementById('grid');

function drawCreasePart(ctx, pos, isHorizontal, w, h, strength, isHighlight, angle) {
  const len = (isHorizontal ? w : h) * 1.6;
  const hlOpacity = Math.min(1, 1.1 * strength);
  const shOpacity = Math.min(1, 0.75 * strength);
  const spread = Math.round(18 * strength);

  ctx.save();
  ctx.translate(isHorizontal ? w / 2 : pos, isHorizontal ? pos : h / 2);
  ctx.rotate(angle);

  if (isHorizontal) {
    if (isHighlight) {
      const hl = ctx.createLinearGradient(0, -5, 0, 2);
      hl.addColorStop(0, 'rgba(255,255,255,0)');
      hl.addColorStop(0.5, `rgba(255,255,255,${hlOpacity})`);
      hl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hl;
      ctx.fillRect(-len / 2, -5, len, 7);
    } else {
      const sh = ctx.createLinearGradient(0, 1, 0, spread);
      sh.addColorStop(0, `rgba(0,0,0,${shOpacity})`);
      sh.addColorStop(0.4, `rgba(0,0,0,${shOpacity * 0.35})`);
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(-len / 2, 1, len, spread);
    }
  } else {
    if (isHighlight) {
      const hl = ctx.createLinearGradient(-5, 0, 2, 0);
      hl.addColorStop(0, 'rgba(255,255,255,0)');
      hl.addColorStop(0.5, `rgba(255,255,255,${hlOpacity})`);
      hl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hl;
      ctx.fillRect(-5, -len / 2, 7, len);
    } else {
      const sh = ctx.createLinearGradient(1, 0, spread, 0);
      sh.addColorStop(0, `rgba(0,0,0,${shOpacity})`);
      sh.addColorStop(0.4, `rgba(0,0,0,${shOpacity * 0.35})`);
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(1, -len / 2, spread, len);
    }
  }

  ctx.restore();
}

function generateFoldTextures() {
  const w = 400, h = 600;

  const patterns = [
    { h: [1/3, 2/3], v: [1/2] },
    { h: [1/4, 1/2, 3/4], v: [1/2] },
  ];
  const pat = patterns[Math.floor(Math.random() * patterns.length)];

  // Pre-generate all random parameters so both canvases are spatially aligned
  const hPos = pat.h.map(t => h * t + (Math.random() - 0.5) * 6);
  const vPos = pat.v.map(t => w * t + (Math.random() - 0.5) * 6);
  const hBounds = [0, ...hPos, h];
  const vBounds = [0, ...vPos, w];

  const sectionData = hBounds.slice(0, -1).map(() =>
    vBounds.slice(0, -1).map(() => ({
      angle: Math.random() * Math.PI * 2,
      intensity: 0.12 + Math.random() * 0.14,
    }))
  );
  const hAngles = hPos.map(() => (Math.random() - 0.5) * 0.04);
  const vAngles = vPos.map(() => (Math.random() - 0.5) * 0.04);

  function buildCanvas(isHighlight) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');

    // Black = neutral for screen; white = neutral for multiply
    ctx.fillStyle = isHighlight ? '#000' : '#fff';
    ctx.fillRect(0, 0, w, h);

    // Grain (near-neutral for each respective blend mode)
    const id = ctx.createImageData(w, h);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = isHighlight
        ? Math.floor(Math.random() * 22)
        : Math.floor(233 + Math.random() * 22);
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = Math.floor(Math.random() * 25 + 5);
    }
    ctx.putImageData(id, 0, 0);

    // Per-section diffraction: hl draws lit side, sh draws shadow side
    sectionData.forEach((row, ri) => row.forEach(({ angle, intensity }, ci) => {
      const x1 = vBounds[ci], y1 = hBounds[ri];
      const x2 = vBounds[ci + 1], y2 = hBounds[ri + 1];
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      const r = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) * 0.5;
      const dx = Math.cos(angle) * r, dy = Math.sin(angle) * r;
      const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
      if (isHighlight) {
        grad.addColorStop(0, `rgba(255,255,255,${intensity})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, `rgba(0,0,0,${intensity})`);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    }));

    // Fold crease lines
    hPos.forEach((pos, i) => drawCreasePart(ctx, pos, true,  w, h, 1,   isHighlight, hAngles[i]));
    vPos.forEach((pos, i) => drawCreasePart(ctx, pos, false, w, h, 2.2, isHighlight, vAngles[i]));

    return canvas.toDataURL('image/png');
  }

  return { hl: buildCanvas(true), sh: buildCanvas(false) };
}

function addTilt(card) {
  const sheen = document.createElement('div');
  sheen.className = 'card-sheen';
  card.appendChild(sheen);

  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;

    card.style.transition = 'transform 0.05s linear, box-shadow 0.05s linear';
    card.style.transform = `perspective(800px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg) scale(1.02)`;
    card.style.boxShadow = `${-x * 10}px ${y * 10}px 24px rgba(0,0,0,0.2)`;

    sheen.style.opacity = '1';
    sheen.style.background = `radial-gradient(circle at ${(0.5 - x) * 100}% ${(0.5 - y) * 100}%, rgba(255,255,255,0.12) 0%, transparent 65%)`;
  });

  card.addEventListener('mouseleave', () => {
    card.style.transition = 'transform 0.6s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.6s cubic-bezier(0.23, 1, 0.32, 1)';
    card.style.transform = '';
    card.style.boxShadow = '';
    sheen.style.opacity = '0';
  });
}

function render(list) {
  grid.innerHTML = '';
  list.forEach(movie => {
    const card = document.createElement('div');
    card.className = 'card movie-card';

    const imgWrap = document.createElement('div');
    imgWrap.className = 'poster-wrap';

    const img = document.createElement('img');
    img.className = 'card-image movie-poster';
    img.src = movie.poster;
    img.alt = movie.title;

    const textures = generateFoldTextures();

    const hlDiv = document.createElement('div');
    hlDiv.className = 'poster-texture poster-texture-hl';
    hlDiv.style.backgroundImage = `url(${textures.hl})`;

    const shDiv = document.createElement('div');
    shDiv.className = 'poster-texture poster-texture-sh';
    shDiv.style.backgroundImage = `url(${textures.sh})`;

    imgWrap.appendChild(img);
    imgWrap.appendChild(hlDiv);
    imgWrap.appendChild(shDiv);

    const info = document.createElement('div');
    info.className = 'card-info';

    const title = document.createElement('span');
    title.className = 'card-name';
    title.textContent = movie.title;

    const meta = document.createElement('span');
    meta.className = 'card-trade';
    meta.textContent = `${movie.director}, ${movie.year}`;

    info.appendChild(title);
    info.appendChild(meta);
    card.appendChild(imgWrap);
    card.appendChild(info);
    grid.appendChild(card);

    addTilt(card);
  });
}

render(movies);

// Controls
let grainEnabled = true;
let grainLevel = 0.45;
let darkBoost = 10;

function applyGrain() {
  const opacity = grainEnabled ? grainLevel : 0;
  const multiplier = 1 + darkBoost / 100;
  document.querySelectorAll('.poster-texture-hl').forEach(el => {
    el.style.opacity = Math.min(1, opacity * multiplier);
  });
  document.querySelectorAll('.poster-texture-sh').forEach(el => {
    el.style.opacity = opacity;
  });
}

const toggle     = document.getElementById('texture-toggle');
const slider     = document.getElementById('grain-slider');
const grainValue = document.getElementById('grain-value');
const darkSlider = document.getElementById('dark-slider');
const darkValue  = document.getElementById('dark-value');

toggle.addEventListener('click', () => {
  grainEnabled = !grainEnabled;
  toggle.classList.toggle('inactive', !grainEnabled);
  slider.disabled = !grainEnabled;
  darkSlider.disabled = !grainEnabled;
  applyGrain();
});

slider.addEventListener('input', () => {
  grainLevel = parseFloat(slider.value);
  grainValue.textContent = Math.round(grainLevel * 100) + '%';
  applyGrain();
});

darkSlider.addEventListener('input', () => {
  darkBoost = parseInt(darkSlider.value);
  darkValue.textContent = '+' + darkBoost + '%';
  applyGrain();
});
