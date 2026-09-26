// Ordena los productos del catálogo del Punto de venta según el campo y la dirección
// configurados (solo se usa cuando la vista NO está agrupada por categoría).
// Campos: 'nombre' | 'precio' | 'vendidos' | 'stock'. Dirección: 'asc' | 'desc'.
export const sortPosProducts = (list, field = 'nombre', direction = 'asc') => {
  const dir = direction === 'desc' ? -1 : 1;
  const copy = [...list];
  if (field === 'nombre') {
    copy.sort((a, b) => dir * a.nombreProducto.localeCompare(b.nombreProducto, 'es', { sensitivity: 'base' }));
    return copy;
  }
  // "Sin control de stock" (stock === null) se trata como el valor más bajo.
  const value = (p) => {
    switch (field) {
      case 'precio': return Number(p.precio) || 0;
      case 'vendidos': return Number(p.vecesVendido) || 0;
      case 'stock': return p.stock == null ? Number.NEGATIVE_INFINITY : Number(p.stock);
      default: return 0;
    }
  };
  copy.sort((a, b) => {
    const diff = value(a) - value(b);
    // Empate: se ordena por nombre para un resultado estable y legible.
    return diff !== 0 ? dir * diff : a.nombreProducto.localeCompare(b.nombreProducto, 'es', { sensitivity: 'base' });
  });
  return copy;
};

export const POS_SORT_FIELDS = [
  { value: 'nombre', label: 'Nombre' },
  { value: 'precio', label: 'Precio' },
  { value: 'vendidos', label: 'Veces vendido' },
  { value: 'stock', label: 'Stock' }
];
