import { getSupabase } from '../data/supabase-client.js';

const fmt = n => '$' + Number(n).toLocaleString('es-AR');

// Los datos de envío los escribe cualquier visitante en el checkout público.
// Antes de mostrarlos acá con innerHTML, hay que neutralizar HTML/scripts
// para que una clienta no pueda ejecutar código en el navegador de la admin.
const escapeHtml = str => String(str ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadImageViaApi(supabase, file, path) {
  const { data: { session } } = await supabase.auth.getSession();
  const base64 = await fileToBase64(file);

  const res = await fetch('/api/upload-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({ path, base64, contentType: file.type }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'No se pudo subir la imagen');
  }

  const { url } = await res.json();
  return url;
}

const STATUS_LABELS = {
  approved: 'Aprobado',
  pending: 'Pendiente',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
  in_process: 'En proceso',
};

const FULFILLMENT_LABELS = {
  no_preparado: 'Sin preparar',
  preparando: 'Preparando',
  enviado: 'Enviado',
  entregado: 'Entregado',
};

const loginForm = document.getElementById('loginForm');
const ordersTable = document.getElementById('ordersTable');

if (loginForm) initLogin();
if (ordersTable) initDashboard();

async function initLogin() {
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    window.location.href = '/admin/dashboard.html';
    return;
  }

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');
    errorEl.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Ingresando...';

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      errorEl.textContent = 'Email o contraseña incorrectos.';
      btn.disabled = false;
      btn.textContent = 'Iniciar sesión';
      return;
    }
    window.location.href = '/admin/dashboard.html';
  });
}

async function initDashboard() {
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = '/admin/login.html';
    return;
  }

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/admin/login.html';
  });

  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  loadOrders(supabase);
  loadProducts(supabase);
  loadCategories(supabase);

  document.getElementById('refreshOrders').addEventListener('click', () => loadOrders(supabase));
  document.getElementById('refreshProducts').addEventListener('click', () => loadProducts(supabase));
  document.getElementById('refreshCategories').addEventListener('click', () => loadCategories(supabase));

  document.getElementById('newProductForm').addEventListener('submit', async e => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const name = document.getElementById('newProductName').value.trim();
    const cat = document.getElementById('newProductCat').value;
    const price = Math.max(0, Number(document.getElementById('newProductPrice').value) || 0);
    const stock = Math.max(0, Number(document.getElementById('newProductStock').value) || 0);

    if (!name || !cat) {
      showToast('Completá el nombre y la categoría');
      return;
    }

    submitBtn.disabled = true;
    const { error } = await supabase.from('products').insert({
      name,
      cat,
      price,
      stock,
      color: 'linear-gradient(135deg,#d6d1c4,#a89f8a)',
    });
    submitBtn.disabled = false;

    if (error) {
      showToast('No se pudo agregar el producto');
      console.error(error);
      return;
    }

    e.target.reset();
    showToast('Producto agregado');
    loadProducts(supabase);
  });
}

