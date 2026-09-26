import React, { useState, useEffect } from 'react';
import { confirmDialog, useNotificationMessage } from '../components/NotificationCenter';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Coffee,
  Tag,
  Tags,
  Calendar,
  AlertCircle, 
  CheckCircle2, 
  X, 
  Percent, 
  Package,
  Upload,
  ClipboardList
} from 'lucide-react';
import SearchableSelect from '../components/SearchableSelect';
import DataTable from '../components/DataTable';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import PageHeader from '../components/PageHeader';
import Promotions from './Promotions';
import { productImageUrl } from '../utils/productImage';

const InventoryManagement = () => {
  const { can } = useAuth();
  const { isModuleEnabled } = useOrganization();
  const materialsEnabled = isModuleEnabled('recetas');
  const salesEnabled = isModuleEnabled('ventas');
  const navigate = useNavigate();
  const location = useLocation();
  // 'products' | 'offers' | 'promotions'. Respeta ?tab= al entrar (p. ej. desde el menú).
  const tabInicial = new URLSearchParams(location.search).get('tab');
  const [activeTab, setActiveTab] = useState(() => {
    if (tabInicial === 'promotions' && salesEnabled && can('ventas.promociones.ver')) return 'promotions';
    if (tabInicial === 'offers' && salesEnabled && can('inventario.descuentos.ver')) return 'offers';
    if (can('inventario.productos.ver')) return 'products';
    if (salesEnabled && can('inventario.descuentos.ver')) return 'offers';
    return 'promotions';
  });
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useNotificationMessage('error');
  const [success, setSuccess] = useNotificationMessage('success');

  // Modals state
  const [showProductModal, setShowProductModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showNewPromotion, setShowNewPromotion] = useState(false);
  
  // Quick Category add state (inline inside product modal)
  const [showQuickCategory, setShowQuickCategory] = useState(false);
  const [quickCategoryName, setQuickCategoryName] = useState('');
  const [quickCategoryError, setQuickCategoryError] = useNotificationMessage('error');

  // Editing items state
  const [editingProduct, setEditingProduct] = useState(null);
  
  // Forms state
  const [productForm, setProductForm] = useState({
    idCategoriaProducto: '',
    codigoProducto: '',
    nombreProducto: '',
    descripcionProducto: '',
    precio: '',
    stock: '',
    stockMinimo: '',
    requiereReceta: false,
    aceptaIngredientesExtra: false,
    esPack: false,
    idProductoBase: '',
    cantidadPack: ''
  });

  const [imagePreview, setImagePreview] = useState(null);
  const [imageBytes, setImageBytes] = useState(null); // base64 string
  
  const [discountForm, setDiscountForm] = useState({
    idProducto: '',
    porcentajeDescuento: '',
    fechaInicioDescuento: '',
    fechaTerminoDescuento: ''
  });

  // Styling helper for premium inputs to match the custom DDL style
  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    backgroundColor: '#ffffff',
    border: '1px solid var(--panel-border)',
    borderRadius: '10px',
    fontSize: '0.9rem',
    color: 'var(--text-main)',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s ease',
    height: '42px'
  };

  useEffect(() => {
    document.title = `Gestión de inventario - ${window.__SGAL_CONFIGURATION__?.branding?.nombreComercial || 'Sistema de gestión'}`;
    fetchData();
  }, []);

  // Cambia de pestaña al navegar con ?tab= (p. ej. el ítem "Promociones" del menú).
  useEffect(() => {
    const t = new URLSearchParams(location.search).get('tab');
    if (t === 'promotions' && salesEnabled && can('ventas.promociones.ver')) setActiveTab('promotions');
    else if (t === 'offers' && salesEnabled && can('inventario.descuentos.ver')) setActiveTab('offers');
    else if (t === 'products' && can('inventario.productos.ver')) setActiveTab('products');
  }, [location.search, salesEnabled, can]);

  useEffect(() => {
    const puedeProductos = can('inventario.productos.ver');
    if (activeTab === 'offers' && (!salesEnabled || !can('inventario.descuentos.ver'))) {
      setActiveTab(puedeProductos ? 'products' : 'promotions');
    }
    if (activeTab === 'promotions' && (!salesEnabled || !can('ventas.promociones.ver'))) {
      setActiveTab(puedeProductos ? 'products' : 'offers');
    }
  }, [activeTab, salesEnabled, can]);

  useEffect(() => {
    if (activeTab !== 'promotions' && showNewPromotion) setShowNewPromotion(false);
  }, [activeTab, showNewPromotion]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [prodRes, catRes, discRes] = await Promise.all([
        can('inventario.productos.ver') ? fetch('/api/product') : null,
        can('inventario.categorias.ver') ? fetch('/api/category') : null,
        salesEnabled && can('inventario.descuentos.ver') ? fetch('/api/discount') : null
      ]);

      if (prodRes && !prodRes.ok || catRes && !catRes.ok || discRes && !discRes.ok) {
        throw new Error('Error al cargar datos del servidor');
      }

      const prodData = prodRes ? await prodRes.json() : [];
      const catData = catRes ? await catRes.json() : [];
      const discData = discRes ? await discRes.json() : [];

      setProducts(prodData);
      setCategories(catData);
      setDiscounts(discData);
    } catch (e) {
      setError(e.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const reloadProducts = async () => {
    try {
      const res = await fetch('/api/product');
      if (res.ok) setProducts(await res.json());
    } catch (e) { console.error(e); }
  };

  const reloadCategories = async () => {
    try {
      const res = await fetch('/api/category');
      if (res.ok) setCategories(await res.json());
    } catch (e) { console.error(e); }
  };

  const reloadDiscounts = async () => {
    try {
      const res = await fetch('/api/discount');
      if (res.ok) setDiscounts(await res.json());
    } catch (e) { console.error(e); }
  };

  // Image upload handler
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
        setImageBytes(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearImage = () => {
    setImagePreview(null);
    setImageBytes(''); // empty string tells server to clear image
  };

  // Product CRUD
  const handleOpenCreateProduct = () => {
    setEditingProduct(null);
    setProductForm({
      idCategoriaProducto: '',
      codigoProducto: '',
      nombreProducto: '',
      descripcionProducto: '',
      precio: '',
      stock: '',
      stockMinimo: '',
      requiereReceta: false,
      aceptaIngredientesExtra: false,
      esPack: false,
      idProductoBase: '',
      cantidadPack: ''
    });
    setImagePreview(null);
    setImageBytes(null);
    setError('');
    setSuccess('');
    setShowProductModal(true);
  };

  const handleOpenEditProduct = (prod) => {
    setEditingProduct(prod);
    setProductForm({
      idCategoriaProducto: prod.idCategoriaProducto,
      codigoProducto: prod.codigoProducto || '',
      nombreProducto: prod.nombreProducto,
      descripcionProducto: prod.descripcionProducto || '',
      precio: prod.precio,
      stock: prod.stock !== null && prod.stock !== undefined ? prod.stock : '',
      stockMinimo: prod.stockMinimo ?? '',
      requiereReceta: Boolean(prod.requiereReceta),
      aceptaIngredientesExtra: Boolean(prod.aceptaIngredientesExtra),
      esPack: Boolean(prod.esPack),
      idProductoBase: prod.idProductoBase ?? '',
      cantidadPack: prod.cantidadPack ?? ''
    });
    setImagePreview(prod.tieneImagen ? productImageUrl(prod) : null);
    setImageBytes(null); // Keep unchanged unless modified
    setError('');
    setSuccess('');
    setShowProductModal(true);
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!productForm.nombreProducto.trim()) {
      setError('El nombre del producto es obligatorio');
      return;
    }
    if (!productForm.idCategoriaProducto) {
      setError('Debe seleccionar una categoría');
      return;
    }
    if (parseInt(productForm.precio) <= 0) {
      setError('El precio debe ser un número positivo');
      return;
    }
    if (productForm.esPack && (!productForm.idProductoBase || !(parseInt(productForm.cantidadPack) > 0))) {
      setError('Un pack requiere un producto base y una cantidad por pack mayor a cero.');
      return;
    }

    const payload = {
      idCategoriaProducto: parseInt(productForm.idCategoriaProducto),
      codigoProducto: productForm.codigoProducto.trim() || null,
      nombreProducto: productForm.nombreProducto,
      descripcionProducto: productForm.descripcionProducto || null,
      precio: parseInt(productForm.precio),
      stock: (productForm.esPack || productForm.requiereReceta) ? null : (productForm.stock !== '' ? parseInt(productForm.stock) : null),
      stockMinimo: (productForm.esPack || productForm.requiereReceta) ? null : (productForm.stockMinimo !== '' ? parseInt(productForm.stockMinimo) : null),
      requiereReceta: productForm.requiereReceta,
      aceptaIngredientesExtra: productForm.aceptaIngredientesExtra,
      esPack: productForm.esPack,
      idProductoBase: productForm.esPack ? parseInt(productForm.idProductoBase) : null,
      cantidadPack: productForm.esPack ? parseInt(productForm.cantidadPack) : null,
      imagenBase64: imageBytes
    };

    try {
      let res;
      if (editingProduct) {
        res = await fetch(`/api/product/${editingProduct.idProducto}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/api/product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.mensaje || 'Error al guardar el producto');
      }

      setSuccess(editingProduct ? 'Producto actualizado con éxito' : 'Producto creado con éxito');
      setShowProductModal(false);
      reloadProducts();
      setTimeout(() => setSuccess(''), 4000);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleToggleProductStatus = async (prod) => {
    try {
      const res = await fetch(`/api/product/${prod.idProducto}/status`, {
        method: 'PUT'
      });
      if (res.ok) {
        reloadProducts();
        setSuccess(`Producto ${prod.activo ? 'desactivado' : 'activado'} correctamente`);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const data = await res.json();
        setError(data.mensaje || 'Error al cambiar estado del producto');
      }
    } catch (e) {
      setError('Error al conectar con el servidor');
    }
  };

  // Quick Category Submit (from within Product modal)
  const handleQuickCategorySubmit = async (e) => {
    e.preventDefault();
    setQuickCategoryError('');

    if (!quickCategoryName.trim()) {
      setQuickCategoryError('El nombre es obligatorio');
      return;
    }

    try {
      const res = await fetch('/api/category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombreCategoriaProducto: quickCategoryName.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.mensaje || 'Error al crear categoría');
      }

      await reloadCategories();
      
      // Auto select the newly created category
      setProductForm(prev => ({
        ...prev,
        idCategoriaProducto: data.idCategoriaProducto
      }));

      // Reset quick form
      setQuickCategoryName('');
      setShowQuickCategory(false);
    } catch (err) {
      setQuickCategoryError(err.message);
    }
  };


  // Offer/Discount CRUD
  const handleOpenCreateDiscount = () => {
    setDiscountForm({
      idProducto: '',
      porcentajeDescuento: '',
      fechaInicioDescuento: new Date().toISOString().substring(0, 16), // Local datetime format
      fechaTerminoDescuento: ''
    });
    setError('');
    setSuccess('');
    setShowDiscountModal(true);
  };

  const handleDiscountSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!discountForm.idProducto) {
      setError('Debe seleccionar un producto');
      return;
    }
    const pct = parseFloat(discountForm.porcentajeDescuento);
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      setError('El descuento debe estar entre 1 y 100%');
      return;
    }
    if (!discountForm.fechaInicioDescuento) {
      setError('Debe ingresar la fecha de inicio');
      return;
    }

    const payload = {
      idProducto: parseInt(discountForm.idProducto),
      porcentajeDescuento: pct,
      fechaInicioDescuento: new Date(discountForm.fechaInicioDescuento).toISOString(),
      fechaTerminoDescuento: discountForm.fechaTerminoDescuento ? new Date(discountForm.fechaTerminoDescuento).toISOString() : null
    };

    try {
      const res = await fetch('/api/discount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.mensaje || 'Error al guardar la oferta');
      }

      setSuccess('Oferta creada con éxito');
      setShowDiscountModal(false);
      reloadDiscounts();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleDiscountStatus = async (disc) => {
    try {
      const res = await fetch(`/api/discount/${disc.idDescuentoProducto}/status`, {
        method: 'PUT'
      });
      if (res.ok) {
        reloadDiscounts();
        setSuccess(`Oferta ${disc.activo ? 'desactivada' : 'activada'} correctamente`);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const data = await res.json();
        setError(data.mensaje || 'Error al cambiar estado de la oferta');
      }
    } catch (e) {
      setError('Error al conectar con el servidor');
    }
  };

  const handleDeleteDiscount = async (disc) => {
    if (!await confirmDialog({ title: 'Eliminar oferta', message: 'Esta oferta se eliminará permanentemente.', confirmText: 'Eliminar', tone: 'danger' })) return;
    try {
      const res = await fetch(`/api/discount/${disc.idDescuentoProducto}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        reloadDiscounts();
        setSuccess('Oferta eliminada correctamente');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const data = await res.json();
        setError(data.mensaje || 'Error al eliminar oferta');
      }
    } catch (e) {
      setError('Error al conectar con el servidor');
    }
  };

  // Helper date formatter
  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch (e) {
      return dateStr;
    }
  };

  const pageTitle = activeTab === 'offers' ? 'Ofertas y descuentos' : activeTab === 'promotions' ? 'Promociones' : 'Productos';
  const PageIcon = activeTab === 'offers' ? Tag : activeTab === 'promotions' ? Tags : Package;

  return (
    <div className="animate-fade-in" style={{ width: '100%' }}>
      <PageHeader title={pageTitle} icon={PageIcon} actions={
        <div style={{ display: 'flex', gap: '12px' }}>
          {activeTab === 'products' ? can('inventario.productos.crear') && (
            <button
              onClick={handleOpenCreateProduct}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={16} />
              <span>Nuevo Producto</span>
            </button>
          ) : activeTab === 'offers' ? salesEnabled && can('inventario.descuentos.crear') && (
            <button
              onClick={handleOpenCreateDiscount}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Percent size={16} />
              <span>Nueva Oferta</span>
            </button>
          ) : activeTab === 'promotions' && !showNewPromotion ? salesEnabled && can('ventas.promociones.crear') && (
            <button
              onClick={() => setShowNewPromotion(true)}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={16} />
              <span>Nueva Promoción</span>
            </button>
          ) : null}
        </div>
      } />

      {/* Feedback Alerts */}
      {error && (
        <div className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderRadius: '10px', textTransform: 'none', marginBottom: '20px', width: '100%', boxSizing: 'border-box' }}>
          <AlertCircle size={18} />
          <span style={{ fontWeight: '500' }}>{error}</span>
        </div>
      )}
      {success && (
        <div className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderRadius: '10px', textTransform: 'none', marginBottom: '20px', width: '100%', boxSizing: 'border-box', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#065f46', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
          <CheckCircle2 size={18} />
          <span style={{ fontWeight: '500' }}>{success}</span>
        </div>
      )}

      {/* Loading Spinner */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
          <div style={{
            border: '4px solid rgba(212, 163, 115, 0.1)',
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            borderLeftColor: 'var(--primary-color)',
            animation: 'spin 1s linear infinite'
          }} />
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      ) : activeTab === 'promotions' ? (
        /* PROMOTIONS TAB */
        <Promotions embedded createNew={showNewPromotion} onFormOpenChange={setShowNewPromotion} />
      ) : activeTab === 'products' ? (
        /* PRODUCTS TAB */
        <DataTable
          rows={products}
          rowKey={p => p.idProducto}
          search={p => `${p.nombreProducto} ${p.codigoProducto || ''} ${p.nombreCategoriaProducto} ${p.descripcionProducto || ''}`}
          searchPlaceholder="Buscar producto…"
          filter={{ label: 'Categoría', options: [
            { value: 'all', label: 'Todas', test: () => true },
            ...categories.map(c => ({ value: String(c.idCategoriaProducto), label: c.nombreCategoriaProducto, test: p => p.idCategoriaProducto === c.idCategoriaProducto }))
          ] }}
          emptyMessage="No hay productos registrados en el inventario."
          columns={[
            { key: 'imagen', header: 'Imagen', width: '60px', cell: prod => (
              <div style={{ width: '44px', height: '44px', borderRadius: '8px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--panel-border)', overflow: 'hidden' }}>
                {prod.tieneImagen ? <img src={productImageUrl(prod)} alt={prod.nombreProducto} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Coffee size={20} color="var(--text-muted)" />}
              </div>
            ) },
            { key: 'producto', header: 'Producto', sortValue: p => p.nombreProducto, cell: prod => (
              <>
                <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{prod.nombreProducto}</div>
                {prod.descripcionProducto && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>{prod.descripcionProducto}</div>}
              </>
            ) },
            { key: 'sku', header: 'Código SKU', sortValue: p => p.codigoProducto || '', cell: prod => prod.codigoProducto || '—' },
            { key: 'categoria', header: 'Categoría', sortValue: p => p.nombreCategoriaProducto, cell: prod => <span className="badge" style={{ fontSize: '0.75rem', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>{prod.nombreCategoriaProducto}</span> },
            { key: 'precio', header: 'Precio Original', sortValue: p => p.precio, cell: prod => <span style={{ fontWeight: 600 }}>${prod.precio.toLocaleString('es-CL')}</span> },
            materialsEnabled && { key: 'receta', header: 'Receta', cell: prod => prod.requiereReceta ? <span className={`badge ${prod.tieneRecetaConfigurada ? 'badge-success' : 'badge-warning'}`}>{prod.tieneRecetaConfigurada ? 'Configurada' : 'Pendiente'}</span> : <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>No requiere</span> },
            { key: 'stock', header: 'Stock', sortValue: p => (p.stock ?? -1), cell: prod => prod.stock !== null ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: prod.stock <= (prod.stockMinimo ?? 5) ? '#b91c1c' : 'var(--text-main)' }}>
                <Package size={14} /><span>{prod.stock}</span>
                {prod.esPack && <span className="badge" style={{ fontSize: '0.66rem', background: '#eef2ff', color: '#4338ca' }} title={`Pack de ${prod.cantidadPack}× ${prod.nombreProductoBase || ''}`}>pack ×{prod.cantidadPack}</span>}
              </div>
            ) : <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{materialsEnabled ? 'Usa receta' : 'Sin stock configurado'}</span> },
            { key: 'estado', header: 'Estado', sortValue: p => (p.activo ? 1 : 0), cell: prod => <span className={`badge ${prod.activo ? 'badge-success' : 'badge-danger'}`}>{prod.activo ? 'Activo' : 'Desactivado'}</span> },
            { key: 'acciones', header: 'Acciones', align: 'right', cell: prod => (
              <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                {materialsEnabled && prod.requiereReceta && can('recetas.editar') && <button onClick={() => navigate(`/inventory/products/${prod.idProducto}/recipe`)} className="btn btn-primary" style={{ padding: '4px', borderRadius: '6px' }} title={prod.tieneRecetaConfigurada ? 'Editar receta' : 'Crear receta'}><ClipboardList size={14} /></button>}
                {can('inventario.productos.editar') && <button onClick={() => handleOpenEditProduct(prod)} className="btn btn-secondary" style={{ padding: '4px', borderRadius: '6px' }} title="Editar Producto"><Edit2 size={14} /></button>}
                {can('inventario.productos.estado.modificar') && <button onClick={() => handleToggleProductStatus(prod)} className={`btn ${prod.activo ? 'btn-danger' : 'btn-primary'}`} style={{ padding: '4px', borderRadius: '6px' }} title={prod.activo ? 'Desactivar' : 'Activar'}>{prod.activo ? <Trash2 size={14} /> : <CheckCircle2 size={14} />}</button>}
              </div>
            ) }
          ].filter(Boolean)}
        />
      ) : (
        /* OFFERS TAB */
        <DataTable
          rows={discounts}
          rowKey={d => d.idDescuentoProducto}
          search={d => d.nombreProducto}
          searchPlaceholder="Buscar oferta…"
          filter={{ label: 'Estado', options: [
            { value: 'all', label: 'Todas', test: () => true },
            { value: 'active', label: 'Vigentes', test: d => d.activo },
            { value: 'inactive', label: 'Inactivas', test: d => !d.activo }
          ] }}
          emptyMessage="No hay ofertas o descuentos vigentes registrados."
          columns={[
            { key: 'producto', header: 'Producto', sortValue: d => d.nombreProducto, cell: d => <span style={{ fontWeight: 600 }}>{d.nombreProducto}</span> },
            { key: 'precio', header: 'Precio Original', sortValue: d => d.precioOriginal, cell: d => `$${d.precioOriginal.toLocaleString('es-CL')}` },
            { key: 'descuento', header: 'Descuento', sortValue: d => d.porcentajeDescuento, cell: d => <span className="badge" style={{ fontWeight: 700, backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#b91c1c', border: '1px solid rgba(239, 68, 68, 0.2)' }}>-{d.porcentajeDescuento}%</span> },
            { key: 'oferta', header: 'Precio Oferta', cell: d => <span style={{ fontWeight: 700, color: '#15803d' }}>${(d.precioOriginal - (d.precioOriginal * d.porcentajeDescuento) / 100).toLocaleString('es-CL')}</span> },
            { key: 'vigencia', header: 'Vigencia', cell: d => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <span><strong>Inicio:</strong> {formatDateTime(d.fechaInicioDescuento)}</span>
                <span><strong>Fin:</strong> {d.fechaTerminoDescuento ? formatDateTime(d.fechaTerminoDescuento) : 'Indefinido'}</span>
              </div>
            ) },
            { key: 'estado', header: 'Estado', sortValue: d => (d.activo ? 1 : 0), cell: d => <span className={`badge ${d.activo ? 'badge-success' : 'badge-danger'}`}>{d.activo ? 'Vigente' : 'Inactiva'}</span> },
            { key: 'acciones', header: 'Acciones', align: 'right', cell: d => (
              <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                {can('inventario.descuentos.estado.modificar') && <button onClick={() => handleToggleDiscountStatus(d)} className={`btn ${d.activo ? 'btn-secondary' : 'btn-primary'}`} style={{ padding: '4px', borderRadius: '6px' }} title={d.activo ? 'Pausar Oferta' : 'Activar Oferta'}><Calendar size={14} /></button>}
                {can('inventario.descuentos.eliminar') && <button onClick={() => handleDeleteDiscount(d)} className="btn btn-danger" style={{ padding: '4px', borderRadius: '6px' }} title="Eliminar"><Trash2 size={14} /></button>}
              </div>
            ) }
          ]}
        />
      )}

      {/* MODAL: Crear/Editar Producto */}
      {showProductModal && (
        <div className="modal-overlay">
          {/* CRITICAL: No click-outside close handler to prevent accidental closures */}
          <div className="modal-content" style={{ maxWidth: '540px', position: 'relative', padding: '30px' }}>
            <button 
              type="button" 
              className="btn" 
              style={{ position: 'absolute', right: '20px', top: '20px', padding: '6px', background: 'none' }} 
              onClick={() => setShowProductModal(false)}
            >
              <X size={20} color="var(--text-muted)" />
            </button>
            
            <h3 style={{ fontSize: '1.5rem', marginBottom: '8px', fontWeight: '700' }} className="text-solid">
              {editingProduct ? 'Editar Producto' : 'Crear Producto'}
            </h3>

            <form onSubmit={handleProductSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '28px' }}>
                
                {/* 1. Nombre del Producto (PRIMERO) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Nombre del Producto *</label>
                  <input
                    type="text"
                    value={productForm.nombreProducto}
                    onChange={(e) => setProductForm(prev => ({ ...prev, nombreProducto: e.target.value }))}
                    style={inputStyle}
                    maxLength={150}
                    required
                  />
                </div>

                {/* 2. Categoría (SEGUNDO) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Categoría *</label>
                  <SearchableSelect
                    options={categories.filter(c => c.activo).map(c => ({ value: c.idCategoriaProducto, label: c.nombreCategoriaProducto }))}
                    value={productForm.idCategoriaProducto}
                    onChange={(val) => setProductForm(prev => ({ ...prev, idCategoriaProducto: val }))}
                    noOptionsMessage="No hay categorías con ese nombre"
                    customActionButton={can('inventario.categorias.crear') ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setShowQuickCategory(true)}
                        style={{ padding: '0 12px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px' }}
                        data-tooltip="Nueva Categoría Rápida"
                      >
                        <Plus size={18} />
                      </button>
                    ) : null}
                  />
                </div>

                {/* Código SKU opcional del producto */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Código SKU <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span></label>
                  <input
                    type="text"
                    value={productForm.codigoProducto}
                    onChange={(e) => setProductForm(prev => ({ ...prev, codigoProducto: e.target.value.toUpperCase() }))}
                    style={inputStyle}
                    maxLength={50}
                  />
                </div>

                {/* 3. Precio y Stock Inicial (TERCERO) */}
                <div className="modal-grid-2">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Precio (CLP) *</label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <span style={{ position: 'absolute', left: '14px', fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: '600', zIndex: 5 }}>$</span>
                      <input
                        type="number"
                        value={productForm.precio}
                        onChange={(e) => setProductForm(prev => ({ ...prev, precio: e.target.value }))}
                        style={{ ...inputStyle, paddingLeft: '28px' }}
                        min={1}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Stock inicial <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(por defecto 0)</span></label>
                    <input
                      type="number"
                      value={productForm.esPack ? '' : productForm.stock}
                      onChange={(e) => setProductForm(prev => ({ ...prev, stock: e.target.value }))}
                      style={inputStyle}
                      min={0}
                      placeholder={productForm.esPack ? 'Se controla en el producto base' : undefined}
                      disabled={(materialsEnabled && productForm.requiereReceta) || productForm.esPack}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Stock mínimo <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(alerta de bajo stock; vacío usa el umbral por defecto)</span></label>
                  <input
                    type="number"
                    value={(productForm.esPack || productForm.requiereReceta) ? '' : productForm.stockMinimo}
                    onChange={(e) => setProductForm(prev => ({ ...prev, stockMinimo: e.target.value }))}
                    style={inputStyle}
                    min={0}
                    placeholder="Umbral por defecto"
                    disabled={(materialsEnabled && productForm.requiereReceta) || productForm.esPack}
                  />
                </div>

                {/* Pack: el producto representa N unidades de un producto base */}
                {!productForm.requiereReceta && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px 14px', border: '1px solid var(--panel-border)', borderRadius: '10px', background: '#f8fafc' }}>
                    <input
                      type="checkbox"
                      checked={productForm.esPack}
                      onChange={(e) => setProductForm(prev => ({ ...prev, esPack: e.target.checked, stock: e.target.checked ? '' : prev.stock }))}
                      style={{ width: '17px', height: '17px', accentColor: 'var(--primary-color)' }}
                    />
                    <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>Este producto es un pack de otro producto (p. ej. sixpack, bandeja)</span>
                  </label>
                )}

                {productForm.esPack && (
                  <div className="modal-grid-2">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Producto base *</label>
                      <SearchableSelect
                        options={products.filter(p => p.activo && !p.esPack && p.idProducto !== editingProduct?.idProducto)
                          .map(p => ({ value: p.idProducto, label: p.nombreProducto }))}
                        value={productForm.idProductoBase}
                        onChange={(val) => setProductForm(prev => ({ ...prev, idProductoBase: val }))}
                        noOptionsMessage="No hay productos base disponibles"
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Unidades del base por pack *</label>
                      <input
                        type="number"
                        value={productForm.cantidadPack}
                        onChange={(e) => setProductForm(prev => ({ ...prev, cantidadPack: e.target.value }))}
                        style={inputStyle}
                        min={1}
                        placeholder="Ej: 6"
                      />
                    </div>
                  </div>
                )}

                {materialsEnabled && !productForm.esPack && <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px 14px', border: '1px solid var(--panel-border)', borderRadius: '10px', background: '#f8fafc' }}>
                  <input
                    type="checkbox"
                    checked={productForm.requiereReceta}
                    onChange={(e) => setProductForm(prev => ({ ...prev, requiereReceta: e.target.checked, stock: e.target.checked ? '' : prev.stock }))}
                    style={{ width: '17px', height: '17px', accentColor: 'var(--primary-color)' }}
                  />
                  <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>Este producto requiere receta para su preparación</span>
                </label>}

                {materialsEnabled && <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px 14px', border: '1px solid var(--panel-border)', borderRadius: '10px', background: '#f8fafc' }}>
                  <input
                    type="checkbox"
                    checked={productForm.aceptaIngredientesExtra}
                    onChange={(e) => setProductForm(prev => ({ ...prev, aceptaIngredientesExtra: e.target.checked }))}
                    style={{ width: '17px', height: '17px', accentColor: 'var(--primary-color)' }}
                  />
                  <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>Este producto acepta ingredientes extra en la venta</span>
                </label>}

                {/* 4. Imagen del Producto (CUARTO - NEW!) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Imagen del Producto</label>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    {/* Upload box */}
                    <label style={{
                      flex: 1,
                      height: '42px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      border: '1.5px dashed var(--panel-border)',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: '600',
                      color: 'var(--text-muted)',
                      backgroundColor: '#f8fafc',
                      transition: 'all 0.2s ease',
                      boxSizing: 'border-box'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--primary-color)'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--panel-border)'}
                    >
                      <Upload size={16} />
                      <span>Seleccionar Imagen</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleImageChange} 
                        style={{ display: 'none' }} 
                      />
                    </label>

                    {imagePreview && (
                      <button
                        type="button"
                        onClick={handleClearImage}
                        className="btn btn-danger"
                        style={{ padding: '0 12px', height: '42px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        Quitar
                      </button>
                    )}
                  </div>

                  {/* Image Preview Box */}
                  {imagePreview && (
                    <div style={{ 
                      marginTop: '8px', 
                      display: 'flex', 
                      justifyContent: 'center', 
                      alignItems: 'center',
                      padding: '10px',
                      border: '1px solid var(--panel-border)',
                      borderRadius: '12px',
                      backgroundColor: '#f8fafc',
                      height: '120px'
                    }}>
                      <img 
                        src={imagePreview} 
                        alt="Vista Previa" 
                        style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', borderRadius: '6px' }} 
                      />
                    </div>
                  )}
                </div>

                {/* 5. Descripción (QUINTO) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Descripción</label>
                  <textarea
                    value={productForm.descripcionProducto}
                    onChange={(e) => setProductForm(prev => ({ ...prev, descripcionProducto: e.target.value }))}
                    style={{ ...inputStyle, minHeight: '80px', height: 'auto', resize: 'vertical', padding: '10px 14px' }}
                    maxLength={300}
                  />
                </div>

              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '12px', borderRadius: '10px' }}
                  onClick={() => setShowProductModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '12px', borderRadius: '10px' }}
                >
                  {editingProduct ? 'Actualizar Producto' : 'Crear Producto'}
                </button>
              </div>
            </form>

            {/* QUICK CATEGORY FORM (Sub-overlay inside product modal) */}
            {showQuickCategory && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(255, 255, 255, 0.98)',
                borderRadius: '20px',
                zIndex: 1200,
                padding: '30px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
              }}>
                <h4 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '8px', color: 'var(--primary-color)' }}>
                  Añadir Nueva Categoría
                </h4>

                {quickCategoryError && (
                  <div className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '6px', textTransform: 'none', marginBottom: '16px' }}>
                    <AlertCircle size={14} />
                    <span>{quickCategoryError}</span>
                  </div>
                )}

                <form onSubmit={handleQuickCategorySubmit}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-main)' }}>Nombre de la Categoría</label>
                      <input
                        type="text"
                        value={quickCategoryName}
                        onChange={(e) => setQuickCategoryName(e.target.value)}
                        style={inputStyle}
                        maxLength={100}
                        autoFocus
                        required
                      />
                    </div>

                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ flex: 1, padding: '10px', borderRadius: '10px' }}
                      onClick={() => {
                        setShowQuickCategory(false);
                        setQuickCategoryName('');
                        setQuickCategoryError('');
                      }}
                    >
                      Volver
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ flex: 1, padding: '10px', borderRadius: '10px' }}
                    >
                      Guardar y Seleccionar
                    </button>
                  </div>
                </form>
              </div>
            )}

          </div>
        </div>
      )}

      {/* MODAL: Crear Oferta */}
      {showDiscountModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '460px', padding: '30px' }}>
            <button 
              type="button" 
              className="btn" 
              style={{ position: 'absolute', right: '20px', top: '20px', padding: '6px', background: 'none' }} 
              onClick={() => setShowDiscountModal(false)}
            >
              <X size={20} color="var(--text-muted)" />
            </button>

            <h3 style={{ fontSize: '1.5rem', marginBottom: '8px', fontWeight: '700' }} className="text-solid">
              Crear Oferta Especial
            </h3>

            <form onSubmit={handleDiscountSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '28px' }}>
                
                {/* Searchable select product */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Producto *</label>
                  <SearchableSelect
                    options={products.filter(p => p.activo).map(p => ({ value: p.idProducto, label: `${p.nombreProducto} ($${p.precio.toLocaleString('es-CL')})` }))}
                    value={discountForm.idProducto}
                    onChange={(val) => setDiscountForm(prev => ({ ...prev, idProducto: val }))}
                    noOptionsMessage="No hay productos disponibles con ese nombre"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Porcentaje de Descuento (1-100) *</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <span style={{ position: 'absolute', left: '14px', fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: '600', zIndex: 5 }}>%</span>
                    <input
                      type="number"
                      value={discountForm.porcentajeDescuento}
                      onChange={(e) => setDiscountForm(prev => ({ ...prev, porcentajeDescuento: e.target.value }))}
                      style={{ ...inputStyle, paddingLeft: '28px' }}
                      min={1}
                      max={100}
                      required
                    />
                  </div>
                </div>

                <div className="modal-grid-2">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Fecha Inicio *</label>
                    <input
                      type="datetime-local"
                      value={discountForm.fechaInicioDescuento}
                      onChange={(e) => setDiscountForm(prev => ({ ...prev, fechaInicioDescuento: e.target.value }))}
                      style={{ ...inputStyle, padding: '8px' }}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Fecha Término (Opcional)</label>
                    <input
                      type="datetime-local"
                      value={discountForm.fechaTerminoDescuento}
                      onChange={(e) => setDiscountForm(prev => ({ ...prev, fechaTerminoDescuento: e.target.value }))}
                      style={{ ...inputStyle, padding: '8px' }}
                    />
                  </div>
                </div>

              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '12px', borderRadius: '10px' }}
                  onClick={() => setShowDiscountModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '12px', borderRadius: '10px' }}
                >
                  Crear Oferta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


    </div>
  );
};

export default InventoryManagement;
