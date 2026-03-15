const grid = document.getElementById('grid');

function addTilt(card) {
  const sheen = document.createElement('div');
  sheen.className = 'card-sheen';
  card.appendChild(sheen);

  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;

    card.style.transition = 'transform 0.05s linear, box-shadow 0.05s linear';
    card.style.transform = `perspective(800px) rotateY(${x * 18}deg) rotateX(${-y * 18}deg) scale(1.03)`;
    card.style.boxShadow = `${-x * 16}px ${y * 16}px 32px rgba(0,0,0,0.22)`;

    sheen.style.opacity = '1';
    sheen.style.background = `radial-gradient(circle at ${(x + 0.5) * 100}% ${(y + 0.5) * 100}%, rgba(255,255,255,0.28) 0%, transparent 65%)`;
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

    const img = document.createElement('img');
    img.className = 'card-image movie-poster';
    img.src = movie.poster;
    img.alt = movie.title;

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
    card.appendChild(img);
    card.appendChild(info);
    grid.appendChild(card);

    addTilt(card);
  });
}

render(movies);
