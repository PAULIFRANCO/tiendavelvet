import { getSupabase } from './data/supabase-client.js';

const fmt = n => '$' + Number(n).toLocaleString('es-AR');
const CART_KEY = 'velvet_cart';
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

function loadCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(CART_KEY));
    if (!Array.isArray(stored)) return [];
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

function sortSizes(sizes) {
  return [...sizes].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a);
    const ib = SIZE_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
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
  const [{ data: product, error }, { data: categories }, { data: variants }] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).single(),
    supabase.from('categories').select('*'),
    supabase.from('product_variants').select('*').eq('product_id', id),
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

  document.getElementById('pdLoading').hidden = true;
  document.getElementById('pdContent').hidden = false;

  // ==================== TALLE / COLOR ====================
  const hasVariants = (variants || []).length > 0;
  const hasSize = hasVariants && variants.some(v => v.size);
  const hasColor = hasVariants && variants.some(v => v.color);
  const sizes = hasSize ? sortSizes([...new Set(variants.map(v => v.size).filter(Boolean))]) : [];

  let selectedSize = hasSize ? sizes[0] : null;
  let selectedColor = null;

  function colorsForSize(size) {
    return [...new Set(
      variants
        .filter(v => !hasSize || v.size === size)
        .map(v => v.color)
        .filter(Boolean)
    )];
  }
  function findVariant(size, color) {
    return variants.find(v => (v.size || null) === (size || null) && (v.color || null) === (color || null));
  }

  if (hasColor) selectedColor = colorsForSize(selectedSize)[0] || null;

  const variantsEl = document.getElementById('pdVariants');
  const stockEl = document.getElementById('pdStock');
  const qtyValueEl = document.getElementById('pdQtyValue');
  const addBtn = document.getElementById('pdAddBtn');
  let qty = 1;

  function currentVariant() {
    if (!hasVariants) return null;
    return findVariant(selectedSize, selectedColor);
  }

  function currentStock() {
    const variant = currentVariant();
    return hasVariants ? (variant ? variant.stock : 0) : product.stock;
  }

  function renderQty() {
    qtyValueEl.textContent = qty;
  }

  function renderVariantPickers() {
    let html = '';
    if (hasSize) {
      html += `<div class="pd-variant-group">
        <span class="pd-variant-label">Talle</span>
        <div class="pd-variant-pills" data-group="size">
          ${sizes.map(s => `<button type="button" class="pd-pill${s === selectedSize ? ' active' : ''}" data-size="${s}">${s}</button>`).join('')}
        </div>
      </div>`;
    }
    if (hasColor) {
      const colors = colorsForSize(selectedSize);
      html += `<div class="pd-variant-group">
        <span class="pd-variant-label">Color</span>
        <div class="pd-variant-pills" data-group="color">
          ${colors.map(c => `<button type="button" class="pd-pill${c === selectedColor ? ' active' : ''}" data-color="${c}">${c}</button>`).join('')}
        </div>
      </div>`;
    }
    variantsEl.innerHTML = html;
  }

  function refreshStockUI() {
    qty = 1;
    renderQty();
    const stock = currentStock();
    const outOfStock = stock <= 0;
    stockEl.textContent = outOfStock ? 'Sin stock por el momento' : `${stock} disponibles`;
    stockEl.classList.toggle('pd-stock--out', outOfStock);
    addBtn.disabled = outOfStock;
    addBtn.textContent = outOfStock ? 'Sin stock' : 'Agregar al carrito';
  }

  if (hasVariants) {
    renderVariantPickers();
    variantsEl.addEventListener('click', e => {
      const sizeBtn = e.target.closest('[data-size]');
      if (sizeBtn) {
        selectedSize = sizeBtn.dataset.size;
        if (hasColor) {
          const colors = colorsForSize(selectedSize);
          if (!colors.includes(selectedColor)) selectedColor = colors[0] || null;
        }
        renderVariantPickers();
        refreshStockUI();
        return;
      }
      const colorBtn = e.target.closest('[data-color]');
      if (colorBtn) {
        selectedColor = colorBtn.dataset.color;
        renderVariantPickers();
        refreshStockUI();
      }
    });
  }

  refreshStockUI();

  document.getElementById('pdQtyMinus').addEventListener('click', () => {
    if (qty > 1) { qty--; renderQty(); }
  });
  document.getElementById('pdQtyPlus').addEventListener('click', () => {
    if (qty < currentStock()) { qty++; renderQty(); }
    else showToast('No hay más stock disponible');
  });

  addBtn.addEventListener('click', () => {
    const variant = currentVariant();
    if (hasVariants && !variant) {
      showToast('Elegí talle y color');
      return;
    }
    const stock = currentStock();
    const variantId = variant ? variant.id : null;
    const variantLabel = variant ? [variant.size, variant.color].filter(Boolean).join(' / ') : '';
    const key = `${product.id}::${variantId ?? ''}`;

    const cart = loadCart();
    const existing = cart.find(i => i.key === key);
    const qtyInCart = existing ? existing.qty : 0;

    if (qtyInCart + qty > stock) {
      showToast('No hay más stock disponible');
      return;
    }

    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({
        id: product.id,
        variantId,
        variantLabel,
        key,
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
