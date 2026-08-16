// Fuente única de verdad para el catálogo.
// El frontend la usa para renderizar productos; el backend la usa para
// calcular precios reales al crear una preferencia de pago (nunca se
// confía en el precio que pueda enviar el navegador).
export const PRODUCTS = [
  { id: 1, name: 'Conjunto Training Coral', cat: 'conjuntos', price: 42999, oldPrice: 54999, badge: 'OFERTA', color: 'linear-gradient(135deg,#ff9a8b,#ff3d7f)' },
  { id: 2, name: 'Legging Sculpt Negro', cat: 'leggings', price: 24999, oldPrice: null, badge: 'NUEVO', color: 'linear-gradient(135deg,#2c2733,#4a4358)' },
  { id: 3, name: 'Top Cropped Fucsia', cat: 'tops', price: 15999, oldPrice: null, badge: null, color: 'linear-gradient(135deg,#ff3d7f,#c9184a)' },
  { id: 4, name: 'Campera Running Reflectante', cat: 'running', price: 38999, oldPrice: null, badge: 'NUEVO', color: 'linear-gradient(135deg,#f6d365,#fda085)' },
  { id: 5, name: 'Legging Yoga Lavanda', cat: 'yoga', price: 26999, oldPrice: 32999, badge: 'OFERTA', color: 'linear-gradient(135deg,#a18cd1,#fbc2eb)' },
  { id: 6, name: 'Conjunto Yoga Bloom', cat: 'conjuntos', price: 45999, oldPrice: null, badge: null, color: 'linear-gradient(135deg,#84fab0,#8fd3f4)' },
  { id: 7, name: 'Top Deportivo Sport Bra', cat: 'tops', price: 13999, oldPrice: null, badge: null, color: 'linear-gradient(135deg,#ffdde1,#ee9ca7)' },
  { id: 8, name: 'Short Running Alta Compresión', cat: 'running', price: 19999, oldPrice: null, badge: null, color: 'linear-gradient(135deg,#fa709a,#fee140)' },
  { id: 9, name: 'Legging Estampado Animal Print', cat: 'leggings', price: 27999, oldPrice: null, badge: 'NUEVO', color: 'linear-gradient(135deg,#e2b0ff,#9f44d3)' },
  { id: 10, name: 'Conjunto Studio Rosa', cat: 'conjuntos', price: 47999, oldPrice: 56999, badge: 'OFERTA', color: 'linear-gradient(135deg,#ff758c,#ff7eb3)' },
  { id: 11, name: 'Top Halter Yoga', cat: 'yoga', price: 16999, oldPrice: null, badge: null, color: 'linear-gradient(135deg,#89f7fe,#66a6ff)' },
  { id: 12, name: 'Campera Rompeviento Running', cat: 'running', price: 41999, oldPrice: null, badge: null, color: 'linear-gradient(135deg,#30cfd0,#330867)' },
];
