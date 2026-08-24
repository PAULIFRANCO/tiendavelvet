// ==================== DATA ====================
import { getSupabase } from './data/supabase-client.js';

const fmt = n => '$' + n.toLocaleString('es-AR');
const CART_KEY = 'velvet_cart';

// ==================== STATE ====================
let cart = loadCart();
let activeFilter = 'all';
let PRODUCTS = [];
let CATEGORIES = [];

async function loadCategories() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('categories').select('*').order('sort_order');
  if (error) {
    console.error('Error al cargar categorías:', error);
    return;
  }
  CATEGORIES = data;
  const catGrid = document.getElementById('catGrid');
  catGrid.innerHTML = data.map((c, i) => `
    <a href="#productos" class="cat-card ${i === 0 ? 'cat-card--big' : ''}" data-filter="${c.slug}">
      <div class="cat-card__img ${c.image_url ? '' : `cat-img-${(i % 5) + 1}`}"
        ${c.image_url ? `style="background-image:url('${c.image_url}');background-size:cover;background-position:center;"` : ''}></div>
      <div class="cat-card__label"><h3>${c.name}</h3><span>Ver más →</span></div>
    </a>
  `).join('');

  const navDropdown = document.getElementById('navDropdown');
  navDropdown.innerHTML = data.map(c => `<a href="#productos" data-filter="${c.slug}">${c.name}</a>`).join('');

  const filters = document.getElementById('filters');
  filters.querySelectorAll('.filter-btn:not([data-filter="all"])').forEach(b => b.remove());
  filters.insertAdjacentHTML('beforeend', data.map(c =>
    `<button class="filter-btn" data-filter="${c.slug}">${c.name}</button>`
  ).join(''));
}
loadCategories();

async function loadProducts() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('products').select('*').order('id');
  if (error) {
    console.error('Error al cargar productos:', error);
    return;
  }
  PRODUCTS = data.map(p => ({
    id: p.id,
    name: p.name,
    cat: p.cat,
    price: p.price,
    oldPrice: p.old_price,
    badge: p.badge,
    color: p.color,
    image: p.image_url,
    stock: p.stock,
  }));
  renderProducts();
}

function loadCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(CART_KEY));
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

// ==================== RENDER PRODUCTS ====================
const productGrid = document.getElementById('productGrid');

function renderProducts() {
  const list = activeFilter === 'all' ? PRODUCTS : PRODUCTS.filter(p => p.cat === activeFilter);
  productGrid.innerHTML = list.map(p => {
    const outOfStock = p.stock <= 0;
    return `
    <div class="product-card" data-id="${p.id}">
      <div class="product-card__img">
        ${p.badge && !outOfStock ? `<span class="product-badge">${p.badge}</span>` : ''}
        ${outOfStock ? `<span class="product-badge product-badge--out">SIN STOCK</span>` : ''}
        <button class="product-fav" data-fav="${p.id}" aria-label="Favorito">♡</button>
        ${p.image
          ? `<img src="${p.image}" alt="${p.name}" loading="lazy">`
          : `<div class="img-fallback" style="background:${p.color}"></div>`}
      </div>
      <div class="product-card__body">
        <span class="product-cat">${CATEGORIES.find(c => c.slug === p.cat)?.name || p.cat}</span>
        <h3>${p.name}</h3>
        <div class="product-price-row">
          <span class="product-price">${p.oldPrice ? `<small>${fmt(p.oldPrice)}</small>` : ''}${fmt(p.price)}</span>
          <button class="add-btn" data-add="${p.id}" aria-label="Agregar al carrito" ${outOfStock ? 'disabled' : ''}>+</button>
        </div>
      </div>
    </div>
  `;
  }).join('');
}
loadProducts();

// ==================== FILTERS ====================
document.getElementById('filters').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = btn.dataset.filter;
  renderProducts();
});