async function loadOrders(supabase) {
  const tbody = document.getElementById('ordersBody');
  tbody.innerHTML = '<tr><td colspan="7" class="admin-empty">Cargando pedidos...</td></tr>';

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = '<tr><td colspan="7" class="admin-empty">No se pudieron cargar los pedidos.</td></tr>';
    console.error(error);
    return;
  }

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="admin-empty">Todavía no hay pedidos.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(order => {
    const date = new Date(order.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
    const items = (order.items || []).map(i => `${escapeHtml(i.quantity)}x ${escapeHtml(i.title)}`).join(', ');
    const statusLabel = STATUS_LABELS[order.status] || order.status;
    const s = order.shipping;
    const customer = s
      ? `${escapeHtml(s.fullName)}<br><span style="color:var(--gray);font-size:0.78rem;">${escapeHtml(order.payer_email || '')}${s.phone ? ' · ' + escapeHtml(s.phone) : ''}</span>`
      : escapeHtml(order.payer_email || '—');
    const address = s
      ? `${escapeHtml(s.address)}<br><span style="color:var(--gray);font-size:0.78rem;">${escapeHtml(s.city)}, ${escapeHtml(s.province)} (${escapeHtml(s.zip)})</span>`
      : '—';
    const fulfillment = order.fulfillment_status || 'no_preparado';

    return `
      <tr data-order-id="${order.id}">
        <td>${date}</td>
        <td>${customer}</td>
        <td>${address}</td>
        <td>${items}</td>
        <td>${fmt(order.total)}</td>
        <td><span class="status-tag status-${order.status}">${statusLabel}</span></td>
        <td>
          <select class="fulfillment-select" data-order-fulfillment="${order.id}">
            ${Object.entries(FULFILLMENT_LABELS).map(([value, label]) =>
              `<option value="${value}" ${value === fulfillment ? 'selected' : ''}>${label}</option>`
            ).join('')}
          </select>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-order-fulfillment]').forEach(select => {
    select.addEventListener('change', async () => {
      const orderId = select.dataset.orderFulfillment;
      const fulfillmentStatus = select.value;
      select.disabled = true;

      const { data: { session } } = await supabase.auth.getSession();
      try {
        const res = await fetch('/api/notify-order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ orderId, fulfillmentStatus }),
        });
        if (!res.ok) throw new Error();
        showToast('Pedido actualizado y clienta notificada por email');
      } catch {
        showToast('No se pudo actualizar el pedido');
      } finally {
        select.disabled = false;
      }
    });
  });
}

async function fetchCategories(supabase) {
  const { data, error } = await supabase.from('categories').select('*').order('sort_order');
  if (error) {
    console.error(error);
    return [];
  }
  return data;
}

function fillCategorySelect(select, categories, selectedSlug) {
  select.innerHTML = categories.map(c =>
    `<option value="${c.slug}">${escapeHtml(c.name)}</option>`
  ).join('');
  if (selectedSlug) select.value = selectedSlug;
}

async function loadProducts(supabase) {
  const tbody = document.getElementById('productsBody');
  tbody.innerHTML = '<tr><td colspan="6" class="admin-empty">Cargando productos...</td></tr>';

  const [{ data, error }, categories] = await Promise.all([
    supabase.from('products').select('*').order('id'),
    fetchCategories(supabase),
  ]);

  const newProductCat = document.getElementById('newProductCat');
  if (newProductCat) fillCategorySelect(newProductCat, categories);

  if (error) {
    tbody.innerHTML = '<tr><td colspan="6" class="admin-empty">No se pudieron cargar los productos.</td></tr>';
    console.error(error);
    return;
  }

  tbody.innerHTML = data.map(p => `
    <tr data-id="${p.id}">
      <td>
        ${p.image_url
          ? `<img class="prod-thumb" src="${p.image_url}" alt="${escapeHtml(p.name)}">`
          : `<div class="prod-thumb prod-thumb--fallback" style="background:${p.color || '#e6e2db'}"></div>`}
      </td>
      <td><input type="text" class="stock-input name-input" data-name="${p.id}" value="${escapeHtml(p.name)}"></td>
      <td><select class="fulfillment-select" data-cat="${p.id}"></select></td>
      <td><input type="text" inputmode="numeric" pattern="[0-9]*" class="stock-input" data-price="${p.id}" value="${p.price}"></td>
      <td><input type="text" inputmode="numeric" pattern="[0-9]*" class="stock-input" data-stock="${p.id}" value="${p.stock}"></td>
      <td>
        <label class="file-label">
          Subir foto
          <input type="file" accept="image/*" data-upload="${p.id}">
        </label>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-cat]').forEach(select => {
    const id = Number(select.dataset.cat);
    const product = data.find(p => p.id === id);
    fillCategorySelect(select, categories, product?.cat);
    select.addEventListener('change', async () => {
      const { error } = await supabase.from('products').update({ cat: select.value }).eq('id', id);
      showToast(error ? 'No se pudo actualizar la categoría' : 'Categoría actualizada');
    });
  });

  tbody.querySelectorAll('[data-name]').forEach(input => {
    input.addEventListener('change', async () => {
      const id = Number(input.dataset.name);
      const newName = input.value.trim();
      if (!newName) { showToast('El nombre no puede quedar vacío'); return; }
      const { error } = await supabase.from('products').update({ name: newName }).eq('id', id);
      showToast(error ? 'No se pudo actualizar el nombre' : 'Nombre actualizado');
    });
  });

  tbody.querySelectorAll('[data-stock]').forEach(input => {
    input.addEventListener('change', async () => {
      const id = Number(input.dataset.stock);
      const newStock = Math.max(0, Number(input.value) || 0);
      input.value = newStock;
      const { error } = await supabase.from('products').update({ stock: newStock }).eq('id', id);
      showToast(error ? 'No se pudo actualizar el stock' : 'Stock actualizado');
    });
  });

  tbody.querySelectorAll('[data-price]').forEach(input => {
    input.addEventListener('change', async () => {
      const id = Number(input.dataset.price);
      const newPrice = Math.max(0, Number(input.value) || 0);
      input.value = newPrice;
      const { error } = await supabase.from('products').update({ price: newPrice }).eq('id', id);
      showToast(error ? 'No se pudo actualizar el precio' : 'Precio actualizado');
    });
  });

  tbody.querySelectorAll('[data-upload]').forEach(input => {
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const id = Number(input.dataset.upload);
      showToast('Subiendo foto...');

      try {
        const ext = file.name.split('.').pop();
        const path = `product-${id}-${Date.now()}.${ext}`;
        const url = await uploadImageViaApi(supabase, file, path);

        const { error: updateError } = await supabase
          .from('products')
          .update({ image_url: url })
          .eq('id', id);

        if (updateError) throw updateError;

        showToast('Foto actualizada');
        loadProducts(supabase);
      } catch (err) {
        showToast('No se pudo subir la foto');
        console.error(err);
      }
    });
  });
}

