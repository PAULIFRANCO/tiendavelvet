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
  const navDropdown = document.getElementById('navDropdown');
  navDropdown.innerHTML = data.map(c => `<a href="#categorias" data-filter="${c.slug}">${c.name}</a>`).join('');

  // El footer muestra las mismas categorías reales (nunca texto fijo a mano,
  // para que no se desactualice si cambian las categorías del catálogo).
  const footerCategories = document.getElementById('footerCategories');
  if (footerCategories) {
    footerCategories.innerHTML = data.map(c => `<a href="#categorias" data-filter="${c.slug}">${c.name}</a>`).join('');
  }
}
loadCategories();

async function loadProducts() {
  const supabase = await getSupabase();
  const [{ data, error }, { data: variantsData, error: variantsError }] = await Promise.all([
    supabase.from('products').select('*').order('id'),
    supabase.from('product_variants').select('*'),
  ]);
  if (error) {
    console.error('Error al cargar productos:', error);
    return;
  }
  if (variantsError) console.error('Error al cargar variantes:', variantsError);

  PRODUCTS = data.map(p => {
    const variants = (variantsData || []).filter(v => v.product_id === p.id);
    const hasVariants = variants.length > 0;
    return {
      id: p.id,
      name: p.name,
      cat: p.cat,
      price: p.price,
      oldPrice: p.old_price,
      badge: p.badge,
      color: p.color,
      image: p.image_url,
      // Si el producto tiene talles/colores cargados, el stock real que
      // importa para saber si hay algo disponible es la suma de sus
      // variantes, no el número viejo de "Stock" del producto.
      stock: hasVariants ? variants.reduce((s, v) => s + v.stock, 0) : p.stock,
      // El "+" rápido de la tarjeta no alcanza para estos: hay que elegir
      // talle/color en la ficha del producto.
      hasVariants,
    };
  });
  renderProducts();
}

function loadCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(CART_KEY));
    if (!Array.isArray(stored)) return [];
    // Carritos guardados antes de que existieran los talles/colores no
    // tienen "key" — se la completamos para que sigan funcionando.
    return stored.map(item => ({
      variantId: null,
      variantLabel: '',
      ...item,
      key: item.key || `${item.id}::${item.variantId ?? ''}`,
    }));
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
        <a href="producto.html?id=${p.id}" class="product-card__img-link">
          ${p.image
            ? `<img src="${p.image}" alt="${p.name}" loading="lazy">`
            : `<div class="img-fallback" style="background:${p.color}"></div>`}
        </a>
      </div>
      <div class="product-card__body">
        <a href="producto.html?id=${p.id}" class="product-card__title-link">
          <span class="product-cat">${CATEGORIES.find(c => c.slug === p.cat)?.name || p.cat}</span>
          <h3>${p.name}</h3>
        </a>
        <div class="product-price-row">
          <span class="product-price">${p.oldPrice ? `<small>${fmt(p.oldPrice)}</small>` : ''}${fmt(p.price)}</span>
          ${p.hasVariants
            ? `<a href="producto.html?id=${p.id}" class="add-btn" aria-label="Elegir talle y color">⋯</a>`
            : `<button class="add-btn" data-add="${p.id}" aria-label="Agregar al carrito" ${outOfStock ? 'disabled' : ''}>+</button>`}
        </div>
      </div>
    </div>
  `;
  }).join('');
}
loadProducts();

// ==================== FILTERS ====================
// Los links del desplegable del nav y del footer filtran el catálogo y
// llevan a la sección (el scroll lo hace el propio href="#categorias").
function handleCategoryLinkClick(e) {
  const link = e.target.closest('a[data-filter]');
  if (link) {
    activeFilter = link.dataset.filter;
    renderProducts();
  }
}
document.getElementById('navDropdown').addEventListener('click', handleCategoryLinkClick);
document.getElementById('footerCategories').addEventListener('click', handleCategoryLinkClick);

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

// El carrito puede tener el mismo producto varias veces con distinto talle/
// color: cada combinación es un renglón aparte, identificado por esta clave.
const cartKey = (id, variantId) => `${id}::${variantId ?? ''}`;

function addToCart(id) {
  const product = PRODUCTS.find(p => p.id === id);
  if (!product || product.stock <= 0) {
    showToast('Producto sin stock');
    return;
  }
  const key = cartKey(id, null);
  const existing = cart.find(i => i.key === key);
  const qtyInCart = existing ? existing.qty : 0;
  if (qtyInCart + 1 > product.stock) {
    showToast('No hay más stock disponible');
    return;
  }
  if (existing) {
    existing.qty++;
  } else {
    cart.push({ ...product, variantId: null, variantLabel: '', key, qty: 1 });
  }
  saveCart();
  renderCart();
  showToast(`${product.name} agregado al carrito`);
  openCart();
}

function changeQty(key, delta) {
  const item = cart.find(i => i.key === key);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(i => i.key !== key);
  saveCart();
  renderCart();
}

function removeFromCart(key) {
  cart = cart.filter(i => i.key !== key);
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
    <div class="cart-item" data-key="${item.key}">
      <div class="cart-item__img" style="${item.image ? `background-image:url('${item.image}');background-size:cover;background-position:center;` : `background:${item.color}`}"></div>
      <div class="cart-item__info">
        <h4>${item.name}</h4>
        <span>${item.cat}${item.variantLabel ? ` · ${item.variantLabel}` : ''}</span>
        <div class="cart-item__row">
          <div class="qty-control">
            <button data-qty="minus" data-key="${item.key}">−</button>
            <span>${item.qty}</span>
            <button data-qty="plus" data-key="${item.key}">+</button>
          </div>
          <span class="cart-item__price">${fmt(item.qty * item.price)}</span>
        </div>
        <button class="cart-item__remove" data-remove="${item.key}">Eliminar</button>
      </div>
    </div>
  `).join('');
}