// Category cards (creadas dinámicamente) y links del desplegable del nav
// disparan un filtro + scroll (el scroll lo hace el propio href="#productos").
function applyCategoryFilter(filter) {
  activeFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === filter);
  });
  renderProducts();
}

document.getElementById('catGrid').addEventListener('click', e => {
  const card = e.target.closest('.cat-card');
  if (card) applyCategoryFilter(card.dataset.filter);
});

document.getElementById('navDropdown').addEventListener('click', e => {
  const link = e.target.closest('a[data-filter]');
  if (link) applyCategoryFilter(link.dataset.filter);
});

// ==================== FAVORITES ====================
productGrid.addEventListener('click', e => {
  const favBtn = e.target.closest('[data-fav]');
  if (favBtn) {
    favBtn.classList.toggle('active');
    favBtn.textContent = favBtn.classList.contains('active') ? '♥' : '♡';
    return;
  }
  const addBtn = e.target.closest('[data-add]');
  if (addBtn) {
    const id = Number(addBtn.dataset.add);
    addToCart(id);
  }
});

// ==================== CART ====================
const cartPanel = document.getElementById('cartPanel');
const cartOverlay = document.getElementById('cartOverlay');
const cartItemsEl = document.getElementById('cartItems');
const cartCountEl = document.getElementById('cartCount');
const cartTotalEl = document.getElementById('cartTotal');

function addToCart(id) {
  const product = PRODUCTS.find(p => p.id === id);
  if (!product || product.stock <= 0) {
    showToast('Producto sin stock');
    return;
  }
  const existing = cart.find(i => i.id === id);
  const qtyInCart = existing ? existing.qty : 0;
  if (qtyInCart + 1 > product.stock) {
    showToast('No hay más stock disponible');
    return;
  }
  if (existing) {
    existing.qty++;
  } else {
    cart.push({ ...product, qty: 1 });
  }
  saveCart();
  renderCart();
  showToast(`${product.name} agregado al carrito`);
  openCart();
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
  saveCart();
  renderCart();
}

function removeFromCart(id) {
  cart = cart.filter(i => i.id !== id);
  saveCart();
  renderCart();
}

function renderCart() {
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);
  const totalPrice = cart.reduce((s, i) => s + i.qty * i.price, 0);
  cartCountEl.textContent = totalItems;
  cartTotalEl.textContent = fmt(totalPrice);

  if (cart.length === 0) {
    cartItemsEl.innerHTML = '<p class="cart-empty">Tu carrito está vacío</p>';
    return;
  }

  cartItemsEl.innerHTML = cart.map(item => `
    <div class="cart-item" data-id="${item.id}">
      <div class="cart-item__img" style="${item.image ? `background-image:url('${item.image}');background-size:cover;background-position:center;` : `background:${item.color}`}"></div>
      <div class="cart-item__info">
        <h4>${item.name}</h4>
        <span>${item.cat}</span>
        <div class="cart-item__row">
          <div class="qty-control">
            <button data-qty="minus" data-id="${item.id}">−</button>
            <span>${item.qty}</span>
            <button data-qty="plus" data-id="${item.id}">+</button>
          </div>
          <span class="cart-item__price">${fmt(item.qty * item.price)}</span>
        </div>
        <button class="cart-item__remove" data-remove="${item.id}">Eliminar</button>
      </div>
    </div>
  `).join('');
}

renderCart();

cartItemsEl.addEventListener('click', e => {
  const qtyBtn = e.target.closest('[data-qty]');
  if (qtyBtn) {
    const id = Number(qtyBtn.dataset.id);
    changeQty(id, qtyBtn.dataset.qty === 'plus' ? 1 : -1);
    return;
  }
  const removeBtn = e.target.closest('[data-remove]');
  if (removeBtn) removeFromCart(Number(removeBtn.dataset.remove));
});

function openCart() {
  cartPanel.classList.add('active');
  cartOverlay.classList.add('active');
}
function closeCart() {
  cartPanel.classList.remove('active');
  cartOverlay.classList.remove('active');
}

