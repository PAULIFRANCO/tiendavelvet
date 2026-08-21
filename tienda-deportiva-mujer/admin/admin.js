import { getSupabase } from '../data/supabase-client.js';

const fmt = n => '$' + Number(n).toLocaleString('es-AR');

const STATUS_LABELS = {
  approved: 'Aprobado',
  pending: 'Pendiente',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
  in_process: 'En proceso',
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
}

async function loadOrders(supabase) {
  const tbody = document.getElementById('ordersBody');
  tbody.innerHTML = '<tr><td colspan="5" class="admin-empty">Cargando pedidos...</td></tr>';

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = '<tr><td colspan="5" class="admin-empty">No se pudieron cargar los pedidos.</td></tr>';
    console.error(error);
    return;
  }

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="admin-empty">Todavía no hay pedidos.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(order => {
    const date = new Date(order.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
    const items = (order.items || []).map(i => `${i.quantity}x ${i.title}`).join(', ');
    const statusLabel = STATUS_LABELS[order.status] || order.status;
    return `
      <tr>
        <td>${date}</td>
        <td>${items}</td>
        <td>${fmt(order.total)}</td>
        <td><span class="status-tag status-${order.status}">${statusLabel}</span></td>
        <td>${order.payer_email || '—'}</td>
      </tr>
    `;
  }).join('');
}

async function loadProducts(supabase) {
  const tbody = document.getElementById('productsBody');
  tbody.innerHTML = '<tr><td colspan="6" class="admin-empty">Cargando productos...</td></tr>';

  const { data, error } = await supabase.from('products').select('*').order('id');

  if (error) {
    tbody.innerHTML = '<tr><td colspan="6" class="admin-empty">No se pudieron cargar los productos.</td></tr>';
    console.error(error);
    return;
  }

  tbody.innerHTML = data.map(p => `
    <tr data-id="${p.id}">
      <td>
        ${p.image_url
          ? `<img class="prod-thumb" src="${p.image_url}" alt="${p.name}">`
          : `<div class="prod-thumb prod-thumb--fallback" style="background:${p.color || '#e6e2db'}"></div>`}
      </td>
      <td>${p.name}</td>
      <td>${p.cat}</td>
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

      const ext = file.name.split('.').pop();
      const path = `product-${id}-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(path, file, { upsert: true });

      if (uploadError) {
        showToast('No se pudo subir la foto');
        console.error(uploadError);
        return;
      }

      const { data: publicData } = supabase.storage.from('product-images').getPublicUrl(path);
      const { error: updateError } = await supabase
        .from('products')
        .update({ image_url: publicData.publicUrl })
        .eq('id', id);

      if (updateError) {
        showToast('Foto subida pero no se pudo guardar');
        console.error(updateError);
        return;
      }

      showToast('Foto actualizada');
      loadProducts(supabase);
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
          ? `<img class="prod-thumb" src="${c.image_url}" alt="${c.name}">`
          : `<div class="prod-thumb prod-thumb--fallback"></div>`}
      </td>
      <td>${c.name}</td>
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

      const ext = file.name.split('.').pop();
      const path = `category-${slug}-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(path, file, { upsert: true });

      if (uploadError) {
        showToast('No se pudo subir la foto');
        console.error(uploadError);
        return;
      }

      const { data: publicData } = supabase.storage.from('product-images').getPublicUrl(path);
      const { error: updateError } = await supabase
        .from('categories')
        .update({ image_url: publicData.publicUrl })
        .eq('slug', slug);

      if (updateError) {
        showToast('Foto subida pero no se pudo guardar');
        console.error(updateError);
        return;
      }

      showToast('Foto actualizada');
      loadCategories(supabase);
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
