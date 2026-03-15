const grid = document.getElementById('grid');

function render(list) {
  grid.innerHTML = '';
  list.forEach(movie => {
    const card = document.createElement('div');
    card.className = 'card';

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
  });
}

render(movies);
