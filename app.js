const grid = document.getElementById('grid');
const backdrop = document.getElementById('modal-backdrop');
const modalImage = document.getElementById('modal-image');
const modalName = document.getElementById('modal-name');
const modalTrade = document.getElementById('modal-trade');
const modalBio = document.getElementById('modal-bio');
const modalWorks = document.getElementById('modal-works');
const modalPrev = document.getElementById('modal-prev');
const modalNext = document.getElementById('modal-next');
const galleryStrip = document.getElementById('gallery-strip');
const galleryTrack = document.getElementById('gallery-track');
const galleryPrev = document.getElementById('gallery-prev');
const galleryNext = document.getElementById('gallery-next');
let currentIndex = 0;
let activePersonIndex = 0;

function buildNavTile(person) {
  const tile = document.createElement('div');

  const img = document.createElement('img');
  img.className = 'modal-nav-img';
  img.src = person.image;
  img.alt = person.name;

  const name = document.createElement('span');
  name.className = 'modal-nav-name';
  name.textContent = person.name;

  const trade = document.createElement('span');
  trade.className = 'modal-nav-trade';
  trade.textContent = person.trade;

  tile.appendChild(img);
  tile.appendChild(name);
  tile.appendChild(trade);
  return tile;
}

function openModal(person, index) {
  activePersonIndex = index;

  modalImage.src = person.image;
  modalImage.alt = person.name;
  modalName.textContent = person.name;
  modalTrade.textContent = person.trade;
  modalBio.textContent = person.bio || '';

  const works = person.works || [];

  modalWorks.innerHTML = '';
  works.forEach(src => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    modalWorks.appendChild(img);
  });

  galleryTrack.innerHTML = '';
  works.forEach(src => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    galleryTrack.appendChild(img);
  });
  galleryTrack.scrollLeft = 0;
  currentIndex = 0;

  // Prev tile
  modalPrev.innerHTML = '';
  const prevPerson = people[activePersonIndex - 1];
  if (prevPerson) {
    const tile = buildNavTile(prevPerson);
    tile.addEventListener('click', () => openModal(prevPerson, activePersonIndex - 1));
    modalPrev.appendChild(tile);
  }

  // Next tile
  modalNext.innerHTML = '';
  const nextPerson = people[activePersonIndex + 1];
  if (nextPerson) {
    const tile = buildNavTile(nextPerson);
    tile.addEventListener('click', () => openModal(nextPerson, activePersonIndex + 1));
    modalNext.appendChild(tile);
  }

  backdrop.classList.add('open');
  galleryStrip.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  backdrop.classList.remove('open');
  galleryStrip.classList.remove('open');
  document.body.style.overflow = '';
}

backdrop.addEventListener('click', (e) => {
  if (e.target === backdrop) closeModal();
});

document.getElementById('modal-close').addEventListener('click', closeModal);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'ArrowRight') scrollGallery(1);
  if (e.key === 'ArrowLeft') scrollGallery(-1);
});

function scrollToIndex(index) {
  const imgs = galleryTrack.querySelectorAll('img');
  if (!imgs.length) return;
  currentIndex = Math.max(0, Math.min(index, imgs.length - 1));
  imgs[currentIndex].scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
}

function scrollGallery(direction) {
  scrollToIndex(currentIndex + direction);
}

galleryPrev.addEventListener('click', () => scrollGallery(-1));
galleryNext.addEventListener('click', () => scrollGallery(1));

function addTilt(card) {
  const sheen = document.createElement('div');
  sheen.className = 'card-sheen';
  card.appendChild(sheen);

  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;

    card.style.transition = 'transform 0.05s linear, box-shadow 0.05s linear';
    card.style.transform = `perspective(800px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg) scale(1.03)`;
    card.style.boxShadow = `${-x * 10}px ${y * 10}px 24px rgba(0,0,0,0.2)`;

    sheen.style.opacity = '1';
    sheen.style.background = `radial-gradient(circle at ${(x + 0.5) * 100}% ${(y + 0.5) * 100}%, rgba(255,255,255,0.12) 0%, transparent 65%)`;
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
  list.forEach((person, index) => {
    const card = document.createElement('div');
    card.className = 'card people-card';
    card.addEventListener('click', () => openModal(person, index));

    const img = document.createElement('img');
    img.className = 'card-image';
    img.src = person.image;
    img.alt = person.name;

    const info = document.createElement('div');
    info.className = 'card-info';

    const name = document.createElement('span');
    name.className = 'card-name';
    name.textContent = person.name;

    const trade = document.createElement('span');
    trade.className = 'card-trade';
    trade.textContent = person.trade;

    info.appendChild(name);
    info.appendChild(trade);
    card.appendChild(img);
    card.appendChild(info);
    grid.appendChild(card);

    addTilt(card);
  });
}

render(people);
