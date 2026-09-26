// URL de la imagen de un producto servida por el backend (GET api/product/{id}/image).
// El listado de productos ya no incluye la imagen en base64 (eso hacía la carga muy lenta):
// solo trae `tieneImagen`, y cada imagen se descarga bajo demanda y se cachea en el navegador.
// La fecha de modificación se usa como cache-buster para refrescar la imagen cuando cambia.
export const productImageUrl = (prod) => {
  if (!prod?.tieneImagen) return null;
  const version = prod.fechaModificacion || prod.fechaIngreso || '';
  const v = version ? `?v=${encodeURIComponent(version)}` : '';
  return `/api/product/${prod.idProducto}/image${v}`;
};

// URL de la imagen de una materia prima (GET raw-materials/{id}/image). La frescura la
// asegura el ETag del backend (revalidación), por lo que no necesita cache-buster.
export const rawMaterialImageUrl = (material) =>
  material?.tieneImagen ? `/api/inventory-configuration/raw-materials/${material.idMateriaPrima}/image` : null;
