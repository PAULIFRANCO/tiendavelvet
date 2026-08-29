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
  tbody.innerHTML = '<tr><td colspan="9" class="admin-empty">Cargando productos...</td></tr>';

  const [{ data, error }, categories, { data: allVariants, error: variantsError }] = await Promise.all([
    supabase.from('products').select('*').order('id'),
    fetchCategories(supabase),
    supabase.from('product_variants').select('*').order('id'),
  ]);

  const newProductCat = document.getElementById('newProductCat');
  if (newProductCat) fillCategorySelect(newProductCat, categories);

  if (error) {
    tbody.innerHTML = '<tr><td colspan="9" class="admin-empty">No se pudieron cargar los productos.</td></tr>';
    console.error(error);
    return;
  }
  if (variantsError) console.error('Error al cargar variantes:', variantsError);
  const variantsByProduct = id => (allVariants || []).filter(v => v.product_id === id);

  tbody.innerHTML = data.map(p => {
    const variants = variantsByProduct(p.id);
    return `
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
      <td>
        <div class="gallery-cell" data-gallery="${p.id}">
          ${(p.images || []).map((url, i) => `
            <div class="gallery-thumb">
              <img src="${url}" alt="Foto extra ${i + 1}">
              <button type="button" class="gallery-thumb__remove" data-remove-gallery="${p.id}" data-index="${i}" aria-label="Quitar foto">✕</button>
            </div>
          `).join('')}
          <label class="file-label file-label--small">
            + Agregar
            <input type="file" accept="image/*" data-upload-gallery="${p.id}">
          </label>
        </div>
      </td>
      <td>
        <button type="button" class="btn-link" data-toggle-variants="${p.id}">
          ${variants.length > 0 ? `Gestionar (${variants.length})` : 'Agregar talles'}
        </button>
      </td>
      <td>
        <button type="button" class="btn-link" data-toggle-details="${p.id}">
          ${p.description || (p.size_chart || []).length > 0 ? 'Editar detalles' : 'Agregar detalles'}
        </button>
      </td>
    </tr>
    <tr class="variants-row" data-variants-for="${p.id}" hidden>
      <td colspan="9">
        <div class="variants-panel">
          <table class="variants-table">
            <thead><tr><th>Talle</th><th>Color</th><th>Stock</th><th></th></tr></thead>
            <tbody data-variants-list="${p.id}">
              ${variants.map(v => `
                <tr data-variant-id="${v.id}">
                  <td>${escapeHtml(v.size || '—')}</td>
                  <td>${escapeHtml(v.color || '—')}</td>
                  <td><input type="text" inputmode="numeric" pattern="[0-9]*" class="stock-input variant-stock-input" data-variant-stock="${v.id}" value="${v.stock}"></td>
                  <td><button type="button" class="variant-remove" data-remove-variant="${v.id}" data-product="${p.id}" aria-label="Borrar variante">✕</button></td>
                </tr>
              `).join('') || '<tr><td colspan="4" class="admin-empty">Todavía no tiene talles/colores cargados.</td></tr>'}
            </tbody>
          </table>
          <form class="variant-add-form" data-variant-form="${p.id}">
            <input type="text" placeholder="Talle (ej: M)" data-variant-size maxlength="10">
            <input type="text" placeholder="Color (ej: Negro)" data-variant-color maxlength="30">
            <input type="text" inputmode="numeric" pattern="[0-9]*" placeholder="Stock" data-variant-new-stock required>
            <button type="submit" class="btn btn--outline">+ Agregar</button>
          </form>
        </div>
      </td>
    </tr>
    <tr class="details-row" data-details-for="${p.id}" hidden>
      <td colspan="9">
        <div class="details-panel">
          <div class="details-panel__block">
            <label class="details-panel__label" for="desc-${p.id}">Descripción</label>
            <textarea id="desc-${p.id}" class="details-textarea" data-description="${p.id}" placeholder="Ej: Legging de compresión suave, tela transpirable, ideal para entrenar o usar en el día a día.">${escapeHtml(p.description || '')}</textarea>
            <button type="button" class="btn btn--outline btn--small" data-save-description="${p.id}">Guardar descripción</button>
          </div>
          <div class="details-panel__block">
            <span class="details-panel__label">Guía de talles</span>
            <table class="size-chart-table" data-size-chart-table="${p.id}">
              <thead>
                <tr><th>Talle</th><th>Busto</th><th>Cintura</th><th>Cadera</th><th>Largo</th><th></th></tr>
              </thead>
              <tbody>
                ${(p.size_chart || []).map((row, i) => `
                  <tr data-row="${i}">
                    <td><input type="text" data-sc-field="size" value="${escapeHtml(row.size || '')}"></td>
                    <td><input type="text" data-sc-field="bust" value="${escapeHtml(row.bust || '')}"></td>
                    <td><input type="text" data-sc-field="waist" value="${escapeHtml(row.waist || '')}"></td>
                    <td><input type="text" data-sc-field="hip" value="${escapeHtml(row.hip || '')}"></td>
                    <td><input type="text" data-sc-field="length" value="${escapeHtml(row.length || '')}"></td>
                    <td><button type="button" class="variant-remove" data-remove-sc-row="${i}" aria-label="Borrar fila">✕</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="size-chart-actions">
              <button type="button" class="btn-link" data-add-sc-row="${p.id}">+ Agregar fila</button>
              <button type="button" class="btn btn--outline btn--small" data-save-sc="${p.id}">Guardar tabla de talles</button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  `;
  }).join('');

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

  tbody.querySelectorAll('[data-upload-gallery]').forEach(input => {
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const id = Number(input.dataset.uploadGallery);
      showToast('Subiendo foto...');

      try {
        const ext = file.name.split('.').pop();
        const path = `product-${id}-gallery-${Date.now()}.${ext}`;
        const url = await uploadImageViaApi(supabase, file, path);

        const product = data.find(p => p.id === id);
        const newImages = [...(product?.images || []), url];

        const { error: updateError } = await supabase
          .from('products')
          .update({ images: newImages })
          .eq('id', id);

        if (updateError) throw updateError;

        showToast('Foto agregada a la galería');
        loadProducts(supabase);
      } catch (err) {
        showToast('No se pudo subir la foto');
        console.error(err);
      }
    });
  });

  tbody.querySelectorAll('[data-remove-gallery]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.removeGallery);
      const index = Number(btn.dataset.index);
      const product = data.find(p => p.id === id);
      const newImages = (product?.images || []).filter((_, i) => i !== index);

      const { error: updateError } = await supabase
        .from('products')
        .update({ images: newImages })
        .eq('id', id);

      showToast(updateError ? 'No se pudo quitar la foto' : 'Foto quitada');
      if (!updateError) loadProducts(supabase);
    });
  });

  tbody.querySelectorAll('[data-toggle-variants]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggleVariants;
      const row = tbody.querySelector(`[data-variants-for="${id}"]`);
      if (row) row.hidden = !row.hidden;
    });
  });

  tbody.querySelectorAll('[data-variant-stock]').forEach(input => {
    input.addEventListener('change', async () => {
      const variantId = Number(input.dataset.variantStock);
      const newStock = Math.max(0, Number(input.value) || 0);
      input.value = newStock;
      const { error: updateError } = await supabase
        .from('product_variants')
        .update({ stock: newStock })
        .eq('id', variantId);
      showToast(updateError ? 'No se pudo actualizar el stock' : 'Stock actualizado');
    });
  });

  tbody.querySelectorAll('[data-remove-variant]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const variantId = Number(btn.dataset.removeVariant);
      const productId = Number(btn.dataset.product);
      const { error: deleteError } = await supabase
        .from('product_variants')
        .delete()
        .eq('id', variantId);

      showToast(deleteError ? 'No se pudo borrar' : 'Talle/color borrado');
      if (!deleteError) {
        loadProducts(supabase).then(() => {
          // Volvemos a abrir el panel de este producto después de recargar,
          // para no perder el lugar donde estaba trabajando.
          const row = tbody.querySelector(`[data-variants-for="${productId}"]`);
          if (row) row.hidden = false;
        });
      }
    });
  });

  tbody.querySelectorAll('[data-variant-form]').forEach(form => {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const productId = Number(form.dataset.variantForm);
      const size = form.querySelector('[data-variant-size]').value.trim() || null;
      const color = form.querySelector('[data-variant-color]').value.trim() || null;
      const stock = Math.max(0, Number(form.querySelector('[data-variant-new-stock]').value) || 0);

      if (!size && !color) {
        showToast('Cargá al menos un talle o un color');
        return;
      }

      const { error: insertError } = await supabase
        .from('product_variants')
        .insert({ product_id: productId, size, color, stock });

      if (insertError) {
        showToast(insertError.code === '23505' ? 'Esa combinación ya existe' : 'No se pudo agregar');
        console.error(insertError);
        return;
      }

      showToast('Talle/color agregado');
      loadProducts(supabase).then(() => {
        const row = tbody.querySelector(`[data-variants-for="${productId}"]`);
        if (row) row.hidden = false;
      });
    });
  });

  // ==================== DESCRIPCIÓN Y TABLA DE TALLES ====================
  tbody.querySelectorAll('[data-toggle-details]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggleDetails;
      const row = tbody.querySelector(`[data-details-for="${id}"]`);
      if (row) row.hidden = !row.hidden;
    });
  });

  tbody.querySelectorAll('[data-save-description]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.saveDescription);
      const textarea = tbody.querySelector(`[data-description="${id}"]`);
      const { error: updateError } = await supabase
        .from('products')
        .update({ description: textarea.value.trim() || null })
        .eq('id', id);
      showToast(updateError ? 'No se pudo guardar la descripción' : 'Descripción guardada');
    });
  });

  tbody.querySelectorAll('[data-add-sc-row]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.addScRow;
      const table = tbody.querySelector(`[data-size-chart-table="${id}"] tbody`);
      const rowIndex = table.children.length;
      const tr = document.createElement('tr');
      tr.dataset.row = rowIndex;
      tr.innerHTML = `
        <td><input type="text" data-sc-field="size"></td>
        <td><input type="text" data-sc-field="bust"></td>
        <td><input type="text" data-sc-field="waist"></td>
        <td><input type="text" data-sc-field="hip"></td>
        <td><input type="text" data-sc-field="length"></td>
        <td><button type="button" class="variant-remove" data-remove-sc-row="${rowIndex}" aria-label="Borrar fila">✕</button></td>
      `;
      table.appendChild(tr);
    });
  });

  // Delegamos el borrado de filas (las agregadas dinámicamente no tienen
  // su propio listener todavía).
  tbody.querySelectorAll('[data-size-chart-table]').forEach(table => {
    table.addEventListener('click', e => {
      const removeBtn = e.target.closest('[data-remove-sc-row]');
      if (removeBtn) removeBtn.closest('tr').remove();
    });
  });

  tbody.querySelectorAll('[data-save-sc]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.saveSc);
      const table = tbody.querySelector(`[data-size-chart-table="${id}"]`);
      const rows = [...table.querySelectorAll('tbody tr')].map(tr => ({
        size: tr.querySelector('[data-sc-field="size"]').value.trim(),
        bust: tr.querySelector('[data-sc-field="bust"]').value.trim(),
        waist: tr.querySelector('[data-sc-field="waist"]').value.trim(),
        hip: tr.querySelector('[data-sc-field="hip"]').value.trim(),
        length: tr.querySelector('[data-sc-field="length"]').value.trim(),
      })).filter(row => row.size || row.bust || row.waist || row.hip || row.length);

      const { error: updateError } = await supabase
        .from('products')
        .update({ size_chart: rows })
        .eq('id', id);
      showToast(updateError ? 'No se pudo guardar la tabla de talles' : 'Tabla de talles guardada');
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
