const grid = document.getElementById('grid');

function drawCrease(ctx, pos, isHorizontal, w, h, strength = 1) {
  const len = (isHorizontal ? w : h) * 1.6;
  const spread = Math.round(18 * strength);
  const hlOpacity = Math.min(1, 0.92 * strength);
  const shOpacity = Math.min(1, 0.6 * strength);
  const angle = (Math.random() - 0.5) * 0.04;

  ctx.save();
  ctx.translate(isHorizontal ? w / 2 : pos, isHorizontal ? pos : h / 2);
  ctx.rotate(angle);

  if (isHorizontal) {
    // Gradient runs top → bottom (perpendicular to horizontal crease)
    const hl = ctx.createLinearGradient(0, -5, 0, 2);
    hl.addColorStop(0, 'rgba(255,255,255,0)');
    hl.addColorStop(0.5, `rgba(255,255,255,${hlOpacity})`);
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(-len / 2, -5, len, 7);

    const sh = ctx.createLinearGradient(0, 1, 0, spread);
    sh.addColorStop(0, `rgba(0,0,0,${shOpacity})`);
    sh.addColorStop(0.4, `rgba(0,0,0,${shOpacity * 0.35})`);
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(-len / 2, 1, len, spread);
  } else {
    // Gradient runs left → right (perpendicular to vertical crease)
    const hl = ctx.createLinearGradient(-5, 0, 2, 0);
    hl.addColorStop(0, 'rgba(255,255,255,0)');
    hl.addColorStop(0.5, `rgba(255,255,255,${hlOpacity})`);
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(-5, -len / 2, 7, len);

    const sh = ctx.createLinearGradient(1, 0, spread, 0);
    sh.addColorStop(0, `rgba(0,0,0,${shOpacity})`);
    sh.addColorStop(0.4, `rgba(0,0,0,${shOpacity * 0.35})`);
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(1, -len / 2, spread, len);
  }

  ctx.restore();
}

function generateFoldTexture() {
  const w = 400, h = 600;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Grain centered around mid-grey (neutral for overlay blend mode)
  const id = ctx.createImageData(w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.floor(128 + (Math.random() - 0.5) * 90);
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = Math.floor(Math.random() * 28 + 4);
  }
  ctx.putImageData(id, 0, 0);

  // Fold patterns that produce 6 or 8 rectangular sections
  const patterns = [
    { h: [1/3, 2/3],       v: [1/2] }, // 3 rows × 2 cols = 6
    { h: [1/4, 1/2, 3/4], v: [1/2] }, // 4 rows × 2 cols = 8
  ];
  const pattern = patterns[Math.floor(Math.random() * patterns.length)];

  // Slight positional imprecision makes folds feel hand-folded
  const jitter = () => (Math.random() - 0.5) * 6;

  pattern.h.forEach(t => drawCrease(ctx, h * t + jitter(), true,  w, h, 1));
  pattern.v.forEach(t => drawCrease(ctx, w * t + jitter(), false, w, h, 2.2));

  return canvas.toDataURL('image/png');
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

    const texture = document.createElement('div');
    texture.className = 'poster-texture';
    texture.style.backgroundImage = `url(${generateFoldTexture()})`;

    imgWrap.appendChild(img);
    imgWrap.appendChild(texture);

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

function applyGrain() {
  const opacity = grainEnabled ? grainLevel : 0;
  document.querySelectorAll('.poster-texture').forEach(el => {
    el.style.opacity = opacity;
  });
}

const toggle = document.getElementById('texture-toggle');
const slider = document.getElementById('grain-slider');

toggle.addEventListener('click', () => {
  grainEnabled = !grainEnabled;
  toggle.classList.toggle('inactive', !grainEnabled);
  slider.disabled = !grainEnabled;
  applyGrain();
});

slider.addEventListener('input', () => {
  grainLevel = parseFloat(slider.value);
  applyGrain();
});