async function loadCategories(supabase) {
  const tbody = document.getElementById('categoriesBody');
  tbody.innerHTML = '<tr><td colspan="3" class="admin-empty">Cargando categorías...</td></tr>';

  const { data, error } = await supabase.from('categories').select('*').order('sort_order');

  if (error) {
    tbody.innerHTML = '<tr><td colspan="3" class="admin-empty">No se pudieron cargar las categorías.</td></tr>';
    console.error(error);
    return;
  }

  tbody.innerHTML = data.map(c => `
    <tr data-slug="${c.slug}">
      <td>
        ${c.image_url
          ? `<img class="prod-thumb" src="${c.image_url}" alt="${escapeHtml(c.name)}">`
          : `<div class="prod-thumb prod-thumb--fallback"></div>`}
      </td>
      <td>${escapeHtml(c.name)}</td>
      <td>
        <label class="file-label">
          Subir foto
          <input type="file" accept="image/*" data-cat-upload="${c.slug}">
        </label>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-cat-upload]').forEach(input => {
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const slug = input.dataset.catUpload;
      showToast('Subiendo foto...');

      try {
        const ext = file.name.split('.').pop();
        const path = `category-${slug}-${Date.now()}.${ext}`;
        const url = await uploadImageViaApi(supabase, file, path);

        const { error: updateError } = await supabase
          .from('categories')
          .update({ image_url: url })
          .eq('slug', slug);

        if (updateError) throw updateError;

        showToast('Foto actualizada');
        loadCategories(supabase);
      } catch (err) {
        showToast('No se pudo subir la foto');
        console.error(err);
      }
    });
  });
}

let toastTimer;
function showToast(text) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}
