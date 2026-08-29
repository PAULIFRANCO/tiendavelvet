import { getSupabase } from './data/supabase-client.js';

const fmt = n => '$' + Number(n).toLocaleString('es-AR');
const CART_KEY = 'velvet_cart';

function loadCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(CART_KEY));
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}
function updateCartCount() {
  const cart = loadCart();
  const total = cart.reduce((s, i) => s + i.qty, 0);
  document.getElementById('cartCount').textContent = total;
}

let toastTimer;
function showToast(text) {
  const toast = document.getElementById('toast');
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

async function init() {
  updateCartCount();

  const id = Number(new URLSearchParams(location.search).get('id'));
  if (!id) {
    document.getElementById('pdLoading').hidden = true;
    document.getElementById('pdNotFound').hidden = false;
    return;
  }

  const supabase = await getSupabase();
  const [{ data: product, error }, { data: categories }] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).single(),
    supabase.from('categories').select('*'),
  ]);

  if (error || !product) {
    document.getElementById('pdLoading').hidden = true;
    document.getElementById('pdNotFound').hidden = false;
    return;
  }

  const catName = categories?.find(c => c.slug === product.cat)?.name || product.cat;
  document.title = `${product.name} — VELVET`;

  // Galería: foto principal + fotos extra (sin duplicar si coinciden)
  const images = [product.image_url, ...(product.images || [])].filter(Boolean);

  const mainImg = document.getElementById('pdMainImage');
  const mainWrap = document.getElementById('pdMainImageWrap');
  const thumbsEl = document.getElementById('pdThumbs');

  function setMainImage(src) {
    if (src) {
      mainImg.src = src;
      mainImg.alt = product.name;
      mainImg.hidden = false;
      mainWrap.style.background = '';
    } else {
      mainImg.hidden = true;
      mainWrap.style.background = product.color || 'var(--gray-light)';
    }
  }

  if (images.length > 0) {
    setMainImage(images[0]);
  } else {
    setMainImage(null);
  }

  if (images.length > 1) {
    thumbsEl.innerHTML = images.map((src, i) => `
      <button type="button" class="pd-thumb${i === 0 ? ' active' : ''}" data-src="${src}" aria-label="Ver foto ${i + 1}">
        <img src="${src}" alt="">
      </button>
    `).join('');
    thumbsEl.addEventListener('click', e => {
      const btn = e.target.closest('.pd-thumb');
      if (!btn) return;
      setMainImage(btn.dataset.src);
      thumbsEl.querySelectorAll('.pd-thumb').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
    });
  }

  document.getElementById('pdCat').textContent = catName;
  document.getElementById('pdName').textContent = product.name;

  const priceEl = document.getElementById('pdPrice');
  priceEl.innerHTML = product.old_price
    ? `<small>${fmt(product.old_price)}</small>${fmt(product.price)}`
    : fmt(product.price);

  if (product.badge) {
    const badgeEl = document.getElementById('pdBadge');
    badgeEl.textContent = product.badge;
    badgeEl.hidden = false;
  }

  const outOfStock = product.stock <= 0;
  const stockEl = document.getElementById('pdStock');
  stockEl.textContent = outOfStock ? 'Sin stock por el momento' : `${product.stock} disponibles`;
  stockEl.classList.toggle('pd-stock--out', outOfStock);

  document.getElementById('pdLoading').hidden = true;
  document.getElementById('pdContent').hidden = false;

  // ==================== CANTIDAD ====================
  let qty = 1;
  const qtyValueEl = document.getElementById('pdQtyValue');
  const addBtn = document.getElementById('pdAddBtn');

  function renderQty() {
    qtyValueEl.textContent = qty;
  }

  document.getElementById('pdQtyMinus').addEventListener('click', () => {
    if (qty > 1) { qty--; renderQty(); }
  });
  document.getElementById('pdQtyPlus').addEventListener('click', () => {
    if (qty < product.stock) { qty++; renderQty(); }
    else showToast('No hay más stock disponible');
  });

  if (outOfStock) {
    addBtn.disabled = true;
    addBtn.textContent = 'Sin stock';
  }

  addBtn.addEventListener('click', () => {
    const cart = loadCart();
    const existing = cart.find(i => i.id === product.id);
    const qtyInCart = existing ? existing.qty : 0;

    if (qtyInCart + qty > product.stock) {
      showToast('No hay más stock disponible');
      return;
    }

    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({
        id: product.id,
        name: product.name,
        cat: catName,
        price: product.price,
        image: product.image_url,
        color: product.color,
        qty,
      });
    }
    saveCart(cart);
    updateCartCount();
    showToast(`${product.name} agregado al carrito`);
  });
}

init();