renderCart();

cartItemsEl.addEventListener('click', e => {
  const qtyBtn = e.target.closest('[data-qty]');
  if (qtyBtn) {
    changeQty(qtyBtn.dataset.key, qtyBtn.dataset.qty === 'plus' ? 1 : -1);
    return;
  }
  const removeBtn = e.target.closest('[data-remove]');
  if (removeBtn) removeFromCart(removeBtn.dataset.remove);
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

// Si llegamos desde "Ver carrito" en la página de un producto, abrimos el
// carrito automáticamente al cargar.
if (new URLSearchParams(location.search).get('cart') === '1') {
  openCart();
  history.replaceState(null, '', location.pathname + location.hash);
}

const checkoutBtn = document.getElementById('checkoutBtn');
const checkoutOverlay = document.getElementById('checkoutOverlay');
const checkoutModal = document.getElementById('checkoutModal');
const checkoutForm = document.getElementById('checkoutForm');
const checkoutSubmitBtn = document.getElementById('checkoutSubmitBtn');

// Mismas reglas que api/create-preference.js — esto es solo una vista previa
// para la clienta; el costo real y definitivo siempre se calcula en el servidor.
const FREE_SHIPPING_THRESHOLD = 100000;
const SHIPPING_SANTA_FE = 3000;
const SHIPPING_OTHER = 10000;

function updateShippingSummary() {
  const province = document.getElementById('shipProvince').value.trim();
  const summaryEl = document.getElementById('shippingSummary');
  const subtotal = cart.reduce((s, i) => s + i.qty * i.price, 0);

  if (!province) {
    summaryEl.textContent = '';
    return;
  }
  const isSantaFe = /santa\s*fe/i.test(province);
  const cost = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : (isSantaFe ? SHIPPING_SANTA_FE : SHIPPING_OTHER);
  summaryEl.innerHTML = cost === 0
    ? `Envío: <strong>¡Gratis! 🎉</strong> &nbsp;·&nbsp; Total: <strong>${fmt(subtotal)}</strong>`
    : `Envío a ${isSantaFe ? 'Santa Fe' : 'resto del país'}: <strong>${fmt(cost)}</strong> &nbsp;·&nbsp; Total: <strong>${fmt(subtotal + cost)}</strong>`;
}
document.getElementById('shipProvince').addEventListener('input', updateShippingSummary);

function openCheckout() {
  closeCart();
  checkoutOverlay.classList.add('active');
  checkoutModal.classList.add('active');
  updateShippingSummary();
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
        items: cart.map(item => ({ id: item.id, qty: item.qty, variantId: item.variantId })),
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