document.getElementById('cartToggle').addEventListener('click', openCart);
document.getElementById('cartClose').addEventListener('click', closeCart);
cartOverlay.addEventListener('click', closeCart);

const checkoutBtn = document.getElementById('checkoutBtn');
const checkoutOverlay = document.getElementById('checkoutOverlay');
const checkoutModal = document.getElementById('checkoutModal');
const checkoutForm = document.getElementById('checkoutForm');
const checkoutSubmitBtn = document.getElementById('checkoutSubmitBtn');

function openCheckout() {
  closeCart();
  checkoutOverlay.classList.add('active');
  checkoutModal.classList.add('active');
}
function closeCheckout() {
  checkoutOverlay.classList.remove('active');
  checkoutModal.classList.remove('active');
}

checkoutBtn.addEventListener('click', () => {
  if (cart.length === 0) {
    showToast('Tu carrito está vacío');
    return;
  }
  openCheckout();
});

document.getElementById('checkoutModalClose').addEventListener('click', closeCheckout);
checkoutOverlay.addEventListener('click', closeCheckout);

checkoutForm.addEventListener('submit', async e => {
  e.preventDefault();

  checkoutSubmitBtn.disabled = true;
  checkoutSubmitBtn.textContent = 'Procesando...';

  try {
    const res = await fetch('/api/create-preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: cart.map(item => ({ id: item.id, qty: item.qty })),
        payerEmail: document.getElementById('shipEmail').value.trim(),
        shipping: {
          fullName: document.getElementById('shipFullName').value.trim(),
          phone: document.getElementById('shipPhone').value.trim(),
          address: document.getElementById('shipAddress').value.trim(),
          city: document.getElementById('shipCity').value.trim(),
          province: document.getElementById('shipProvince').value.trim(),
          zip: document.getElementById('shipZip').value.trim(),
        },
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'create-preference failed');
    }

    const data = await res.json();
    window.location.href = data.init_point;
  } catch (err) {
    showToast(err.message === 'create-preference failed' || !err.message
      ? 'Hubo un problema al iniciar el pago. Intentá de nuevo.'
      : err.message);
    checkoutSubmitBtn.disabled = false;
    checkoutSubmitBtn.textContent = 'Continuar al pago';
  }
});

// ==================== SEARCH ====================
const searchBar = document.getElementById('searchBar');
document.getElementById('searchToggle').addEventListener('click', () => {
  searchBar.classList.toggle('active');
  if (searchBar.classList.contains('active')) {
    setTimeout(() => document.getElementById('searchInput').focus(), 200);
  }
});
document.getElementById('searchClose').addEventListener('click', () => searchBar.classList.remove('active'));

// ==================== MOBILE NAV ====================
const nav = document.getElementById('nav');
const hamburger = document.getElementById('hamburger');
hamburger.addEventListener('click', () => {
  nav.classList.toggle('active');
  hamburger.classList.toggle('active');
});
document.querySelectorAll('.nav__link').forEach(link => {
  link.addEventListener('click', () => nav.classList.remove('active'));
});

// ==================== HEADER HIDE ON SCROLL ====================
let lastScroll = 0;
const header = document.getElementById('header');
window.addEventListener('scroll', () => {
  const current = window.scrollY;
  if (current > 200 && current > lastScroll) {
    header.style.transform = 'translateY(-100%)';
  } else {
    header.style.transform = 'translateY(0)';
  }
  lastScroll = current;
});

// ==================== NEWSLETTER ====================
document.getElementById('newsletterForm').addEventListener('submit', e => {
  e.preventDefault();
  const email = document.getElementById('newsletterEmail').value;
  const msg = document.getElementById('newsletterMsg');
  msg.textContent = `¡Listo! Te suscribiste con ${email}`;
  document.getElementById('newsletterForm').reset();
  showToast('Suscripción exitosa 🎉');
});

// ==================== TOAST ====================
let toastTimer;
function showToast(text) {
  const toast = document.getElementById('toast');
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}
